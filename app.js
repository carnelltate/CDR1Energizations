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

    // Re-render inline GNG section for the newly selected building
    renderGNGSection();
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

    // Refresh the Scheduling Tool panel if it is currently visible (Requirements 2.4, 2.6, 8.1, 8.7)
    const schedulingPanel = document.getElementById("scheduling-panel");
    if (schedulingPanel && !schedulingPanel.classList.contains("hidden")) {
        renderSchedulingPanel();
    }
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

    // Scheduling Tool nav button — activate scheduling panel
    const schedulingBtn = document.getElementById("scheduling-tool-btn");
    if (schedulingBtn) {
        schedulingBtn.addEventListener("click", activateSchedulingTool);
    }

    // Scheduling Tool "Copy Table" button
    const schedulingCopyBtn = document.getElementById("scheduling-copy-btn");
    if (schedulingCopyBtn) {
        schedulingCopyBtn.addEventListener("click", copySchedulingTable);
    }

    // Building tabs — deactivate scheduling panel when switching buildings
    dom.buildingTabs.forEach(tab => {
        tab.addEventListener("click", deactivateSchedulingTool);
    });
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
            ${columns.map((c, i) => {
                const frozenClass = i < 3 ? ` class="frozen-col-${i + 1}${i === 2 ? ' frozen-col-separator' : ''}"` : '';
                return `<th${frozenClass}>${c}</th>`;
            }).join("")}
        </tr>
    `;
}

function renderChecklistBody() {

    dom.checklistBody.innerHTML = "";

    for (const row of state.filteredEquipment) {

        const tr =
            document.createElement("tr");

        const cells = [
            { value: row["Equipment ID"], col: 1 },
            { value: row["Area"], col: 2 },
            { value: row["Equipment Type"], col: 3 },
        ];

        // First 3 cells get frozen classes
        let html = cells.map(c => {
            const cls = `frozen-col-${c.col}${c.col === 3 ? ' frozen-col-separator' : ''}`;
            return `<td class="${cls}">${escapeHtml(String(c.value ?? ""))}</td>`;
        }).join("");

        // Remaining cells unchanged
        html += state.phaseColumns.map(phase => renderPhaseCell(row[phase])).join("");
        html += renderIssueCountCell(row["Critical Issues #"], true);
        html += renderIssueCountCell(row["Non-Critical Issues #"], false);

        tr.innerHTML = html;

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
let gngDHMap = {};
let gngAllChecklists = [];
let gngCurrentRows = [];
let gngCurrentDHLabel = "All";
let gngSelectedTypes = [];
let gngTypeDropdown = null;
let gngPhaseDropdown = null;

// =========================================
// GNG READINESS REPORT — Checkbox Dropdown Component
// =========================================

/**
 * Factory function that creates a Checkbox Dropdown component.
 * Produces a reusable multi-select dropdown with checkboxes, trigger text summary,
 * and Clear All functionality.
 *
 * @param {Object} config
 * @param {string} config.id - Unique identifier prefix for DOM elements
 * @param {string} config.label - Label text displayed above the trigger
 * @param {string} config.placeholder - Text shown when no items selected
 * @param {string[]} config.options - Array of option values to display as checkboxes
 * @param {(selected: string[]) => void} config.onChange - Callback invoked on every selection change
 * @returns {{ element: HTMLElement, getSelected: () => string[], setOptions: (options: string[]) => void, reset: () => void }}
 */
function createCheckboxDropdown(config) {
    const { id, label, placeholder, options, onChange } = config;

    // Internal state
    let selectedValues = new Set();
    let isOpen = false;
    let focusedIndex = -1;

    // --- Build DOM structure ---

    // Wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "filter-field checkbox-dropdown";
    wrapper.id = `${id}-wrapper`;

    // Label
    const labelEl = document.createElement("label");
    labelEl.setAttribute("for", `${id}-trigger`);
    labelEl.textContent = label;
    wrapper.appendChild(labelEl);

    // Trigger button
    const trigger = document.createElement("button");
    trigger.className = "checkbox-dropdown-trigger";
    trigger.id = `${id}-trigger`;
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-controls", `${id}-panel`);
    trigger.setAttribute("type", "button");
    trigger.textContent = placeholder;
    wrapper.appendChild(trigger);

    // Panel
    const panel = document.createElement("div");
    panel.className = "checkbox-dropdown-panel";
    panel.id = `${id}-panel`;
    panel.setAttribute("role", "listbox");
    panel.setAttribute("aria-multiselectable", "true");
    panel.hidden = true;
    wrapper.appendChild(panel);

    // --- Helper functions ---

    function updateTriggerText() {
        const count = selectedValues.size;
        if (count === 0) {
            trigger.textContent = placeholder;
        } else if (count <= 2) {
            trigger.textContent = Array.from(selectedValues).join(", ");
        } else {
            trigger.textContent = `${count} selected`;
        }
    }

    function openPanel() {
        isOpen = true;
        panel.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        panel.focus();
    }

    function closePanel() {
        isOpen = false;
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        focusedIndex = -1;
        // Remove focused class from all options
        const optionDivs = panel.querySelectorAll('.checkbox-dropdown-option');
        optionDivs.forEach(div => div.classList.remove('checkbox-dropdown-option-focused'));
    }

    function setFocusedOption(index) {
        const optionDivs = panel.querySelectorAll('.checkbox-dropdown-option');
        if (optionDivs.length === 0) return;
        // Remove previous focus
        optionDivs.forEach(div => div.classList.remove('checkbox-dropdown-option-focused'));
        // Clamp index
        if (index < 0) index = 0;
        if (index >= optionDivs.length) index = optionDivs.length - 1;
        focusedIndex = index;
        optionDivs[focusedIndex].classList.add('checkbox-dropdown-option-focused');
        optionDivs[focusedIndex].scrollIntoView({ block: "nearest" });
    }

    function buildOptions(optionsList) {
        // Clear existing options (preserve Clear All button will be re-added)
        panel.innerHTML = "";

        optionsList.forEach((value, index) => {
            const optionDiv = document.createElement("div");
            optionDiv.className = "checkbox-dropdown-option";
            optionDiv.setAttribute("role", "option");
            optionDiv.setAttribute("aria-selected", "false");
            optionDiv.setAttribute("tabindex", "-1");

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.id = `${id}-opt-${index}`;
            checkbox.value = value;
            checkbox.setAttribute("tabindex", "-1");

            const checkboxLabel = document.createElement("label");
            checkboxLabel.setAttribute("for", `${id}-opt-${index}`);
            checkboxLabel.textContent = value;

            optionDiv.appendChild(checkbox);
            optionDiv.appendChild(checkboxLabel);

            // Checkbox change handler
            checkbox.addEventListener("change", function () {
                if (checkbox.checked) {
                    selectedValues.add(value);
                } else {
                    selectedValues.delete(value);
                }
                optionDiv.setAttribute("aria-selected", checkbox.checked ? "true" : "false");
                updateTriggerText();
                onChange(Array.from(selectedValues));
            });

            panel.appendChild(optionDiv);
        });

        // Clear All button
        const clearBtn = document.createElement("button");
        clearBtn.className = "checkbox-dropdown-clear";
        clearBtn.setAttribute("type", "button");
        clearBtn.textContent = "Clear All";
        clearBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            clearAll();
            onChange(Array.from(selectedValues));
        });
        panel.appendChild(clearBtn);
    }

    function clearAll() {
        selectedValues.clear();
        const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => { cb.checked = false; });
        const optionDivs = panel.querySelectorAll('.checkbox-dropdown-option');
        optionDivs.forEach(div => { div.setAttribute("aria-selected", "false"); });
        updateTriggerText();
    }

    // --- Event listeners ---

    // Toggle panel on trigger click
    trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        if (isOpen) {
            closePanel();
        } else {
            openPanel();
        }
    });

    // Close panel on click outside
    document.addEventListener("click", function (e) {
        if (isOpen && !wrapper.contains(e.target)) {
            closePanel();
        }
    });

    // Keyboard: Enter/Space on trigger opens panel
    trigger.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!isOpen) {
                openPanel();
                setFocusedOption(0);
            } else {
                closePanel();
            }
        } else if (e.key === "ArrowDown" && !isOpen) {
            e.preventDefault();
            openPanel();
            setFocusedOption(0);
        }
    });

    // Keyboard: Arrow navigation, Space toggle, Escape close within panel
    panel.addEventListener("keydown", function (e) {
        const optionDivs = panel.querySelectorAll('.checkbox-dropdown-option');
        const optionCount = optionDivs.length;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (focusedIndex < optionCount - 1) {
                setFocusedOption(focusedIndex + 1);
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (focusedIndex > 0) {
                setFocusedOption(focusedIndex - 1);
            }
        } else if (e.key === " ") {
            e.preventDefault();
            if (focusedIndex >= 0 && focusedIndex < optionCount) {
                const checkbox = optionDivs[focusedIndex].querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event("change"));
                }
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            closePanel();
            trigger.focus();
        }
    });

    // Make panel focusable so it can receive keydown events when open
    panel.setAttribute("tabindex", "-1");

    // --- Initialize options ---
    buildOptions(options);

    // --- Public API ---

    return {
        element: wrapper,

        getSelected: function () {
            return Array.from(selectedValues);
        },

        setOptions: function (newOptions) {
            selectedValues.clear();
            buildOptions(newOptions);
            updateTriggerText();
        },

        reset: function () {
            clearAll();
        }
    };
}

/**
 * Render the inline GNG Readiness section:
 * - DH selector dropdown with "All" as first and default-selected option
 * - Equipment Type Checkbox Dropdown filter
 * - Phase Checkbox Dropdown filter
 * - Vendor Summary container
 * - Detail Report container
 * Wires event listeners for DH selector change.
 * Creates Checkbox Dropdown instances for Equipment Type and Phase filters.
 * Calls applyGNGFilters() for the initial render.
 */
function renderGNGSection() {
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

    // Build equipment type options (sorted distinct types)
    const equipmentTypes = buildEquipmentTypeOptions(openChecklists);

    // Render controls: DH selector with "All" first
    const dhOptionsHtml = [
        '<option value="All" selected>All</option>',
        ...dhLabels.map(label =>
            `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`
        )
    ].join("");

    content.innerHTML = `
        <div class="gng-controls gng-filter-row">
            <div class="filter-field">
                <label for="gng-dh-select">Data Hall</label>
                <select id="gng-dh-select">
                    ${dhOptionsHtml}
                </select>
            </div>
            <div id="gng-type-dropdown-slot"></div>
            <div id="gng-phase-dropdown-slot"></div>
        </div>
        <div id="gng-vendor-summary"></div>
        <div id="gng-detail-report"></div>
    `;

    // Create Equipment Type Checkbox Dropdown
    gngTypeDropdown = createCheckboxDropdown({
        id: 'gng-type',
        label: 'Equipment Type',
        placeholder: 'All Types',
        options: equipmentTypes,
        onChange: applyGNGFilters
    });

    // Create Phase Checkbox Dropdown
    gngPhaseDropdown = createCheckboxDropdown({
        id: 'gng-phase',
        label: 'Phase',
        placeholder: 'All Phases',
        options: buildPhaseOptions(openChecklists),
        onChange: applyGNGFilters
    });

    // Insert dropdown elements into slots
    document.getElementById("gng-type-dropdown-slot").appendChild(gngTypeDropdown.element);
    document.getElementById("gng-phase-dropdown-slot").appendChild(gngPhaseDropdown.element);

    // Store references for filter logic
    gngDHMap = dhMap;
    gngAllChecklists = openChecklists;

    // Wire event handlers
    document.getElementById("gng-dh-select").addEventListener("change", applyGNGFilters);

    // Initial render with "All" and no type/phase filter
    applyGNGFilters();
}

/**
 * Apply combined DH + Equipment Type + Phase filters and re-render GNG tables.
 * Reads DH selector value and gets selections from checkbox dropdown instances,
 * filters data accordingly, stores filtered state, and renders both vendor summary
 * and detail tables.
 */
function applyGNGFilters() {
    const dhSelect = document.getElementById("gng-dh-select");
    if (!dhSelect) return;

    const selectedDH = dhSelect.value;

    // Step 1: Filter by data hall
    let rows;
    if (selectedDH === "All") {
        rows = gngAllChecklists;
    } else {
        rows = gngDHMap[selectedDH] || [];
    }

    // Step 2: Filter by equipment type (empty selection = all types)
    const selectedTypes = gngTypeDropdown ? gngTypeDropdown.getSelected() : [];
    if (selectedTypes.length > 0) {
        rows = rows.filter(eq => selectedTypes.includes(eq.equipment_type));
    }

    // Step 3: Filter by phase (empty selection = all phases)
    const selectedPhases = gngPhaseDropdown ? gngPhaseDropdown.getSelected() : [];
    if (selectedPhases.length > 0) {
        rows = rows.filter(eq =>
            (eq.open_items || []).some(item => selectedPhases.includes(item.phase || ""))
        );
    }

    // Step 4: For rendering/export, filter open_items within each row when phase filter active
    const displayRows = selectedPhases.length > 0
        ? rows.map(eq => ({
            ...eq,
            open_items: (eq.open_items || []).filter(item => selectedPhases.includes(item.phase || ""))
        }))
        : rows;

    // Store current filtered state for export
    gngCurrentRows = displayRows;
    gngCurrentDHLabel = selectedDH;
    gngSelectedTypes = selectedTypes;

    // Render tables with filtered data
    renderVendorSummaryTable(displayRows, selectedDH, selectedTypes);
    renderDetailTable(displayRows, selectedDH);
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
 * Extract distinct equipment_type values from open_checklists,
 * sorted in ascending case-insensitive alphabetical order.
 * Records with missing/falsy equipment_type are excluded.
 *
 * @param {Array} openChecklists - Array of equipment objects
 * @returns {string[]} Sorted distinct equipment type values
 */
function buildEquipmentTypeOptions(openChecklists) {
    const typeSet = new Set();
    for (const eq of openChecklists) {
        if (eq.equipment_type) {
            typeSet.add(eq.equipment_type);
        }
    }
    return [...typeSet].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
    );
}

/**
 * Extract distinct phase values from all open_items across all equipment records.
 * Returns sorted array (case-insensitive ascending).
 *
 * @param {Array} openChecklists - Array of equipment objects with open_items
 * @returns {string[]} Sorted distinct phase values
 */
function buildPhaseOptions(openChecklists) {
    const phaseSet = new Set();
    if (!Array.isArray(openChecklists)) {
        return [];
    }
    for (const eq of openChecklists) {
        const items = Array.isArray(eq.open_items) ? eq.open_items : [];
        for (const item of items) {
            const phase = item.phase !== undefined && item.phase !== null ? String(item.phase) : "";
            if (phase !== "") {
                phaseSet.add(phase);
            }
        }
    }
    return [...phaseSet].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
    );
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
        for (const item of (eq.open_items || [])) {
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
 * Renders empty message when rows is empty or no vendors found.
 * When selectedTypes is non-empty, excludes non-selected type columns.
 * Wraps table in .table-scroll-container; applies data-table class to <table>.
 */
function renderVendorSummaryTable(rows, dhLabel, selectedTypes = []) {
    const container = document.getElementById("gng-vendor-summary");
    if (!container) return;

    // Empty state
    if (!rows || rows.length === 0) {
        container.innerHTML = '<p class="gng-copy-msg">No equipment with open checklists for this selection.</p>';
        return;
    }

    const { vendors, types, counts } = buildVendorSummary(rows);

    // If no vendors found (all equipment has empty open_items), show empty message
    if (vendors.length === 0) {
        container.innerHTML = '<p class="gng-copy-msg">No equipment with open checklists for this selection.</p>';
        return;
    }

    // If type filter is active, exclude non-selected type columns
    let displayTypes = types;
    if (selectedTypes.length > 0) {
        displayTypes = types.filter(t => selectedTypes.includes(t));
    }

    // Build header row
    const headerCells = ['<th>Vendor</th>']
        .concat(displayTypes.map(t => `<th>${escapeHtml(t)}</th>`))
        .concat(['<th>Total Open Checklists</th>'])
        .join("");

    // Build vendor data rows and track column totals
    const colTotals = {};
    for (const t of displayTypes) colTotals[t] = 0;
    let grandTotal = 0;

    const bodyRows = vendors.map(vendor => {
        let rowTotal = 0;
        const cells = displayTypes.map(type => {
            const count = (counts[vendor] && counts[vendor][type]) || 0;
            rowTotal += count;
            colTotals[type] += count;
            return `<td>${count}</td>`;
        });
        grandTotal += rowTotal;
        return `<tr><td>${escapeHtml(vendor)}</td>${cells.join("")}<td>${rowTotal}</td></tr>`;
    }).join("");

    // Build TOTAL footer row
    const totalCells = displayTypes.map(type => `<td>${colTotals[type]}</td>`).join("");
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
 * When rows is empty, renders "No equipment with open checklists for this selection."
 *
 * @param {Array} rows - Array of equipment objects for the selected data hall
 * @param {string} dhLabel - The selected data hall label (e.g., "DH115")
 */
function renderDetailTable(rows, dhLabel) {
    const container = document.getElementById("gng-detail-report");
    if (!container) return;

    // Handle empty case
    if (!rows || rows.length === 0) {
        container.innerHTML = '<p>No equipment with open checklists for this selection.</p>';
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

    // Build header row — first 3 columns get frozen classes
    let headerCells = '<th class="frozen-col-1">Equipment ID</th><th class="frozen-col-2">Area</th><th class="frozen-col-3 frozen-col-separator">Equipment Type</th>';
    for (let i = 1; i <= maxN; i++) {
        headerCells += `<th>Missing Checklist #${i}</th><th>Assignee #${i}</th>`;
    }

    // Build body rows — first 3 cells get frozen classes
    let bodyRows = '';
    for (const eq of sortedRows) {
        const openItems = eq.open_items || [];
        let cells = '';
        cells += `<td class="frozen-col-1">${escapeHtml(eq.equipment_id || "")}</td>`;
        cells += `<td class="frozen-col-2">${escapeHtml(eq.area || "")}</td>`;
        cells += `<td class="frozen-col-3 frozen-col-separator">${escapeHtml(eq.equipment_type || "")}</td>`;

        for (let i = 0; i < maxN; i++) {
            if (i < openItems.length) {
                cells += `<td>${escapeHtml(openItems[i].phase || "")}</td>`;
                cells += `<td>${escapeHtml(openItems[i].vendor || "Unassigned")}</td>`;
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
    const selectedTypes = gngSelectedTypes;

    if (type === "vendor") {
        const { vendors, types, counts } = buildVendorSummary(rows);

        // If type filter is active, exclude non-selected type columns (matches rendered table)
        let displayTypes = types;
        if (selectedTypes.length > 0) {
            displayTypes = types.filter(t => selectedTypes.includes(t));
        }

        const title = "GNG Readiness – Open Checklist Assignment Report / Vendor Summary";
        const subHeader = `Data Hall: ${dhLabel}`;
        const headers = ["Vendor", ...displayTypes, "Total Open Checklists"];

        const dataRows = vendors.map(vendor => {
            let rowTotal = 0;
            const cells = displayTypes.map(t => {
                const count = (counts[vendor] && counts[vendor][t]) || 0;
                rowTotal += count;
                return String(count);
            });
            return [vendor, ...cells, String(rowTotal)];
        });

        // TOTAL row
        const colTotals = displayTypes.map(t => {
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
                    row.push(openItems[i].phase || "", openItems[i].vendor || "Unassigned");
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


// =========================================
// SCHEDULING TOOL — Module State & Constants
// =========================================

const schedulingState = {
    selectedDataHall: null,       // string | null — currently selected DH label
    selectedPhase: "L2 Inspections", // "L2 Inspections" | "L2 Walks"
    selectedSubChecklists: [],    // string[] — currently selected sub-checklist column names
    computedRows: [],             // SchedulingRow[] — current table data
    dataHalls: []                 // string[] — available DH labels from current data
};

const SCHEDULING_PHASE_MAP = {
    "L2 Inspections": ["L2.1.1", "L2.1.2", "L2.2C", "L2.2E", "L2.2M", "L2.3V"],
    "L2 Walks": ["L2.4", "L2.4.1", "L2.4.1E", "L2.4.1M"]
};

const EQUIPMENT_TYPE_ORDER = [
    "XFMR", "SWD", "UPS", "MBB", "BATT", "CHWP", "VFD",
    "COD", "MOD", "CHLR", "CDU", "CRAH-ER", "ATS", "PDU", "BUS", "CRAH-DH"
];

const LINE_UP_ORDER = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "R"];

// =========================================
// SCHEDULING TOOL — Data Derivation Functions
// =========================================

/**
 * Derive the Data Hall label from an Area string.
 * Extracts the "DH" prefix followed by a numeric portion from the Area field.
 * Examples:
 *   "DH110 [DH]" → "DH110"
 *   "DH1150 [DH]" → "DH115" (truncates to first 3 digits)
 *   "" → null
 *   "Some Other Value" → null
 *
 * Returns null if no valid DH pattern can be found.
 */
function deriveSchedulingDataHall(area) {
    if (!area || typeof area !== 'string') return null;
    const match = area.match(/DH(\d{3,4})/i);
    if (!match) return null;
    return "DH" + match[1].slice(0, 3);
}

/**
 * Derive Line-Up letter from Equipment ID.
 * Finds the first substring matching [A-Z]\d{3} pattern and returns the leading letter.
 * Returns null if no matching segment found.
 *
 * Examples:
 *   "ATS-A110" → "A" (the "A110" segment matches [A-Z]\d{3})
 *   "SWD-B220-X" → "B"
 *   "NO-MATCH" → null
 */
function deriveLineUp(equipmentId) {
    if (!equipmentId || typeof equipmentId !== 'string') return null;
    const match = equipmentId.match(/[A-Z]\d{3}/);
    return match ? match[0].charAt(0) : null;
}

// =========================================
// SCHEDULING TOOL — Navigation & Panel Toggle
// =========================================

/**
 * Activate the Scheduling Tool panel.
 * Hides all other dashboard panels and shows the scheduling panel.
 * Highlights the Scheduling Tool nav button.
 */
function activateSchedulingTool() {
    // Hide other panels
    const panelsToHide = document.querySelectorAll(
        '.search-panel, .summary-panel, .filter-panel, .checklist-panel, .issues-panel'
    );
    panelsToHide.forEach(panel => panel.classList.add("hidden"));

    const gngSection = document.getElementById("gng-section");
    if (gngSection) gngSection.classList.add("hidden");

    const notFoundSection = document.getElementById("not-found-section");
    if (notFoundSection) notFoundSection.classList.add("hidden");

    const emptyState = document.getElementById("empty-state");
    if (emptyState) emptyState.classList.add("hidden");

    // Show scheduling panel
    const schedulingPanel = document.getElementById("scheduling-panel");
    if (schedulingPanel) schedulingPanel.classList.remove("hidden");

    // Highlight nav button
    const schedulingBtn = document.getElementById("scheduling-tool-btn");
    if (schedulingBtn) schedulingBtn.classList.add("active");
}

/**
 * Deactivate the Scheduling Tool panel.
 * Hides the scheduling panel and restores other dashboard panels.
 * Removes highlight from the Scheduling Tool nav button.
 */
function deactivateSchedulingTool() {
    // Hide scheduling panel
    const schedulingPanel = document.getElementById("scheduling-panel");
    if (schedulingPanel) schedulingPanel.classList.add("hidden");

    // Restore other panels
    const panelsToRestore = document.querySelectorAll(
        '.search-panel, .summary-panel, .filter-panel, .checklist-panel, .issues-panel'
    );
    panelsToRestore.forEach(panel => panel.classList.remove("hidden"));

    const gngSection = document.getElementById("gng-section");
    if (gngSection) gngSection.classList.remove("hidden");

    // Remove nav button highlight
    const schedulingBtn = document.getElementById("scheduling-tool-btn");
    if (schedulingBtn) schedulingBtn.classList.remove("active");
}

// =========================================
// SCHEDULING TOOL — Data Hall Selector
// =========================================

/**
 * Populate the Data Hall selector with unique values derived from state.equipment.
 * - Derives DH labels using deriveSchedulingDataHall(), filters nulls, sorts alphanumerically
 * - Updates schedulingState.dataHalls
 * - Disables selector with message when no Data Hall values are available
 * - Preserves current selection if still valid; otherwise clears it
 * - Hides the table until a selection is made
 * - Sets up change handler to filter equipment and trigger re-render
 */
function renderSchedulingDataHallSelector() {
    const select = document.getElementById("scheduling-data-hall-select");
    const table = document.getElementById("scheduling-table");
    if (!select) return;

    // Derive unique Data Hall values from equipment data
    const dhSet = new Set();
    (state.equipment || []).forEach(item => {
        const dh = deriveSchedulingDataHall(item["Area"]);
        if (dh) dhSet.add(dh);
    });

    // Sort alphanumerically and store in scheduling state
    const dataHalls = Array.from(dhSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    schedulingState.dataHalls = dataHalls;

    // Clear existing options (keep only the default prompt)
    select.innerHTML = '';

    if (dataHalls.length === 0) {
        // No data halls available — disable selector with message
        const disabledOption = document.createElement("option");
        disabledOption.value = "";
        disabledOption.textContent = "No Data Halls available";
        select.appendChild(disabledOption);
        select.disabled = true;
        schedulingState.selectedDataHall = null;

        // Hide table when no data halls
        if (table) table.classList.add("hidden");
        return;
    }

    // Enable selector and add default prompt option
    select.disabled = false;
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "-- Select Data Hall --";
    select.appendChild(defaultOption);

    // Populate with available Data Hall values
    dataHalls.forEach(dh => {
        const option = document.createElement("option");
        option.value = dh;
        option.textContent = dh;
        select.appendChild(option);
    });

    // Preserve current selection if still valid; otherwise clear it
    if (schedulingState.selectedDataHall && dataHalls.includes(schedulingState.selectedDataHall)) {
        select.value = schedulingState.selectedDataHall;
    } else {
        schedulingState.selectedDataHall = null;
        select.value = "";
    }

    // Show/hide table based on current selection
    if (table) {
        if (schedulingState.selectedDataHall) {
            table.classList.remove("hidden");
        } else {
            table.classList.add("hidden");
        }
    }

    // Set up change handler (remove previous to avoid duplicates)
    select.removeEventListener("change", handleSchedulingDataHallChange);
    select.addEventListener("change", handleSchedulingDataHallChange);
}

/**
 * Handle Data Hall selector change event.
 * Updates schedulingState, shows/hides table, and triggers recalculation.
 */
function handleSchedulingDataHallChange(event) {
    const value = event.target.value;
    const table = document.getElementById("scheduling-table");

    schedulingState.selectedDataHall = value || null;

    if (table) {
        if (schedulingState.selectedDataHall) {
            table.classList.remove("hidden");
        } else {
            table.classList.add("hidden");
        }
    }

    // Trigger computation and re-render if a Data Hall is selected
    if (schedulingState.selectedDataHall) {
        if (typeof computeSchedulingRows === "function") {
            const filtered = (state.equipment || []).filter(item => {
                const dh = deriveSchedulingDataHall(item["Area"]);
                return dh === schedulingState.selectedDataHall;
            });
            schedulingState.computedRows = computeSchedulingRows(filtered, schedulingState.selectedSubChecklists);
        }
        if (typeof renderSchedulingTable === "function") {
            renderSchedulingTable();
        }
    }
}

// =========================================
// SCHEDULING TOOL — Phase & Sub-Checklist Selection
// =========================================

/**
 * Render the scheduling phase selector and sub-checklist checkboxes.
 *
 * - Reads the current phase from #scheduling-phase-select (or schedulingState.selectedPhase)
 * - Renders checkboxes for the corresponding sub-checklists into #scheduling-subchecklist-checkboxes
 * - Defaults all sub-checklists to selected (checked) on first render or phase switch
 * - Sets up a change handler on the phase selector to re-render on phase change
 * - Discards previous phase selection state on switch
 * - Triggers recalculation (computeSchedulingRows) when phase changes
 */
function renderSchedulingPhaseSelector() {
    const phaseSelect = document.getElementById("scheduling-phase-select");
    const checkboxContainer = document.getElementById("scheduling-subchecklist-checkboxes");
    if (!phaseSelect || !checkboxContainer) return;

    // Read current phase from the DOM select element
    const currentPhase = phaseSelect.value || schedulingState.selectedPhase;

    // Update state to reflect current phase
    schedulingState.selectedPhase = currentPhase;

    // Render sub-checklist checkboxes for the active phase
    renderSubChecklistCheckboxes(currentPhase, checkboxContainer);

    // Set up change handler on the phase select (remove previous to avoid duplicates)
    phaseSelect.removeEventListener("change", handleSchedulingPhaseChange);
    phaseSelect.addEventListener("change", handleSchedulingPhaseChange);
}

/**
 * Render sub-checklist checkboxes for the given phase.
 * All checkboxes default to checked. Updates schedulingState.selectedSubChecklists.
 *
 * @param {string} phase — "L2 Inspections" or "L2 Walks"
 * @param {HTMLElement} container — the DOM element to render checkboxes into
 */
function renderSubChecklistCheckboxes(phase, container) {
    const subChecklists = SCHEDULING_PHASE_MAP[phase] || [];

    // Clear existing checkboxes
    container.innerHTML = "";

    // Default all sub-checklists to selected
    schedulingState.selectedSubChecklists = [...subChecklists];

    // Create a checkbox for each sub-checklist
    subChecklists.forEach(subChecklist => {
        const label = document.createElement("label");
        label.className = "scheduling-subchecklist-label";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = subChecklist;
        checkbox.checked = true;
        checkbox.className = "scheduling-subchecklist-checkbox";

        // Handle individual checkbox toggle
        checkbox.addEventListener("change", function () {
            handleSubChecklistToggle(subChecklist, this.checked);
        });

        const span = document.createElement("span");
        span.textContent = subChecklist;

        label.appendChild(checkbox);
        label.appendChild(span);
        container.appendChild(label);
    });
}

/**
 * Handle phase selector change event.
 * Updates state, re-renders sub-checklist checkboxes (all checked by default),
 * discards previous phase selection state, and triggers recalculation.
 */
function handleSchedulingPhaseChange(event) {
    const newPhase = event.target.value;
    const checkboxContainer = document.getElementById("scheduling-subchecklist-checkboxes");

    // Update state — discard previous phase's selection
    schedulingState.selectedPhase = newPhase;

    // Re-render checkboxes for the new phase (all defaulted to selected)
    if (checkboxContainer) {
        renderSubChecklistCheckboxes(newPhase, checkboxContainer);
    }

    // Trigger recalculation if a Data Hall is selected
    if (schedulingState.selectedDataHall) {
        if (typeof computeSchedulingRows === "function") {
            const filtered = (state.equipment || []).filter(item => {
                const dh = deriveSchedulingDataHall(item["Area"]);
                return dh === schedulingState.selectedDataHall;
            });
            schedulingState.computedRows = computeSchedulingRows(filtered, schedulingState.selectedSubChecklists);
        }
        if (typeof renderSchedulingTable === "function") {
            renderSchedulingTable();
        }
    }
}

/**
 * Handle individual sub-checklist checkbox toggle.
 * Updates schedulingState.selectedSubChecklists and triggers recalculation.
 *
 * @param {string} subChecklist — the sub-checklist column name toggled
 * @param {boolean} isChecked — whether the checkbox is now checked
 */
function handleSubChecklistToggle(subChecklist, isChecked) {
    if (isChecked) {
        // Add to selected if not already present
        if (!schedulingState.selectedSubChecklists.includes(subChecklist)) {
            schedulingState.selectedSubChecklists.push(subChecklist);
        }
    } else {
        // Remove from selected
        schedulingState.selectedSubChecklists = schedulingState.selectedSubChecklists.filter(
            sc => sc !== subChecklist
        );
    }

    // Trigger recalculation if a Data Hall is selected
    if (schedulingState.selectedDataHall) {
        if (typeof computeSchedulingRows === "function") {
            const filtered = (state.equipment || []).filter(item => {
                const dh = deriveSchedulingDataHall(item["Area"]);
                return dh === schedulingState.selectedDataHall;
            });
            schedulingState.computedRows = computeSchedulingRows(filtered, schedulingState.selectedSubChecklists);
        }
        if (typeof renderSchedulingTable === "function") {
            renderSchedulingTable();
        }
    }
}

// ─── Scheduling Tool: Computation Functions ────────────────────────────────────

/**
 * Compute completion metrics for a set of equipment records and selected sub-checklists.
 *
 * For each record, for each sub-checklist column:
 *   - Value of 1 (or "1"): counts toward both `complete` and `total`
 *   - Value of 0 (or "0"): counts toward `total` only (incomplete but applicable)
 *   - Value of "-": skipped entirely (not applicable, excluded from total)
 *
 * @param {Object[]} records — equipment records matching a specific type + line-up
 * @param {string[]} subChecklists — column names to evaluate
 * @returns {{ complete: number, total: number, percent: number }}
 */
function computeCompletion(records, subChecklists) {
    let complete = 0;
    let total = 0;

    for (const record of records) {
        for (const col of subChecklists) {
            const raw = record[col];

            // Skip not-applicable entries
            if (raw === "-") {
                continue;
            }

            const num = Number(raw);

            if (num === 1) {
                complete++;
                total++;
            } else if (num === 0) {
                total++;
            }
            // Any other value (NaN from non-numeric, or unexpected numbers) is ignored
        }
    }

    const percent = total > 0 ? Math.round((complete / total) * 100) : 0;

    return { complete, total, percent };
}

/**
 * Compute scheduling table rows from equipment data.
 *
 * Algorithm:
 * 1. Filter out records with missing/empty "Equipment Type" field
 * 2. Filter out records where deriveLineUp returns null
 * 3. Group remaining records by Equipment Type → Line-Up
 * 4. For each Equipment Type (in EQUIPMENT_TYPE_ORDER):
 *    a. Skip if no records exist for this type
 *    b. For each Line-Up (in LINE_UP_ORDER):
 *       - Skip if no records for this type + line-up combo
 *       - Call computeCompletion to get metrics
 *       - Create a SchedulingRow with isTotalRow: false
 *    c. Create a Total_Row by summing across all line-up rows, compute percent
 *    d. Place Total_Row FIRST (above line-up rows) in the output for that group
 * 5. Return the full array of rows
 *
 * @param {Object[]} equipment — filtered equipment records for selected data hall
 * @param {string[]} selectedSubChecklists — column names to include in calculation
 * @returns {SchedulingRow[]} — rows sorted by fixed Equipment Type then Line-Up order
 */
function computeSchedulingRows(equipment, selectedSubChecklists) {
    const rows = [];
    const currentPhase = schedulingState.selectedPhase;

    // Step 1 & 2: Filter out records with missing/empty Equipment Type or non-derivable Line-Up
    const validRecords = (equipment || []).filter(record => {
        const eqType = record["Equipment Type"];
        if (!eqType || (typeof eqType === "string" && eqType.trim() === "")) {
            return false;
        }
        const lineUp = deriveLineUp(record["Equipment ID"]);
        if (!lineUp) {
            return false;
        }
        return true;
    });

    // Step 3: Group by Equipment Type → Line-Up
    const groups = {};
    for (const record of validRecords) {
        const eqType = record["Equipment Type"];
        const lineUp = deriveLineUp(record["Equipment ID"]);

        if (!groups[eqType]) {
            groups[eqType] = {};
        }
        if (!groups[eqType][lineUp]) {
            groups[eqType][lineUp] = [];
        }
        groups[eqType][lineUp].push(record);
    }

    // Step 4: Iterate in fixed order
    for (const eqType of EQUIPMENT_TYPE_ORDER) {
        // 4a. Skip if no records exist for this type
        if (!groups[eqType]) {
            continue;
        }

        const lineUpRows = [];
        let totalComplete = 0;
        let totalTotal = 0;

        // 4b. For each Line-Up in fixed order
        for (const lineUp of LINE_UP_ORDER) {
            if (!groups[eqType][lineUp] || groups[eqType][lineUp].length === 0) {
                continue;
            }

            const metrics = computeCompletion(groups[eqType][lineUp], selectedSubChecklists);

            lineUpRows.push({
                equipmentType: eqType,
                checklistPhase: currentPhase,
                lineUp: lineUp,
                checklistsComplete: metrics.complete,
                totalChecklists: metrics.total,
                percentComplete: metrics.percent,
                isTotalRow: false
            });

            totalComplete += metrics.complete;
            totalTotal += metrics.total;
        }

        // Skip this equipment type entirely if no line-up rows were generated
        if (lineUpRows.length === 0) {
            continue;
        }

        // 4c & 4d: Create Total_Row and place it FIRST
        const totalPercent = totalTotal > 0 ? Math.round((totalComplete / totalTotal) * 100) : 0;

        rows.push({
            equipmentType: eqType,
            checklistPhase: currentPhase,
            lineUp: "-",
            checklistsComplete: totalComplete,
            totalChecklists: totalTotal,
            percentComplete: totalPercent,
            isTotalRow: true
        });

        // Add all line-up rows after the total row
        for (const row of lineUpRows) {
            rows.push(row);
        }
    }

    return rows;
}

// =========================================
// SCHEDULING TOOL — Table Rendering
// =========================================

/**
 * Render the scheduling table from schedulingState.computedRows.
 * Populates the thead with column headers and tbody with data rows.
 * Total rows receive the "total-row" class for bold styling.
 * The selected Checklist Phase name is displayed in every row's Checklist Phase column.
 * Percent_Complete is displayed as a whole number followed by "%".
 */
function renderSchedulingTable() {
    const thead = document.getElementById("scheduling-table-head");
    const tbody = document.getElementById("scheduling-table-body");

    if (!thead || !tbody) return;

    // Render header row
    thead.innerHTML = "";
    const headerRow = document.createElement("tr");
    const headers = ["Equipment Type", "Checklist Phase", "Line Up", "Checklists Complete", "Total Checklists", "% Complete"];
    for (const headerText of headers) {
        const th = document.createElement("th");
        th.textContent = headerText;
        headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);

    // Clear and re-render tbody from computedRows
    tbody.innerHTML = "";
    const rows = schedulingState.computedRows || [];

    for (const row of rows) {
        const tr = document.createElement("tr");

        // Add total-row class for bold text formatting on total rows
        if (row.isTotalRow) {
            tr.classList.add("total-row");
        }

        // Equipment Type cell
        const tdEquipType = document.createElement("td");
        tdEquipType.textContent = row.equipmentType;
        tr.appendChild(tdEquipType);

        // Checklist Phase cell — always shows the selected phase name
        const tdPhase = document.createElement("td");
        tdPhase.textContent = row.checklistPhase;
        tr.appendChild(tdPhase);

        // Line Up cell — "-" for total rows, letter for line-up rows
        const tdLineUp = document.createElement("td");
        tdLineUp.textContent = row.lineUp;
        tr.appendChild(tdLineUp);

        // Checklists Complete cell
        const tdComplete = document.createElement("td");
        tdComplete.textContent = row.checklistsComplete;
        tr.appendChild(tdComplete);

        // Total Checklists cell
        const tdTotal = document.createElement("td");
        tdTotal.textContent = row.totalChecklists;
        tr.appendChild(tdTotal);

        // % Complete cell — whole number followed by "%"
        const tdPercent = document.createElement("td");
        tdPercent.textContent = row.percentComplete + "%";
        tr.appendChild(tdPercent);

        tbody.appendChild(tr);
    }
}

// =========================================
// SCHEDULING TOOL — Panel Orchestration
// =========================================

/**
 * Orchestration function for the Scheduling Tool panel.
 * Coordinates rendering of Data Hall selector, Phase selector,
 * Sub-Checklist toggles, and table.
 *
 * Handles:
 * - No data loaded state: shows "No data available" message
 * - No Data Hall selected: shows prompt to select a Data Hall
 * - Data Hall selected: filters equipment, computes rows, renders table
 *
 * Called when:
 * - Scheduling tool is first activated
 * - After data reloads
 * - Can be called from activateSchedulingTool() to initialize the panel
 *
 * Validates: Requirements 2.3, 2.5
 */
function renderSchedulingPanel() {
    const panel = document.getElementById("scheduling-panel");
    if (!panel) return;

    const table = document.getElementById("scheduling-table");
    const controlsContainer = panel.querySelector(".scheduling-controls");
    const actionsContainer = panel.querySelector(".scheduling-actions");

    // Remove any existing status message
    const existingMessage = panel.querySelector(".scheduling-status-message");
    if (existingMessage) existingMessage.remove();

    // Check if equipment data is available
    if (!state.equipment || state.equipment.length === 0) {
        // No data loaded — show message, hide controls and table
        if (controlsContainer) controlsContainer.classList.add("hidden");
        if (table) table.classList.add("hidden");
        if (actionsContainer) actionsContainer.classList.add("hidden");

        const messageDiv = document.createElement("div");
        messageDiv.className = "scheduling-status-message";
        messageDiv.textContent = "No data available";
        // Insert message after the panel header
        const panelHeader = panel.querySelector(".panel-header");
        if (panelHeader && panelHeader.nextSibling) {
            panel.insertBefore(messageDiv, panelHeader.nextSibling);
        } else {
            panel.appendChild(messageDiv);
        }
        return;
    }

    // Data is available — show controls
    if (controlsContainer) controlsContainer.classList.remove("hidden");
    if (actionsContainer) actionsContainer.classList.remove("hidden");

    // Render the Data Hall selector (populates dropdown, updates schedulingState.dataHalls)
    renderSchedulingDataHallSelector();

    // Render the Phase selector and Sub-Checklist checkboxes
    renderSchedulingPhaseSelector();

    // Check if a Data Hall is selected
    if (schedulingState.selectedDataHall) {
        // Filter equipment by selected Data Hall
        const filtered = (state.equipment || []).filter(item => {
            const dh = deriveSchedulingDataHall(item["Area"]);
            return dh === schedulingState.selectedDataHall;
        });

        // Compute rows from filtered equipment and selected sub-checklists
        schedulingState.computedRows = computeSchedulingRows(filtered, schedulingState.selectedSubChecklists);

        // Show table and render it
        if (table) table.classList.remove("hidden");
        renderSchedulingTable();
    } else {
        // No Data Hall selected — hide table, show prompt
        if (table) table.classList.add("hidden");

        const promptDiv = document.createElement("div");
        promptDiv.className = "scheduling-status-message";
        promptDiv.textContent = "Select a Data Hall to view scheduling data";
        // Insert prompt after controls
        if (controlsContainer && controlsContainer.nextSibling) {
            panel.insertBefore(promptDiv, controlsContainer.nextSibling);
        } else if (controlsContainer) {
            panel.insertBefore(promptDiv, table ? table.parentElement : null);
        } else {
            panel.appendChild(promptDiv);
        }
    }
}

// =========================================
// SCHEDULING TOOL — Export (TSV)
// =========================================

/**
 * Build tab-separated string from current scheduling table state.
 * Includes header row, total rows, and line-up rows in display order.
 * Validates: Requirements 7.2, 7.3, 7.4
 *
 * @returns {string} — TSV string with header and data rows separated by newlines
 */
function buildSchedulingTSV() {
    const header = "Equipment Type\tChecklist Phase\tLine Up\tChecklists Complete\tTotal Checklists\t% Complete";
    const rows = schedulingState.computedRows || [];

    const lines = [header];

    for (const row of rows) {
        const line = [
            row.equipmentType,
            row.checklistPhase,
            row.lineUp,
            row.checklistsComplete,
            row.totalChecklists,
            row.percentComplete + "%"
        ].join("\t");
        lines.push(line);
    }

    return lines.join("\n");
}

/**
 * Copy the scheduling table to the clipboard as TSV text.
 * Shows a success toast for 3 seconds on success, or an error toast on failure.
 * Validates: Requirements 7.1, 7.2, 7.5, 7.6
 */
async function copySchedulingTable() {
    const toast = document.getElementById("scheduling-toast");

    try {
        const tsv = buildSchedulingTSV();
        await navigator.clipboard.writeText(tsv);

        // Show success toast
        toast.textContent = "Copied to clipboard!";
        toast.classList.remove("hidden", "error");
        toast.classList.add("success");
    } catch (err) {
        // Show error toast
        toast.textContent = "Copy failed \u2014 please try again";
        toast.classList.remove("hidden", "success");
        toast.classList.add("error");
    }

    // Auto-hide toast after 3 seconds
    setTimeout(() => {
        toast.classList.add("hidden");
        toast.classList.remove("success", "error");
    }, 3000);
}
