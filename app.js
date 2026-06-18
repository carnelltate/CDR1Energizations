/*
File: /site/app.js
Purpose: DC3 Construction Equipment Search frontend
*/
console.log("APP JS LOADED");

// =========================================
// GITHUB PAGES DATA CONFIG
// Update GITHUB_OWNER / GITHUB_REPO if you fork or rename the repo.
// =========================================
const GITHUB_OWNER    = "carnelltate";
const GITHUB_REPO     = "CDR1Energizations";
const GITHUB_BRANCH   = "main";
const GITHUB_FILE_PATH = "equipment_data.json";
const GITHUB_RAW_URL  =
    `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_FILE_PATH}`;
const GITHUB_API_URL  =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`;
const state = {
    rawData: null,
    activeBuilding: "DC1",
    equipment: [],
    issues: {},
    phaseColumns: [],
    filteredEquipment: [],
    searchTokens: [],

    filters: {
        equipmentId: "",
        area: "",
        equipmentType: ""
    }
};

const dom = {
    errorBanner: document.getElementById("error-banner"),
    successBanner: document.getElementById("success-banner"),
    buildingTabs: document.querySelectorAll(".building-tab"),

    generatedAt: document.getElementById("generated-at"),
    totalEquipment: document.getElementById("total-equipment"),

    searchInput: document.getElementById("search-input"),
    searchBtn: document.getElementById("search-btn"),
    clearSearchBtn: document.getElementById("clear-search-btn"),

    equipmentFilter: document.getElementById("equipment-filter"),
    areaFilter: document.getElementById("area-filter"),
    typeFilter: document.getElementById("type-filter"),
    clearFiltersBtn: document.getElementById("clear-filters-btn"),

    checklistHead: document.getElementById("checklist-head"),
    checklistBody: document.getElementById("checklist-body"),

    checklistCount: document.getElementById("checklist-count"),
    issuesCount: document.getElementById("issues-count"),

    resultsSummary: document.getElementById("results-summary"),
    issuesSummary: document.getElementById("issues-summary"),
    notFoundSummary: document.getElementById("not-found-summary"),

    issuesContainer: document.getElementById("issues-container"),

    notFoundSection: document.getElementById("not-found-section"),
    notFound: document.getElementById("not-found"),

    emptyState: document.getElementById("empty-state"),

    copyBtn: document.getElementById("copy-btn"),
    downloadBtn: document.getElementById("download-btn"),

    reloadBtn: document.getElementById("reload-btn"),

    uploadJsonBtn: document.getElementById("upload-json-btn"),
    jsonUpload: document.getElementById("json-upload")
};

document.addEventListener("DOMContentLoaded", async () => {

    bindEvents();

    await loadDefaultData();
});

async function loadDefaultData() {

    try {

        // Fetch directly from GitHub raw content — works on GitHub Pages
        // Add cache-busting so browsers don't serve stale data after an upload
        const url = `${GITHUB_RAW_URL}?t=${Date.now()}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(
                "Failed to load equipment data from GitHub"
            );
        }

        const data = await response.json();

        // Support both combined multi-building format and legacy single-building format
        if (data.buildings) {
            state.rawData = data;
            // Load the active building (default DC1, or first available)
            const available = Object.keys(data.buildings);
            if (!available.includes(state.activeBuilding)) {
                state.activeBuilding = available[0];
            }
            // Update tab UI to match active building
            dom.buildingTabs.forEach(tab => {
                tab.classList.toggle(
                    "active",
                    tab.dataset.building === state.activeBuilding
                );
            });
            loadBuildingData(state.activeBuilding);
        } else {
            // Legacy single-building format — treat as DC3 data
            state.rawData = null;
            state.activeBuilding = "DC1";
            loadDataIntoState(data);
        }

    } catch (error) {

        console.error(error);

        showError(
            "Could not load equipment data. Check your connection or upload a JSON file."
        );
    }
}

function loadBuildingData(buildingKey) {
    if (!state.rawData || !state.rawData.buildings) {
        // Legacy single-building format — tabs other than the active one
        // can't switch until a combined multi-building JSON is uploaded.
        if (buildingKey !== state.activeBuilding) {
            showError(
                `${buildingKey} data is not available. Run the Python export script to generate a combined JSON with all three buildings, then upload it.`
            );
        }
        return;
    }

    const buildingData = state.rawData.buildings[buildingKey];
    if (!buildingData) {
        showError(`No data found for ${buildingKey} in the current JSON file.`);
        return;
    }

    state.activeBuilding = buildingKey;

    // Update active tab UI
    dom.buildingTabs.forEach(tab => {
        tab.classList.toggle(
            "active",
            tab.dataset.building === buildingKey
        );
    });

    // Deactivate GNG tab and restore standard panels when switching to a building tab
    const gngTabBtn = document.getElementById("gng-tab-btn");
    if (gngTabBtn) {
        gngTabBtn.classList.remove("active");
    }
    const gngPanel = document.getElementById("gng-panel");
    if (gngPanel) {
        gngPanel.classList.add("hidden");
    }
    // Restore standard panels to default display
    document.querySelectorAll(".search-panel, .filter-panel, .checklist-panel, .issues-panel").forEach(panel => {
        panel.style.display = "";
    });

    loadDataIntoState(buildingData);
}

function loadDataIntoState(data) {

    validateData(data);

    hideError();
    hideSuccess();

    // NOTE: Do NOT overwrite state.rawData here.
    // state.rawData holds the full multi-building payload needed for tab switching.
    // It is only set in loadDefaultData() and handleJsonUpload().

    state.equipment =
        Array.isArray(data.equipment)
            ? data.equipment
            : [];

    state.issues =
        data.issues || {};

    state.phaseColumns =
        data.metadata?.phase_columns || [];

    state.filteredEquipment =
        [...state.equipment];

    state.searchTokens = [];

    state.filters = {
        equipmentId: "",
        area: "",
        equipmentType: ""
    };

    resetFilterInputs();

    renderMetadata(data.metadata || {});

    populateFilters();

    applyFiltersAndRender();
}

function validateData(data) {

    if (!data || typeof data !== "object") {
        throw new Error("Invalid JSON");
    }

    if (!Array.isArray(data.equipment)) {
        throw new Error(
            "Missing equipment array"
        );
    }
}

function bindEvents() {

    // Building tab switching
    dom.buildingTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            if (tab.dataset.building) {
                loadBuildingData(tab.dataset.building);
            }
        });
    });

    // GNG Readiness tab activation
    document.getElementById("gng-tab-btn").addEventListener("click", activateGNGTab);

    dom.searchBtn.addEventListener(
        "click",
        executeSearch
    );

    dom.clearSearchBtn.addEventListener(
        "click",
        clearSearch
    );

    dom.searchInput.addEventListener(
        "keydown",
        event => {

            if (
                event.ctrlKey &&
                event.key === "Enter"
            ) {
                executeSearch();
            }
        }
    );

    dom.equipmentFilter.addEventListener(
        "input",
        event => {

            state.filters.equipmentId =
                event.target.value;

            applyFiltersAndRender();
        }
    );

    dom.areaFilter.addEventListener(
        "change",
        event => {

            state.filters.area =
                event.target.value;

            applyFiltersAndRender();
        }
    );

    dom.typeFilter.addEventListener(
        "change",
        event => {

            state.filters.equipmentType =
                event.target.value;

            applyFiltersAndRender();
        }
    );

    dom.clearFiltersBtn.addEventListener(
        "click",
        clearFilters
    );

    dom.copyBtn.addEventListener(
        "click",
        copyVisibleTable
    );

    dom.downloadBtn.addEventListener(
        "click",
        downloadCsv
    );

    dom.reloadBtn.addEventListener(
        "click",
        loadDefaultData
    );

    dom.uploadJsonBtn.addEventListener(
        "click",
        () => {
            dom.jsonUpload.click();
        }
    );

    dom.jsonUpload.addEventListener(
        "change",
        handleJsonUpload
    );
}

async function handleJsonUpload(event) {

    const file = event.target.files[0];

    if (!file) {
        return;
    }

    // Prompt for GitHub Personal Access Token
    // The token needs repo scope (Contents: Read and Write)
    const token = prompt(
        "Enter your GitHub Personal Access Token to update data for all users:\n\n" +
        "Create one at: github.com/settings/tokens/new\n" +
        "Required scope: Contents (Read and Write)"
    );

    if (!token || !token.trim()) {
        event.target.value = "";
        return;
    }

    dom.uploadJsonBtn.disabled = true;

    try {

        // Read and validate the file first
        const text = await file.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch {
            showError("Invalid JSON — file could not be parsed.");
            return;
        }

        if (!Array.isArray(data.equipment) && !data.buildings) {
            showError("Invalid file: expected either a combined multi-building JSON (with 'buildings' key) or a single-building JSON (with 'equipment' array).");
            return;
        }

        if (data.buildings && typeof data.buildings !== "object") {
            showError("Invalid file: 'buildings' must be an object.");
            return;
        }

        // For combined multi-building format, metadata lives inside each building — no root-level metadata required.
        // For legacy single-building format, root-level metadata is expected.
        if (!data.buildings && (!data.metadata || typeof data.metadata !== "object")) {
            showError("Invalid file: missing metadata object.");
            return;
        }

        // Get the current file SHA (required by GitHub API to update a file)
        const shaResponse = await fetch(
            `${GITHUB_API_URL}?ref=${GITHUB_BRANCH}`,
            {
                headers: {
                    "Authorization": `Bearer ${token.trim()}`,
                    "Accept": "application/vnd.github+json"
                }
            }
        );

        if (!shaResponse.ok) {
            if (shaResponse.status === 401) {
                showError("Invalid GitHub token. Check your token and try again.");
            } else if (shaResponse.status === 404) {
                showError("File not found in repo. Check GITHUB_FILE_PATH in app.js.");
            } else {
                showError(`GitHub API error: ${shaResponse.status}`);
            }
            return;
        }

        const shaData = await shaResponse.json();
        const currentSha = shaData.sha;

        // Encode file content as base64
        const base64Content = btoa(
            unescape(encodeURIComponent(text))
        );

        // Commit the updated file via GitHub API
        const commitResponse = await fetch(
            GITHUB_API_URL,
            {
                method: "PUT",
                headers: {
                    "Authorization": `Bearer ${token.trim()}`,
                    "Accept": "application/vnd.github+json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: `Update equipment_data.json (${new Date().toISOString()})`,
                    content: base64Content,
                    sha: currentSha,
                    branch: GITHUB_BRANCH
                })
            }
        );

        if (!commitResponse.ok) {
            const errData = await commitResponse.json().catch(() => ({}));
            showError(
                `Upload failed: ${errData.message || commitResponse.status}`
            );
            return;
        }

        // Load the new data into the current session immediately
        if (data.buildings) {
            state.rawData = data;
            const available = Object.keys(data.buildings);
            if (!available.includes(state.activeBuilding)) {
                state.activeBuilding = available[0];
            }
            loadBuildingData(state.activeBuilding);
        } else {
            loadDataIntoState(data);
        }

        showSuccess(
            "Data committed to GitHub. All users will see the update after GitHub Pages rebuilds (~30–60 seconds)."
        );

    } catch (err) {

        console.error(err);
        showError("Network error during upload.");

    } finally {

        dom.uploadJsonBtn.disabled = false;
        event.target.value = "";
    }
}

function parseSearchInput(value) {

    if (!value.trim()) {
        return [];
    }

    return [
        ...new Set(
            value
                .split(/[\s,\t\r\n,]+/)
                .map(v =>
                    v.trim().toUpperCase()
                )
                .filter(Boolean)
        )
    ];
}

function executeSearch() {

    state.searchTokens =
        parseSearchInput(
            dom.searchInput.value
        );

    applyFiltersAndRender();
}

function clearSearch() {

    dom.searchInput.value = "";

    state.searchTokens = [];

    applyFiltersAndRender();
}

function clearFilters() {

    state.filters = {
        equipmentId: "",
        area: "",
        equipmentType: ""
    };

    resetFilterInputs();

    applyFiltersAndRender();
}

function resetFilterInputs() {

    dom.equipmentFilter.value = "";
    dom.areaFilter.value = "";
    dom.typeFilter.value = "";
}

function applyFiltersAndRender() {

    let rows = [...state.equipment];

    const notFoundIds = [];

    if (state.searchTokens.length > 0) {

        const map = new Map(
            rows.map(row => [
                String(
                    row["Equipment ID"] || ""
                ).toUpperCase(),
                row
            ])
        );

        const matched = [];

        for (const token of state.searchTokens) {

            if (map.has(token)) {
                matched.push(map.get(token));
            }

            else {
                notFoundIds.push(token);
            }
        }

        rows = matched;
    }

    if (state.filters.equipmentId) {

        const filter =
            state.filters.equipmentId
                .toUpperCase();

        rows = rows.filter(row =>
            String(
                row["Equipment ID"] || ""
            )
                .toUpperCase()
                .includes(filter)
        );
    }

    if (state.filters.area) {

        rows = rows.filter(row =>
            row["Area"] ===
            state.filters.area
        );
    }

    if (state.filters.equipmentType) {

        rows = rows.filter(row =>
            row["Equipment Type"] ===
            state.filters.equipmentType
        );
    }

    state.filteredEquipment = rows;

    renderChecklistTable();

    renderIssuesView();

    renderSummary(notFoundIds);

    renderNotFound(notFoundIds);

    renderEmptyState();
}

function renderMetadata(metadata) {

    dom.totalEquipment.textContent =
        metadata.total_equipment || 0;

    if (!metadata.generated_at) {

        dom.generatedAt.textContent =
            "Unknown";

        return;
    }

    dom.generatedAt.textContent =
        new Date(
            metadata.generated_at
        ).toLocaleString();
}

function populateFilters() {

    populateSelect(
        dom.areaFilter,
        uniqueValues("Area"),
        "All Areas"
    );

    populateSelect(
        dom.typeFilter,
        uniqueValues("Equipment Type"),
        "All Types"
    );
}

function uniqueValues(key) {

    return [
        ...new Set(
            state.equipment
                .map(row => row[key])
                .filter(Boolean)
        )
    ].sort();
}

function populateSelect(
    select,
    values,
    label
) {

    select.innerHTML = "";

    const option =
        document.createElement("option");

    option.value = "";
    option.textContent = label;

    select.appendChild(option);

    for (const value of values) {

        const opt =
            document.createElement("option");

        opt.value = value;
        opt.textContent = value;

        select.appendChild(opt);
    }
}

/**
 * Canonical equipment ID key for issues lookup.
 * Must mirror normalize_equipment_id() in stage5_CATEGORY_OUTPUT_v2.py.
 */
function normalizeEquipmentId(value) {
    return String(value || "").trim().toUpperCase();
}

function renderChecklistTable() {

    renderChecklistHead();

    renderChecklistBody();
}

function renderChecklistHead() {

    const columns = [
        "Equipment ID",
        "Area",
        "Equipment Type",
        ...state.phaseColumns,
        "Critical Issues #",
        "Non-Critical Issues #"
    ];

    dom.checklistHead.innerHTML = `
        <tr>
            ${columns.map(
                c => `<th>${c}</th>`
            ).join("")}
        </tr>
    `;
}

function renderChecklistBody() {

    dom.checklistBody.innerHTML = "";

    for (const row of state.filteredEquipment) {

        const tr =
            document.createElement("tr");

        tr.innerHTML = [

            renderCell(
                row["Equipment ID"]
            ),

            renderCell(
                row["Area"]
            ),

            renderCell(
                row["Equipment Type"]
            ),

            ...state.phaseColumns.map(
                phase =>
                    renderPhaseCell(
                        row[phase]
                    )
            ),

            renderIssueCountCell(
                row["Critical Issues #"],
                true
            ),

            renderIssueCountCell(
                row["Non-Critical Issues #"],
                false
            )

        ].join("");

        dom.checklistBody.appendChild(tr);
    }

    dom.checklistCount.textContent =
        String(
            state.filteredEquipment.length
        );
}

function renderCell(value) {

    return `
        <td>
            ${escapeHtml(value || "—")}
        </td>
    `;
}

function renderPhaseCell(value) {

    if (value === 1) {

        return `
            <td class="status-complete">
                1
            </td>
        `;
    }

    if (value === 0) {

        return `
            <td class="status-incomplete">
                0
            </td>
        `;
    }

    return `
        <td class="status-na">
            -
        </td>
    `;
}

function renderIssueCountCell(
    value,
    critical
) {

    const numericValue =
        Number(value || 0);

    const classes = [];

    if (
        critical &&
        numericValue > 0
    ) {
        classes.push("issue-critical");
    }

    return `
        <td class="${classes.join(" ")}">
            ${numericValue}
        </td>
    `;
}

function renderIssuesView() {

    dom.issuesContainer.innerHTML = "";

    const rows =
        state.filteredEquipment.filter(row =>
            Number(
                row["Critical Issues #"] || 0
            ) > 0 ||

            Number(
                row["Non-Critical Issues #"] || 0
            ) > 0
        );

    dom.issuesCount.textContent =
        `${rows.length} equipment with issues`;

    if (rows.length === 0) {

        dom.issuesContainer.innerHTML = `
            <div class="panel" style="margin:16px;">
                <div style="padding:20px;">
                    No issues found.
                </div>
            </div>
        `;

        return;
    }

    for (const equipment of rows) {

        const equipmentId =
            equipment["Equipment ID"];

        const normalizedId = normalizeEquipmentId(equipmentId);
        if (!state.issues?.[normalizedId]) {
            console.warn(
                "Issue lookup miss:",
                equipmentId,
                Object.keys(state.issues || {}).slice(0, 5)
            );
        }
        const issueData =
            state.issues?.[normalizedId] || {
                critical: [],
                non_critical: []
            };

        const criticalIssues =
            issueData.critical || [];

        const nonCriticalIssues =
            issueData.non_critical || [];

        const wrapper =
            document.createElement("div");

        wrapper.className =
            "issue-equipment-group";

        wrapper.innerHTML = `

            <div class="issue-equipment-header">

                <div>
                    <strong>
                        ${escapeHtml(
                            equipmentId
                        )}
                    </strong>
                </div>

                <div>
                    ${escapeHtml(
                        equipment["Area"] || "—"
                    )}
                </div>

                <div>
                    ${escapeHtml(
                        equipment["Equipment Type"] || "—"
                    )}
                </div>

            </div>

            ${renderIssueSection(
                "Critical",
                "critical",
                criticalIssues
            )}

            ${renderIssueSection(
                "Non-Critical",
                "noncritical",
                nonCriticalIssues
            )}
        `;

        dom.issuesContainer.appendChild(
            wrapper
        );
    }
}

function renderIssueSection(
    title,
    className,
    issues
) {

    if (!issues.length) {

        return `
            <div class="issue-section">

                <div class="
                    issue-section-title
                    issue-section-${className}
                ">
                    ${title}: 0
                </div>

            </div>
        `;
    }

    return `
        <div class="issue-section">

            <div class="
                issue-section-title
                issue-section-${className}
            ">
                ${title}: ${issues.length}
            </div>

            ${issues.map(
                issue =>
                    renderIssueRow(issue)
            ).join("")}

        </div>
    `;
}

function renderIssueRow(issue) {

    return `
        <div class="issue-row">

            <div>
                ${escapeHtml(
                    issue.name || "—"
                )}
            </div>

            <div>
                ${escapeHtml(
                    issue.description || "—"
                )}
            </div>

            <div>
                ${escapeHtml(
                    issue.assigned_to || "—"
                )}
            </div>

            <div>
                ${renderStatusBadge(
                    issue.status || ""
                )}
            </div>

            <div>
                ${renderIssueLink(
                    issue.link || ""
                )}
            </div>

        </div>
    `;
}

function renderIssueLink(link) {

    if (!link) {
        return "—";
    }

    return `
        <a
            href="${link}"
            target="_blank"
            rel="noopener noreferrer"
        >
            Link
        </a>
    `;
}

function renderStatusBadge(status) {

    const normalized =
        String(status)
            .toLowerCase()
            .trim();

    let className =
        "status-default";

    if (
        normalized.includes("open")
    ) {
        className =
            "status-open";
    }

    else if (
        normalized.includes("progress")
    ) {
        className =
            "status-progress";
    }

    else if (
        normalized.includes("ready")
    ) {
        className =
            "status-ready";
    }

    else if (
        normalized.includes("complete")
    ) {
        className =
            "status-complete-badge";
    }

    else if (
        normalized.includes(
            "recommendation"
        )
    ) {
        className =
            "status-recommendation";
    }

    return `
        <span class="
            status-badge
            ${className}
        ">
            ${escapeHtml(
                status || "Unknown"
            )}
        </span>
    `;
}

function renderSummary(notFoundIds) {

    dom.resultsSummary.textContent =
        `Found ${state.filteredEquipment.length} matches`;

    const issuesCount =
        state.filteredEquipment.filter(row =>
            Number(
                row["Critical Issues #"] || 0
            ) > 0 ||

            Number(
                row["Non-Critical Issues #"] || 0
            ) > 0
        ).length;

    dom.issuesSummary.textContent =
        `${issuesCount} equipment`;

    dom.notFoundSummary.textContent =
        String(notFoundIds.length);
}

function renderNotFound(notFoundIds) {

    if (notFoundIds.length === 0) {

        dom.notFoundSection.classList.add(
            "hidden"
        );

        dom.notFound.innerHTML = "";

        return;
    }

    dom.notFoundSection.classList.remove(
        "hidden"
    );

    dom.notFound.innerHTML =
        notFoundIds.map(id => `
            <div class="not-found-item">
                ${escapeHtml(id)}
            </div>
        `).join("");
}

function renderEmptyState() {

    if (
        state.filteredEquipment.length === 0
    ) {

        dom.emptyState.classList.remove(
            "hidden"
        );
    }

    else {

        dom.emptyState.classList.add(
            "hidden"
        );
    }
}

function copyVisibleTable() {

    const rows =
        buildExportRows();

    const text =
        rows
            .map(row =>
                row.join("\t")
            )
            .join("\n");

    navigator.clipboard.writeText(text);
}

function downloadCsv() {

    const rows =
        buildExportRows();

    const csv =
        rows
            .map(row =>
                row
                    .map(csvEscape)
                    .join(",")
            )
            .join("\n");

    const blob =
        new Blob(
            [csv],
            {
                type:
                    "text/csv;charset=utf-8;"
            }
        );

    const url =
        URL.createObjectURL(blob);

    const link =
        document.createElement("a");

    link.href = url;

    link.download =
        `equipment_export_${Date.now()}.csv`;

    link.click();

    URL.revokeObjectURL(url);
}

function buildExportRows() {

    const rows = [[
        "Equipment ID",
        "Area",
        "Equipment Type",
        ...state.phaseColumns,
        "Critical Issues #",
        "Non-Critical Issues #"
    ]];

    for (const row of state.filteredEquipment) {

        rows.push([

            row["Equipment ID"],

            row["Area"],

            row["Equipment Type"],

            ...state.phaseColumns.map(
                phase => row[phase]
            ),

            row["Critical Issues #"],

            row["Non-Critical Issues #"]
        ]);
    }

    return rows;
}

function csvEscape(value) {

    const stringValue =
        String(value ?? "");

    return `"${stringValue.replace(/"/g, '""')}"`;
}

function showError(message) {

    dom.errorBanner.textContent =
        message;

    dom.errorBanner.classList.remove(
        "hidden"
    );
}

function hideError() {

    dom.errorBanner.classList.add(
        "hidden"
    );
}

function showSuccess(message) {

    dom.successBanner.textContent =
        message;

    dom.successBanner.classList.remove(
        "hidden"
    );

    // Auto-hide after 5 seconds
    setTimeout(hideSuccess, 5000);
}

function hideSuccess() {

    dom.successBanner.classList.add(
        "hidden"
    );
}

function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// =========================================
// GNG READINESS REPORT — Module State
// =========================================
let gngCurrentRows = [];
let gngCurrentDHLabel = "";

// =========================================
// GNG READINESS REPORT — Tab Activation
// =========================================

/**
 * Activate the GNG Readiness tab.
 * Hides all standard panels, shows the GNG panel, and renders the report.
 */
function activateGNGTab() {
    // Update active tab UI: add active to GNG tab, remove from all others
    document.querySelectorAll(".building-tab").forEach(tab => {
        tab.classList.remove("active");
    });
    document.getElementById("gng-tab-btn").classList.add("active");

    // Hide standard panels
    document.querySelectorAll(".search-panel, .filter-panel, .checklist-panel, .issues-panel").forEach(panel => {
        panel.style.display = "none";
    });

    // Hide the L3 panel if present
    const l3Panel = document.getElementById("l3-panel");
    if (l3Panel) {
        l3Panel.classList.add("hidden");
    }

    // Show the GNG panel
    document.getElementById("gng-panel").classList.remove("hidden");

    // Render the GNG report content
    renderGNGReport();
}

/**
 * Render the full GNG Readiness Report:
 * - Data hall <select> dropdown
 * - Vendor Summary section container
 * - Detail Report section container
 * Wires the dropdown onchange to re-render both report sections.
 */
function renderGNGReport() {
    const content = document.getElementById("gng-content");
    if (!content) return;

    const openChecklists = (
        state.rawData?.buildings?.[state.activeBuilding]?.open_checklists
    );

    if (!openChecklists || openChecklists.length === 0) {
        content.innerHTML = '<p>GNG Readiness data is not available for this building.</p>';
        return;
    }

    // Build DH_Label → equipment list map
    const dhMap = buildDHMap(openChecklists);
    const dhLabels = Object.keys(dhMap).filter(k => k !== "Other").sort();
    if (dhMap["Other"]) dhLabels.push("Other");

    // Build the selector HTML
    const optionsHtml = dhLabels.map((label, idx) =>
        `<option value="${escapeHtml(label)}"${idx === 0 ? " selected" : ""}>${escapeHtml(label)}</option>`
    ).join("");

    // Render the controls and section containers
    content.innerHTML = `
        <div class="gng-controls">
            <label for="gng-dh-select">Data Hall:</label>
            <select id="gng-dh-select" class="filter-field">
                ${optionsHtml}
            </select>
        </div>
        <div id="gng-vendor-summary"></div>
        <div id="gng-detail-report"></div>
    `;

    // Function to render both sections for the selected DH_Label
    function renderSections() {
        const selectedLabel = document.getElementById("gng-dh-select").value;
        const rows = dhMap[selectedLabel] || [];

        // Update module-level state for clipboard/CSV export functions
        gngCurrentRows = rows;
        gngCurrentDHLabel = selectedLabel;

        // Render vendor summary table
        if (typeof renderVendorSummaryTable === "function") {
            renderVendorSummaryTable(rows, selectedLabel);
        }

        // Render detail report table
        if (typeof renderDetailTable === "function") {
            renderDetailTable(rows, selectedLabel);
        }
    }

    // Wire onchange on the select to re-render both report sections
    document.getElementById("gng-dh-select").addEventListener("change", renderSections);

    // Initial render for the first (default) selected data hall
    renderSections();
}

// =========================================
// GNG READINESS REPORT — Utility Functions
// =========================================

/**
 * Derive the data hall label from an Area string.
 * Matches DH followed by 3–4 digits (case-insensitive),
 * returns "DH" + first 3 digits of match, or "Other" if no match.
 */
function deriveDHLabel(area) {
    const m = String(area || "").match(/DH(\d{3,4})/i);
    if (!m) return "Other";
    return "DH" + m[1].slice(0, 3);
}

/**
 * Group open_checklists records by their derived DH_Label.
 * Returns an object mapping each label to an array of equipment records.
 */
function buildDHMap(openChecklists) {
    const map = {};
    for (const eq of openChecklists) {
        const label = deriveDHLabel(eq.area);
        if (!map[label]) map[label] = [];
        map[label].push(eq);
    }
    return map;
}

/**
 * Build the Vendor Summary cross-tab from filtered equipment rows.
 * Iterates all eq.open_items to populate vendorSet, typeSet, and counts[vendor][type].
 * Sorts vendors and types case-insensitively.
 * Returns { vendors: string[], types: string[], counts: { [vendor]: { [type]: number } } }
 */
function buildVendorSummary(rows) {
    const vendorSet = new Set();
    const typeSet = new Set();
    const counts = {};

    for (const eq of rows) {
        const type = eq.equipment_type || "Unknown";
        typeSet.add(type);
        for (const item of eq.open_items) {
            const vendor = item.vendor || "Unassigned";
            vendorSet.add(vendor);
            if (!counts[vendor]) counts[vendor] = {};
            counts[vendor][type] = (counts[vendor][type] || 0) + 1;
        }
    }

    const vendors = [...vendorSet].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
    );
    const types = [...typeSet].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
    );

    return { vendors, types, counts };
}

/**
 * Render the Vendor Summary table into #gng-vendor-summary.
 * Title: "GNG Readiness – Open Checklist Assignment Report / Vendor Summary"
 * Sub-header: "Data Hall: {dhLabel}"
 * One <th> per equipment type plus "Total Open Checklists".
 * One <tr> per vendor with counts and row total.
 * A TOTAL footer <tr> with column-wise sums.
 * Renders "0" for cells where a vendor has no items for a given type.
 * Renders "No open checklists for this data hall." when rows is empty.
 * Wraps table in .table-scroll-container; applies data-table class to <table>.
 */
function renderVendorSummaryTable(rows, dhLabel) {
    const container = document.getElementById("gng-vendor-summary");
    if (!container) return;

    // Empty state
    if (!rows || rows.length === 0) {
        container.innerHTML = '<p>No open checklists for this data hall.</p>';
        return;
    }

    const { vendors, types, counts } = buildVendorSummary(rows);

    // If no vendors found (all equipment has empty open_items), show empty message
    if (vendors.length === 0) {
        container.innerHTML = '<p>No open checklists for this data hall.</p>';
        return;
    }

    // Build header row
    const headerCells = ['<th>Vendor</th>']
        .concat(types.map(t => `<th>${escapeHtml(t)}</th>`))
        .concat(['<th>Total Open Checklists</th>'])
        .join("");

    // Build vendor data rows and track column totals
    const colTotals = {};
    for (const t of types) colTotals[t] = 0;
    let grandTotal = 0;

    const bodyRows = vendors.map(vendor => {
        let rowTotal = 0;
        const cells = types.map(type => {
            const count = (counts[vendor] && counts[vendor][type]) || 0;
            rowTotal += count;
            colTotals[type] += count;
            return `<td>${count}</td>`;
        });
        grandTotal += rowTotal;
        return `<tr><td>${escapeHtml(vendor)}</td>${cells.join("")}<td>${rowTotal}</td></tr>`;
    }).join("");

    // Build TOTAL footer row
    const totalCells = types.map(type => `<td>${colTotals[type]}</td>`).join("");
    const totalRow = `<tr class="gng-vendor-total"><td><strong>TOTAL</strong></td>${totalCells}<td><strong>${grandTotal}</strong></td></tr>`;

    container.innerHTML = `
        <div class="gng-section-header">
            <h3 class="gng-report-title">GNG Readiness – Open Checklist Assignment Report / Vendor Summary</h3>
            <div class="gng-section-buttons">
                <button type="button" class="gng-copy-btn" onclick="copyGNGToClipboard('vendor')">Copy to Clipboard</button>
                <button type="button" class="gng-download-btn" onclick="downloadGNGCSV('vendor', gngCurrentDHLabel)">Download CSV</button>
            </div>
        </div>
        <p><strong>Data Hall: ${escapeHtml(dhLabel)}</strong></p>
        <div id="gng-vendor-copy-msg" class="gng-copy-msg"></div>
        <div class="table-scroll-container">
            <table class="data-table">
                <thead><tr>${headerCells}</tr></thead>
                <tbody>${bodyRows}</tbody>
                <tfoot>${totalRow}</tfoot>
            </table>
        </div>
    `;
}


// =========================================
// GNG READINESS REPORT — Detail Report
// =========================================

/**
 * Build the detail report data from equipment rows.
 * Finds maxN (maximum number of open_items across all rows),
 * sorts rows by equipment_id ascending, and returns
 * { sortedRows, maxN }.
 *
 * @param {Array} rows - Array of equipment objects with open_items
 * @returns {{ sortedRows: Array, maxN: number }}
 */
function buildDetailReport(rows) {
    if (!rows || rows.length === 0) {
        return { sortedRows: [], maxN: 0 };
    }

    // Find max open_items length across all rows
    let maxN = 0;
    for (const eq of rows) {
        const len = (eq.open_items || []).length;
        if (len > maxN) maxN = len;
    }

    // Sort rows by equipment_id ascending (case-insensitive lexicographic)
    const sortedRows = [...rows].sort((a, b) => {
        const idA = String(a.equipment_id || "").toUpperCase();
        const idB = String(b.equipment_id || "").toUpperCase();
        if (idA < idB) return -1;
        if (idA > idB) return 1;
        return 0;
    });

    return { sortedRows, maxN };
}

/**
 * Render the Detailed Checklist Report table into #gng-detail-report.
 *
 * Title line format:
 *   "{DH_Label} | {rowCount} equipment rows | {totalOpen} open checklist occurrences | Checklist pairs expand through #{maxN}"
 *
 * Fixed columns: Equipment ID, Area, Equipment Type
 * Paired columns: Missing Checklist #1 / Assignee #1 ... Missing Checklist #N / Assignee #N
 * Rows with fewer than N open items get empty <td> cells for the remaining pairs.
 *
 * When rows is empty, renders "No open checklists for this data hall."
 *
 * @param {Array} rows - Array of equipment objects for the selected data hall
 * @param {string} dhLabel - The selected data hall label (e.g., "DH115")
 */
function renderDetailTable(rows, dhLabel) {
    const container = document.getElementById("gng-detail-report");
    if (!container) return;

    // Handle empty case
    if (!rows || rows.length === 0) {
        container.innerHTML = '<p>No open checklists for this data hall.</p>';
        return;
    }

    // Build sorted data and maxN
    const { sortedRows, maxN } = buildDetailReport(rows);

    // Calculate total open checklist occurrences
    let totalOpen = 0;
    for (const eq of sortedRows) {
        totalOpen += (eq.open_items || []).length;
    }

    const rowCount = sortedRows.length;

    // Build title line
    const titleText = `${escapeHtml(dhLabel)} | ${rowCount} equipment rows | ${totalOpen} open checklist occurrences | Checklist pairs expand through #${maxN}`;

    // Build header row
    let headerCells = '<th>Equipment ID</th><th>Area</th><th>Equipment Type</th>';
    for (let i = 1; i <= maxN; i++) {
        headerCells += `<th>Missing Checklist #${i}</th><th>Assignee #${i}</th>`;
    }

    // Build body rows
    let bodyRows = '';
    for (const eq of sortedRows) {
        const openItems = eq.open_items || [];
        let cells = '';
        cells += `<td>${escapeHtml(eq.equipment_id || "")}</td>`;
        cells += `<td>${escapeHtml(eq.area || "")}</td>`;
        cells += `<td>${escapeHtml(eq.equipment_type || "")}</td>`;

        for (let i = 0; i < maxN; i++) {
            if (i < openItems.length) {
                cells += `<td>${escapeHtml(openItems[i].phase || "")}</td>`;
                cells += `<td>${escapeHtml(openItems[i].vendor || "")}</td>`;
            } else {
                cells += '<td></td><td></td>';
            }
        }

        bodyRows += `<tr>${cells}</tr>`;
    }

    // Assemble the full HTML with scroll container and data-table class
    container.innerHTML = `
        <div class="gng-section-header">
            <p class="gng-report-title">${titleText}</p>
            <div class="gng-section-buttons">
                <button type="button" class="gng-copy-btn" onclick="copyGNGToClipboard('detail')">Copy to Clipboard</button>
                <button type="button" class="gng-download-btn" onclick="downloadGNGCSV('detail', gngCurrentDHLabel)">Download CSV</button>
            </div>
        </div>
        <div id="gng-detail-copy-msg" class="gng-copy-msg"></div>
        <div class="table-scroll-container">
            <table class="data-table">
                <thead><tr>${headerCells}</tr></thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>
    `;
}

// =========================================
// GNG READINESS REPORT — Export Helpers
// =========================================

/**
 * CSV-escape a value for GNG reports.
 * If the string contains a comma, double-quote, or newline,
 * wrap in double-quotes and double any internal double-quote characters.
 * Otherwise return as-is.
 *
 * @param {*} value - The value to escape
 * @returns {string}
 */
function csvEscapeGNG(value) {
    const s = String(value ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

/**
 * Build a tab-separated value string from table data.
 * Uses \t as column separator and \n as row separator.
 * No trailing separator on the final row.
 *
 * @param {string} type - "vendor" or "detail"
 * @param {object} data - The structured table data (from getGNGTableData)
 * @returns {string} TSV text
 */
function buildTSV(type, data) {
    const rows = [];

    // Title line
    rows.push(data.title);

    // Sub-header line (vendor summary has data hall sub-header)
    if (data.subHeader) {
        rows.push(data.subHeader);
    }

    // Header row
    rows.push(data.headers.join("\t"));

    // Data rows
    for (const row of data.rows) {
        rows.push(row.join("\t"));
    }

    // TOTAL row (vendor summary only)
    if (data.totalRow) {
        rows.push(data.totalRow.join("\t"));
    }

    return rows.join("\n");
}

/**
 * Build CSV content from table data using csvEscapeGNG for all values.
 * Includes title line, header row, data rows, and TOTAL row for vendor summary.
 *
 * @param {string} type - "vendor" or "detail"
 * @param {object} data - The structured table data (from getGNGTableData)
 * @returns {string} CSV text
 */
function buildCSVContent(type, data) {
    const rows = [];

    // Title line
    rows.push(csvEscapeGNG(data.title));

    // Sub-header line (vendor summary has data hall sub-header)
    if (data.subHeader) {
        rows.push(csvEscapeGNG(data.subHeader));
    }

    // Header row
    rows.push(data.headers.map(h => csvEscapeGNG(h)).join(","));

    // Data rows
    for (const row of data.rows) {
        rows.push(row.map(cell => csvEscapeGNG(cell)).join(","));
    }

    // TOTAL row (vendor summary only)
    if (data.totalRow) {
        rows.push(data.totalRow.map(cell => csvEscapeGNG(cell)).join(","));
    }

    return rows.join("\n");
}

/**
 * Get structured table data for the GNG report section.
 * Reads from the current module-level state (gngCurrentRows).
 *
 * @param {string} type - "vendor" or "detail"
 * @returns {object} { title, subHeader?, headers, rows, totalRow? }
 */
function getGNGTableData(type) {
    const rows = gngCurrentRows;
    const dhLabel = gngCurrentDHLabel;

    if (type === "vendor") {
        const { vendors, types, counts } = buildVendorSummary(rows);

        const title = "GNG Readiness – Open Checklist Assignment Report / Vendor Summary";
        const subHeader = `Data Hall: ${dhLabel}`;
        const headers = ["Vendor", ...types, "Total Open Checklists"];

        const dataRows = vendors.map(vendor => {
            let rowTotal = 0;
            const cells = types.map(t => {
                const count = (counts[vendor] && counts[vendor][t]) || 0;
                rowTotal += count;
                return String(count);
            });
            return [vendor, ...cells, String(rowTotal)];
        });

        // TOTAL row
        const colTotals = types.map(t => {
            let total = 0;
            for (const vendor of vendors) {
                total += (counts[vendor] && counts[vendor][t]) || 0;
            }
            return total;
        });
        const grandTotal = colTotals.reduce((sum, v) => sum + v, 0);
        const totalRow = ["TOTAL", ...colTotals.map(String), String(grandTotal)];

        return { title, subHeader, headers, rows: dataRows, totalRow };
    } else {
        // detail
        const { sortedRows, maxN } = buildDetailReport(rows);

        // Count total open occurrences
        let totalOpen = 0;
        for (const eq of sortedRows) {
            totalOpen += (eq.open_items || []).length;
        }

        const title = `${dhLabel} | ${sortedRows.length} equipment rows | ${totalOpen} open checklist occurrences | Checklist pairs expand through #${maxN}`;
        const headers = ["Equipment ID", "Area", "Equipment Type"];
        for (let i = 1; i <= maxN; i++) {
            headers.push(`Missing Checklist #${i}`, `Assignee #${i}`);
        }

        const dataRows = sortedRows.map(eq => {
            const openItems = eq.open_items || [];
            const row = [
                eq.equipment_id || "",
                eq.area || "",
                eq.equipment_type || ""
            ];
            for (let i = 0; i < maxN; i++) {
                if (i < openItems.length) {
                    row.push(openItems[i].phase || "", openItems[i].vendor || "");
                } else {
                    row.push("", "");
                }
            }
            return row;
        });

        return { title, subHeader: null, headers, rows: dataRows, totalRow: null };
    }
}

/**
 * Copy GNG report section to clipboard as tab-separated text.
 * On success, shows "Copied!" confirmation for 1500 ms.
 * On failure, logs console.warn and shows an error message near the button.
 *
 * @param {string} type - "vendor" or "detail"
 */
async function copyGNGToClipboard(type) {
    const data = getGNGTableData(type);
    const text = buildTSV(type, data);
    const msgId = type === "vendor" ? "gng-vendor-copy-msg" : "gng-detail-copy-msg";
    const msgEl = document.getElementById(msgId);

    try {
        await navigator.clipboard.writeText(text);
        // Show success confirmation
        if (msgEl) {
            msgEl.textContent = "Copied!";
            msgEl.className = "gng-copy-msg gng-copy-success";
            setTimeout(() => {
                msgEl.textContent = "";
                msgEl.className = "gng-copy-msg";
            }, 1500);
        }
    } catch (e) {
        console.warn("Clipboard unavailable:", e);
        // Show error message near the button
        if (msgEl) {
            msgEl.textContent = "Clipboard access is not available. Use HTTPS or copy manually.";
            msgEl.className = "gng-copy-msg gng-copy-error";
        }
    }
}

/**
 * Download GNG report section as a CSV file with UTF-8 BOM.
 * Filename patterns:
 *   - vendor: gng_vendor_summary_{dhLabel}_{YYYYMMDD}.csv
 *   - detail: gng_detail_{dhLabel}_{YYYYMMDD}.csv
 *
 * @param {string} type - "vendor" or "detail"
 * @param {string} dhLabel - The current data hall label
 */
function downloadGNGCSV(type, dhLabel) {
    const data = getGNGTableData(type);
    const csvContent = "\uFEFF" + buildCSVContent(type, data);

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    // Build date string as YYYYMMDD
    const now = new Date();
    const dateStr = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, "0") +
        String(now.getDate()).padStart(2, "0");

    link.href = url;
    link.download = type === "vendor"
        ? `gng_vendor_summary_${dhLabel}_${dateStr}.csv`
        : `gng_detail_${dhLabel}_${dateStr}.csv`;

    link.click();
    URL.revokeObjectURL(url);
}
