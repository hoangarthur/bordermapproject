// calendar.js - Border Port Traffic Heatmap (Region → State → Port)

document.addEventListener("DOMContentLoaded", () => {
    const heatmapDiv = document.getElementById("heatmap");
    const loading = document.getElementById("loading");
    const measureSelect = document.getElementById("measureSelect");
    const sortSelect = document.getElementById("sortSelect");
    const applyBtn = document.getElementById("applyBtn");
    const viewToggle = document.getElementById("viewToggle");
    const yearStart = document.getElementById("yearStart");
    const yearEnd = document.getElementById("yearEnd");
    const yearDisplay = document.getElementById("yearDisplay");
    const svg = document.getElementById("connections");

    let data = [], ports = [], years = [], measures = [];
    const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let currentMeasure = "Trucks";
    let sortMode = "alpha";
    let selectedYears = [];
    let viewMode = "byYear";
    let states = [], portToState = {}, statePorts = {};
    let regions = [], regionToStates = {}, stateToRegionMap = {};
    let activeRegion = null, activeState = null;

    // Cache
    let cachedData = null;

    // === Cập nhật hiển thị năm ===
    function updateYearDisplay() {
        const start = parseInt(yearStart.value);
        const end = parseInt(yearEnd.value);
        yearDisplay.textContent = `${start} – ${end}`;
    }

    // === Slider events ===
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

    // === TẢI DỮ LIỆU ===
    Papa.parse('history.csv', {
        download: true,
        header: true,
        complete: (results) => {
            loading.textContent = "Đang xử lý dữ liệu...";
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

            // Nhóm port theo state
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
                loading.textContent = "Không có dữ liệu!";
                return;
            }

            ports = [...new Set(raw.map(d => d.port))].sort();
            years = [...new Set(raw.map(d => d.year))].sort((a, b) => a - b);
            measures = [...new Set(raw.map(d => d.measure))].sort();
            data = raw;

            // === MAP STATE → REGION (Census Bureau) ===
            const stateToRegion = {
                "Alaska": "Pacific",
                "California": "Pacific",
                "Washington": "Pacific",
                "Arizona": "West",
                "Idaho": "West",
                "Montana": "West",
                "New Mexico": "West",
                "Maine": "Northeast",
                "New York": "Northeast",
                "Vermont": "Northeast",
                "Michigan": "Midwest",
                "Minnesota": "Midwest",
                "North Dakota": "Midwest",
                "Texas": "South",
                "Unknown": "Unknown"
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

            // === Slider ===
            const minYear = Math.min(...years);
            const maxYear = Math.max(...years);
            yearStart.min = minYear; yearStart.max = maxYear;
            yearEnd.min = minYear; yearEnd.max = maxYear;
            yearStart.value = minYear;
            yearEnd.value = maxYear;
            updateYearDisplay();

            // === Measures dropdown ===
            measures.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m; opt.textContent = m;
                if (m === "Trucks") opt.selected = true;
                measureSelect.appendChild(opt);
            });
            const allOpt = document.createElement('option');
            allOpt.value = "All Vehicles"; allOpt.textContent = "Tất cả phương tiện";
            measureSelect.insertBefore(allOpt, measureSelect.firstChild);

            selectedYears = years.slice();
            renderHeatmap();
            loading.style.display = "none";
            applyBtn.disabled = false;
        },
        error: (err) => {
            console.error(err);
            loading.textContent = "Lỗi tải dữ liệu!";
        }
    });

    // === Apply Button ===
    applyBtn.addEventListener('click', () => {
        currentMeasure = measureSelect.value;
        const start = parseInt(yearStart.value);
        const end = parseInt(yearEnd.value);
        selectedYears = [];
        for (let y = start; y <= end; y++) {
            if (years.includes(y)) selectedYears.push(y);
        }
        if (selectedYears.length === 0) {
            alert("Không có năm nào!");
            return;
        }
        applyBtn.disabled = true;
        applyBtn.textContent = "Đang cập nhật...";
        loading.style.display = "block";
        setTimeout(() => {
            cachedData = null;
            renderHeatmap();
            loading.style.display = "none";
            applyBtn.disabled = false;
            applyBtn.textContent = "Apply";
        }, 50);
    });

    // === Cache key ===
    function getFilterKey() {
        return `${currentMeasure}|${selectedYears.join(',')}|${activeRegion || ''}|${activeState || ''}|${viewMode}|${sortMode}`;
    }

    // === Tiền xử lý dữ liệu ===
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

    // === RENDER HEATMAP ===
    function renderHeatmap() {
        const filterKey = getFilterKey();
        if (!cachedData || cachedData.key !== filterKey) {
            const data = preprocessData();
            cachedData = { ...data, key: filterKey };
        }
        const { filteredMap, minVal, maxVal, portTotals } = cachedData;

        heatmapDiv.innerHTML = '';
        svg.innerHTML = '';
        document.querySelectorAll('.region-col.active, .state-col.active, .connection-line.active').forEach(el => el.classList.remove('active'));

        if (selectedYears.length === 0) {
            heatmapDiv.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: #999;">Chưa chọn năm</div>';
            return;
        }

        const totalCols = viewMode === "byYear" ? selectedYears.length * 12 : 12;
        heatmapDiv.style.gridTemplateColumns = `80px 110px 130px repeat(${totalCols}, 1fr)`;
        heatmapDiv.style.gridAutoRows = "20px";

        const fragment = document.createDocumentFragment();
        const header = document.createElement('div');
        header.style.display = 'contents';
        header.innerHTML = `<div></div><div></div><div></div>`;
        fragment.appendChild(header);

        if (viewMode === "byYear") {
            selectedYears.forEach(year => {
                const cell = document.createElement('div');
                cell.className = 'year-header';
                cell.textContent = year;
                cell.style.gridColumn = 'span 12';
                fragment.appendChild(cell);
            });
        } else {
            monthOrder.forEach(month => {
                const cell = document.createElement('div');
                cell.className = 'month-header';
                cell.textContent = month;
                fragment.appendChild(cell);
            });
        }

        let currentRow = 3;

        regions.forEach(region => {
            const statesInRegion = regionToStates[region] || [];
            const shouldShowRegion = !activeRegion || activeRegion === region;
            let totalRows = shouldShowRegion ? statesInRegion.reduce((sum, s) => sum + (statePorts[s]?.length || 0), 0) : 1;

            // === REGION LABEL ===
            const regionLabel = document.createElement('div');
            regionLabel.className = 'region-col';
            regionLabel.textContent = region;
            regionLabel.style.gridRow = `span ${totalRows}`;
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

            // === TRONG renderHeatmap() - THAY ĐOẠN NÀY ===
            heatmapDiv.style.gridTemplateColumns = `80px 110px 150px repeat(${totalCols}, 1fr)`;

            if (shouldShowRegion) {
                // === TÍNH TOÁN TRƯỚC: Y giữa của Region ===
                const regionRowSpan = statesInRegion.reduce((sum, s) => sum + (statePorts[s]?.length || 0), 0);
                const regionCenterY = (currentRow - 1) * 20 + (regionRowSpan * 20 / 2) - 10; // Giữa Region
                const regionRightX = 80; // Cạnh phải cột Region (80px)

                let stateStartRow = currentRow;

                statesInRegion.forEach(state => {
                    let portsInState = [...(statePorts[state] || [])];
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

                    // === TÍNH Y GIỮA CỦA STATE ===
                    const stateCenterY = (stateStartRow - 1) * 20 + (rowSpan * 20 / 2) - 10;
                    const stateRightX = 190; // Cạnh phải cột State (80 + 110)

                    // === STATE LABEL ===
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

                    // === ĐƯỜNG NỐI: Region → 1 điểm giữa State (bên phải cột State) ===
                    drawLine(svg, regionRightX, regionCenterY, stateRightX, stateCenterY, `region-${region}`);

                    if (shouldShowState) {
                        portsInState.forEach((port, idx) => {
                            const row = stateStartRow + idx;
                            const portY = (row - 1) * 20 + 10; // Giữa dòng Port
                            const portRightX = 340; // Cạnh phải cột Port (80+110+150)

                            // Port label
                            const portLabel = createPortLabel(port);
                            portLabel.style.gridRow = row;
                            portLabel.style.gridColumn = '3';
                            fragment.appendChild(portLabel);

                            // === ĐƯỜNG NỐI: State → 1 điểm giữa Port (bên phải cột Port) ===
                            drawLine(svg, stateRightX, stateCenterY, portRightX, portY, `state-${state}`);

                            // === ĐƯỜNG NỐI: Port → Data ===
                            drawLine(svg, 490, portY, 520, portY, `port-${port}`);

                            // === CELLS ===
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

        // Highlight khi zoom
        if (activeRegion) {
            document.querySelectorAll(`.connection-line[data-state^="region-${activeRegion}"]`).forEach(l => l.classList.add('active'));
        }
        if (activeState) {
            document.querySelectorAll(`.connection-line[data-state^="state-${activeState}"]`).forEach(l => l.classList.add('active'));
        }
    }

    // === HÀM PHỤ ===
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

    function createPortLabel(port) {
        const label = document.createElement('div');
        label.className = 'port-label';
        label.textContent = port;
        label.title = port;
        return label;
    }

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