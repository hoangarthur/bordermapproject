/**
 * calendar.js
 * Border Port Traffic Heatmap Visualization
 * Hierarchy: Region → State → Port
 * 
 * Features:
 * - Interactive heatmap with year/month view
 * - Filter by measure (Trucks, Cars, etc.)
 * - Sort ports by name or traffic volume
 * - Zoom into Region/State with SVG connection lines
 * - Responsive grid layout with color intensity
 * 
 * Data Source: history.csv
 *   Columns: Port Name, Date ("Jan 2020"), Value, Measure, State
 * 
 * Libraries:
 * - Papa Parse v5+: CSV parsing[](https://www.papaparse.com)
 * - Vanilla JS (ES6+)is used for DOM manipulation
 * - CSS Grid for layout
 * - Tooltip for cell details
 * - ChatGPT for code assistance
 * - Grok for rendering optimization
 * 
 *How to run file:
    * 1. Host files on a local server (e.g., using Live Server in VSCode) or run the command: 
    * python -m http.server 8000
    * 2. Open browser and navigate to http://localhost:8000/lineChart.html
 */
document.addEventListener("DOMContentLoaded", () => {
    // === DOM Elements ===
    const heatmapDiv = document.getElementById("heatmap");       // Main heatmap container
    const loading = document.getElementById("loading");         // Loading message
    const measureSelect = document.getElementById("measureSelect"); // Measure filter
    const sortSelect = document.getElementById("sortSelect");   // Sort order
    const applyBtn = document.getElementById("applyBtn");       // Apply button
    const viewToggle = document.getElementById("viewToggle");   // Toggle: Year / Month view
    const yearStart = document.getElementById("yearStart");     // Start year slider
    const yearEnd = document.getElementById("yearEnd");         // End year slider
    const yearDisplay = document.getElementById("yearDisplay"); // Year range text

    // === Data Containers ===
    let data = [], ports = [], years = [], measures = [];
    const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let currentMeasure = "Trucks";          // Current selected measure
    let sortMode = "alpha";                 // Sort: "alpha", "high-low", "low-high"
    let selectedYears = [];                 // Filtered years
    let viewMode = "byYear";                // View: "byYear" or "byMonth"
    let states = [], portToState = {}, statePorts = {}; // State → Ports mapping
    let portToBorder = {}; // Port → Border mapping
    let regions = [], regionToStates = {}, stateToRegionMap = {}; // Region → States
    let activeRegion = null, activeState = null; // Zoom state

    // === Performance Cache ===
    let cachedData = null;

    const regionColors = {
        "Pacific": "#4dabf7",
        "West": "#63e6be",
        "Northeast": "#ffd43b",
        "Midwest": "#ffa8a8",
        "South": "#b197fc",
        "Unknown": "#ced4da"
    };

    // === Contrast color helper ===
    function getContrastColor(bgColor) {
        const hex = bgColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? '#000' : '#fff';
    }

    // === Update year display text ===
    function updateYearDisplay() {
        const start = parseInt(yearStart.value);
        const end = parseInt(yearEnd.value);
        yearDisplay.textContent = `${start} – ${end}`;
    }

    // === Year slider sync ===
    yearStart.addEventListener("input", () => {
        const start = parseInt(yearStart.value);
        const end = parseInt(yearEnd.value);
        if (start > end) yearEnd.value = start;
        updateYearDisplay();
    });

    yearEnd.addEventListener("input", () => {
        const start = parseInt(yearStart.value);
        const end = parseInt(yearEnd.value);
        if (end < start) yearStart.value = end;
        updateYearDisplay();
    });

    // === Sort & View Toggle ===
    sortSelect.addEventListener("change", () => {
        sortMode = sortSelect.value;
        renderHeatmap();
    });

    viewToggle.addEventListener("change", () => {
        viewMode = viewToggle.checked ? "byMonth" : "byYear";
        renderHeatmap();
    });

    // === LOAD CSV DATA (Papa Parse) ===
    Papa.parse('history.csv', {
        download: true,
        header: true,
        complete: (results) => {
            loading.textContent = "Processing data...";
            const raw = results.data
                .filter(row => row["Port Name"] && row.Date && row.Value && row.Measure)
                .map(row => {
                    const [month, year] = row.Date.trim().split(" ");
                    return {
                        port: row["Port Name"].trim(),
                        month: month,
                        year: parseInt(year),
                        measure: row.Measure.trim(),
                        value: parseInt(row.Value) || 0
                    };
                });

            // === Map Ports to States and Borders ===
            raw.forEach(d => {
                if (!portToState[d.port]) {
                    const rowWithState = results.data.find(r => r["Port Name"]?.trim() === d.port);
                    const state = rowWithState?.State?.trim() || "Unknown";
                    const border = rowWithState?.Border?.trim() || "Unknown";
                    portToState[d.port] = state;
                    portToBorder[d.port] = border;
                    if (!statePorts[state]) statePorts[state] = [];
                    statePorts[state].push(d.port);
                }
            });

            states = Object.keys(statePorts).sort();
            if (raw.length === 0) {
                loading.textContent = "No data found!";
                return;
            }

            // === Extract unique values ===
            ports = [...new Set(raw.map(d => d.port))].sort();
            years = [...new Set(raw.map(d => d.year))].sort((a, b) => a - b);
            measures = [...new Set(raw.map(d => d.measure))].sort();
            data = raw;

            // === Map States to Regions (U.S. Census Bureau) ===
            const stateToRegion = {
                "Alaska": "Pacific", "California": "Pacific", "Washington": "Pacific",
                "Arizona": "West", "Idaho": "West", "Montana": "West", "New Mexico": "West",
                "Maine": "Northeast", "New York": "Northeast", "Vermont": "Northeast",
                "Michigan": "Midwest", "Minnesota": "Midwest", "North Dakota": "Midwest",
                "Texas": "South", "Unknown": "Unknown"
            };

            states.forEach(state => {
                const region = stateToRegion[state] || "Unknown";
                stateToRegionMap[state] = region;
                if (!regionToStates[region]) {
                    regionToStates[region] = [];
                    regions.push(region);
                }
                if (!regionToStates[region].includes(state)) {
                    regionToStates[region].push(state);
                }
            });
            regions = [...new Set(regions)].sort();

            // === Setup year sliders ===
            const minYear = Math.min(...years);
            const maxYear = Math.max(...years);
            yearStart.min = minYear; yearStart.max = maxYear;
            yearEnd.min = minYear; yearEnd.max = maxYear;
            yearStart.value = minYear;
            yearEnd.value = maxYear;
            updateYearDisplay();

            // === Populate measure dropdown ===
            measures.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m; opt.textContent = m;
                if (m === "Trucks") opt.selected = true;
                measureSelect.appendChild(opt);
            });
            const allOpt = document.createElement('option');
            allOpt.value = "All Vehicles"; allOpt.textContent = "All Vehicles";
            measureSelect.insertBefore(allOpt, measureSelect.firstChild);

            selectedYears = years.slice();
            renderHeatmap();
            loading.style.display = "none";
            applyBtn.disabled = false;
        },
        error: (err) => {
            console.error(err);
            loading.textContent = "Error loading data!";
        }
    });

    // === Apply Filters Button ===
    applyBtn.addEventListener('click', () => {
        currentMeasure = measureSelect.value;
        const start = parseInt(yearStart.value);
        const end = parseInt(yearEnd.value);
        selectedYears = [];
        for (let y = start; y <= end; y++) {
            if (years.includes(y)) selectedYears.push(y);
        }
        if (selectedYears.length === 0) {
            alert("No years selected!");
            return;
        }
        applyBtn.disabled = true;
        applyBtn.textContent = "Updating...";
        loading.style.display = "block";
        setTimeout(() => {
            cachedData = null;
            renderHeatmap();
            loading.style.display = "none";
            applyBtn.disabled = false;
            applyBtn.textContent = "Apply";
        }, 50);
    });

    // === Generate unique cache key ===
    function getFilterKey() {
        return `${currentMeasure}|${selectedYears.join(',')}|${activeRegion || ''}|${activeState || ''}|${viewMode}|${sortMode}`;
    }

    // === Preprocess filtered data ===
    function preprocessData() {
        let displayPorts = ports;
        if (activeRegion) {
            displayPorts = (regionToStates[activeRegion] || []).flatMap(s => statePorts[s] || []);
        } else if (activeState) {
            displayPorts = statePorts[activeState] || [];
        }

        const filteredMap = {};
        const portTotals = {};

        data.forEach(d => {
            if (
                selectedYears.includes(d.year) &&
                displayPorts.includes(d.port) &&
                (currentMeasure === "All Vehicles" || d.measure === currentMeasure)
            ) {
                const key = viewMode === "byYear"
                    ? `${d.port}|${d.year}|${d.month}`
                    : `${d.port}|${d.month}`;
                filteredMap[key] = (filteredMap[key] || 0) + d.value;
                portTotals[d.port] = (portTotals[d.port] || 0) + d.value;
            }
        });

        const values = Object.values(filteredMap).filter(v => v > 0);
        const minVal = values.length > 0 ? Math.min(...values) : 0;
        const maxVal = values.length > 0 ? Math.max(...values) : 1;

        return { filteredMap, displayPorts, minVal, maxVal, portTotals };
    }

    // === RENDER HEATMAP (Main Function) ===
    function renderHeatmap() {
        const filterKey = getFilterKey();
        if (!cachedData || cachedData.key !== filterKey) {
            const data = preprocessData();
            cachedData = { ...data, key: filterKey };
        }
        const { filteredMap, minVal, maxVal, portTotals } = cachedData;

        // Clear previous content
        heatmapDiv.innerHTML = '';
        document.querySelectorAll('.region-col.active, .state-col.active')
            .forEach(el => el.classList.remove('active'));

        if (selectedYears.length === 0) {
            heatmapDiv.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: #999;">No years selected</div>';
            return;
        }

        // === Calculate total data columns ===
        const totalCols = viewMode === "byYear" ? selectedYears.length * 12 : 12;

        // === SET GRID (Region:80px, State:110px, Port:150px, Data:repeat) ===
        heatmapDiv.style.gridTemplateColumns = `80px 110px 150px repeat(${totalCols}, 1fr)`;
        heatmapDiv.style.gridAutoRows = "20px";

        const fragment = document.createDocumentFragment();

        // === Empty header row (row 1: region, state, port) ===
        const emptyRegion = document.createElement('div');
        emptyRegion.style.gridRow = '1';
        emptyRegion.style.gridColumn = '1';
        fragment.appendChild(emptyRegion);

        const emptyState = document.createElement('div');
        emptyState.style.gridRow = '1';
        emptyState.style.gridColumn = '2';
        fragment.appendChild(emptyState);

        const emptyPort = document.createElement('div');
        emptyPort.style.gridRow = '1';
        emptyPort.style.gridColumn = '3';
        fragment.appendChild(emptyPort);

        // === Year or Month headers (row 2) ===
        if (viewMode === "byYear") {
            let colStart = 4;
            selectedYears.forEach(year => {
                const cell = document.createElement('div');
                cell.className = 'year-header';
                cell.textContent = year;
                cell.style.gridRow = '2';
                cell.style.gridColumn = `${colStart} / span 12`;
                fragment.appendChild(cell);
                colStart += 12;
            });
        } else {
            let col = 4;
            monthOrder.forEach(month => {
                const cell = document.createElement('div');
                cell.className = 'month-header';
                cell.textContent = month;
                cell.style.gridRow = '2';
                cell.style.gridColumn = col++;
                fragment.appendChild(cell);
            });
        }

        let currentRow = 3;

        // === Render each Region ===
        regions.forEach(region => {
            const statesInRegion = regionToStates[region] || [];
            const shouldShowRegion = !activeRegion || activeRegion === region;
            const regionRowSpan = shouldShowRegion
                ? statesInRegion.reduce((sum, s) => sum + (statePorts[s]?.length || 0), 0)
                : 1;

            // === Region Label ===
            const regionLabel = document.createElement('div');
            regionLabel.className = 'region-col';
            regionLabel.textContent = region;
            regionLabel.style.gridRow = `${currentRow} / span ${regionRowSpan}`;
            regionLabel.style.gridColumn = '1';
            regionLabel.style.cursor = 'pointer';
            if (activeRegion === region) regionLabel.classList.add('active');
            fragment.appendChild(regionLabel);

            regionLabel.onclick = (e) => {
                e.stopPropagation();
                activeState = null;
                activeRegion = activeRegion === region ? null : region;
                cachedData = null;
                renderHeatmap();
            };

            const regionBg = regionColors[region] || "#ccc";
            regionLabel.style.backgroundColor = regionBg;
            regionLabel.style.color = getContrastColor(regionBg);
            regionLabel.style.borderRadius = '4px 0 0 4px';

            let stateStartRow = currentRow;

            if (shouldShowRegion) {
                statesInRegion.forEach(state => {
                    let portsInState = [...(statePorts[state] || [])];

                    // === Sort ports ===
                    if (sortMode !== "alpha") {
                        portsInState.sort((a, b) => {
                            const ta = portTotals[a] || 0;
                            const tb = portTotals[b] || 0;
                            return sortMode === "high-low" ? tb - ta : ta - tb;
                        });
                    } else {
                        portsInState.sort();
                    }

                    const rowSpan = portsInState.length;
                    const shouldShowState = !activeState || activeState === state;

                    // === State Label ===
                    const stateLabel = document.createElement('div');
                    stateLabel.className = 'state-col';
                    stateLabel.textContent = state;
                    stateLabel.style.gridRow = `${stateStartRow} / span ${rowSpan}`;
                    stateLabel.style.gridColumn = '2';
                    stateLabel.style.cursor = 'pointer';
                    if (activeState === state) stateLabel.classList.add('active');
                    fragment.appendChild(stateLabel);

                    stateLabel.onclick = (e) => {
                        e.stopPropagation();
                        activeState = activeState === state ? null : state;
                        cachedData = null;
                        renderHeatmap();
                    };

                    const stateBg = regionColors[region] || "#eee";
                    stateLabel.style.backgroundColor = stateBg;
                    stateLabel.style.color = getContrastColor(stateBg);
                    stateLabel.style.borderRadius = '0';

                    if (shouldShowState) {
                        portsInState.forEach((port, idx) => {
                            const row = stateStartRow + idx;

                            // === Port Label ===
                            const portLabel = createPortLabel(port);
                            portLabel.style.gridRow = row;
                            portLabel.style.gridColumn = '3';
                            fragment.appendChild(portLabel);

                            // === Data Cells ===
                            let col = 4;
                            if (viewMode === "byYear") {
                                selectedYears.forEach(year => {
                                    monthOrder.forEach(month => {
                                        const key = `${port}|${year}|${month}`;
                                        const value = filteredMap[key] || 0;
                                        appendCell(fragment, value, `${port} | ${month} ${year} | ${value.toLocaleString()}`, minVal, maxVal, col++, row);
                                    });
                                });
                            } else {
                                monthOrder.forEach(month => {
                                    const key = `${port}|${month}`;
                                    const value = filteredMap[key] || 0;
                                    const yearsStr = selectedYears.length > 1 ? ` (${selectedYears.join(', ')})` : ` ${selectedYears[0]}`;
                                    appendCell(fragment, value, `${port} | ${month}${yearsStr} | ${value.toLocaleString()}`, minVal, maxVal, col++, row);
                                });
                            }
                        });
                    }

                    stateStartRow += rowSpan;
                });

                currentRow += regionRowSpan;
            } else {
                currentRow += 1;
            }
        });

        heatmapDiv.appendChild(fragment);
        const firstLegend = document.querySelector('.legend'); // First legend (color scale)
if (firstLegend) {
  const noneSpan = firstLegend.querySelector('span:first-child');
  const highSpan = firstLegend.querySelector('span:last-child');
  if (noneSpan && highSpan && maxVal > 0) {
    noneSpan.textContent = `None (0)`;
    highSpan.textContent = `High (${maxVal.toLocaleString()})`;
  } else if (maxVal === 0) {
    noneSpan.textContent = `No Data`;
    highSpan.textContent = `No Data`;
  }
}
    }

    // === HELPER FUNCTIONS ===

    // Append heatmap cell with color scale
    function appendCell(fragment, value, tooltip, minVal, maxVal, col = null, row = null) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.tooltip = tooltip;
        if (col) cell.style.gridColumn = col;
        if (row) cell.style.gridRow = row;

        const levels = ['#f0f0f0', '#92eee7ff', '#ebe00fff', '#ee970cff', '#cc0000'];
        const level = value === 0 ? 0 : Math.min(Math.floor((value - minVal) / (maxVal - minVal || 1) * 4) + 1, 4);
        cell.style.backgroundColor = levels[level];
        fragment.appendChild(cell);
    }

    // Create port label
    function createPortLabel(port) {
        const label = document.createElement('div');
        label.className = 'port-label';
        const border = portToBorder[port] || "Unknown";
        const country = border.includes("Mexico") ? "Mexico" : border.includes("Canada") ? "Canada" : "Unknown";
        label.textContent = `${port} (${country})`;
        label.title = `${port} - ${border}`;
        
        const state = portToState[port];
        const region = stateToRegionMap[state];
        const bg = regionColors[region] || "#f1f1f1";
        label.style.backgroundColor = bg;
        label.style.color = getContrastColor(bg);
        
        return label;
    }
});