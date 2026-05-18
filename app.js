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
            loadBuildingData(tab.dataset.building);
        });
    });

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
