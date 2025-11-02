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
 * 
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
    const svg = document.getElementById("connections");         // SVG for connection lines

    // === Data Containers ===
    let data = [], ports = [], years = [], measures = [];
    const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let currentMeasure = "Trucks";          // Current selected measure
    let sortMode = "alpha";                 // Sort: "alpha", "high-low", "low-high"
    let selectedYears = [];                 // Filtered years
    let viewMode = "byYear";                // View: "byYear" or "byMonth"
    let states = [], portToState = {}, statePorts = {}; // State → Ports mapping
    let regions = [], regionToStates = {}, stateToRegionMap = {}; // Region → States
    let activeRegion = null, activeState = null; // Zoom state

    // === Performance Cache ===
    let cachedData = null;

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

            // === Map Ports to States ===
            raw.forEach(d => {
                if (!portToState[d.port]) {
                    const rowWithState = results.data.find(r => r["Port Name"]?.trim() === d.port);
                    const state = rowWithState?.State?.trim() || "Unknown";
                    portToState[d.port] = state;
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
        svg.innerHTML = '';
        document.querySelectorAll('.region-col.active, .state-col.active, .connection-line.active')
            .forEach(el => el.classList.remove('active'));

        if (selectedYears.length === 0) {
            heatmapDiv.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: #999;">No years selected</div>';
            return;
        }

        // === Calculate total data columns ===
        const totalCols = viewMode === "byYear" ? selectedYears.length * 12 : 12;

        // === SET GRID ONCE ONLY 
        heatmapDiv.style.gridTemplateColumns = `80px 110px 150px repeat(${totalCols}, 1fr)`;
        heatmapDiv.style.gridAutoRows = "20px";

        const fragment = document.createDocumentFragment();
        const header = document.createElement('div');
        header.style.display = 'contents';
        header.innerHTML = `<div></div><div></div><div></div>`;
        fragment.appendChild(header);

        // === Year or Month headers ===
        if (viewMode === "byYear") {
            selectedYears.forEach(year => {
                const cell = document.createElement('div');
                cell.className = 'year-header';
                cell.textContent = year;
                cell.style.gridRow = '2';
                cell.style.gridColumn = 'span 12';
                fragment.appendChild(cell);
            });
        } else {
            monthOrder.forEach(month => {
                const cell = document.createElement('div');
                cell.className = 'month-header';
                cell.textContent = month;
                cell.style.gridRow = '2';
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
            regionLabel.style.gridRow = `span ${regionRowSpan}`;
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

            // === Region center Y for line ===
            const regionCenterY = (currentRow - 1) * 20 + (regionRowSpan * 20 / 2) - 10;
            const regionRightX = 80;

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

                    // === State center Y ===
                    const stateCenterY = (stateStartRow - 1) * 20 + (rowSpan * 20 / 2) - 10;
                    const stateRightX = 190;

                    // === State Label ===
                    const stateLabel = document.createElement('div');
                    stateLabel.className = 'state-col';
                    stateLabel.textContent = state;
                    stateLabel.style.gridRow = `span ${rowSpan}`;
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

                    // === Line: Region → State ===
                    drawLine(svg, regionRightX, regionCenterY, stateRightX, stateCenterY, `region-${region}`);

                    if (shouldShowState) {
                        portsInState.forEach((port, idx) => {
                            const row = stateStartRow + idx;
                            const portY = (row - 1) * 20 + 10;
                            const portRightX = 340;

                            // === Port Label ===
                            const portLabel = createPortLabel(port);
                            portLabel.style.gridRow = row;
                            portLabel.style.gridColumn = '3';
                            fragment.appendChild(portLabel);

                            // === Line: State → Port ===
                            drawLine(svg, stateRightX, stateCenterY, portRightX, portY, `state-${state}`);

                            // === Line: Port → Data ===
                            drawLine(svg, 490, portY, 520, portY, `port-${port}`);

                            // === Data Cells ===
                            let col = 4;
                            if (viewMode === "byYear") {
                                selectedYears.forEach(year => {
                                    monthOrder.forEach(month => {
                                        const key = `${port}|${year}|${month}`;
                                        const value = filteredMap[key] || 0;
                                        appendCell(fragment, value, `${port} | ${month} ${year} | ${value.toLocaleString()}`, minVal, maxVal, col++);
                                    });
                                });
                            } else {
                                monthOrder.forEach(month => {
                                    const key = `${port}|${month}`;
                                    const value = filteredMap[key] || 0;
                                    const yearsStr = selectedYears.length > 1 ? ` (${selectedYears.join(', ')})` : ` ${selectedYears[0]}`;
                                    appendCell(fragment, value, `${port} | ${month}${yearsStr} | ${value.toLocaleString()}`, minVal, maxVal, col++);
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

        // === Highlight active connections ===
        if (activeRegion) {
            document.querySelectorAll(`.connection-line[data-state^="region-${activeRegion}"]`)
                .forEach(l => l.classList.add('active'));
        }
        if (activeState) {
            document.querySelectorAll(`.connection-line[data-state^="state-${activeState}"]`)
                .forEach(l => l.classList.add('active'));
        }
    }

    // === HELPER FUNCTIONS ===

    // Append heatmap cell with color scale
    function appendCell(fragment, value, tooltip, minVal, maxVal, col = null) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.tooltip = tooltip;
        if (col) cell.style.gridColumn = col;

        const levels = ['#f0f0f0', '#92eee7ff', '#ebe00fff', '#ee970cff', '#cc0000'];
        const level = value === 0 ? 0 : Math.min(Math.floor((value - minVal) / (maxVal - minVal || 1) * 4) + 1, 4);
        cell.style.backgroundColor = levels[level];
        fragment.appendChild(cell);
    }

    // Create port label
    function createPortLabel(port) {
        const label = document.createElement('div');
        label.className = 'port-label';
        label.textContent = port;
        label.title = port;
        return label;
    }

    // Draw SVG connection line
    function drawLine(svg, x1, y1, x2, y2, dataState) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x1);
        line.setAttribute("y1", y1);
        line.setAttribute("x2", x2);
        line.setAttribute("y2", y2);
        line.setAttribute("class", "connection-line");
        line.dataset.state = dataState;
        svg.appendChild(line);
    }
});