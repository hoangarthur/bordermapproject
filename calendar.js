document.addEventListener("DOMContentLoaded", () => {
    const heatmapDiv = document.getElementById("heatmap");
    const loading = document.getElementById("loading");
    const measureSelect = document.getElementById("measureSelect");
    const applyBtn = document.getElementById("applyBtn");
    const viewToggle = document.getElementById("viewToggle");
    const yearStart = document.getElementById("yearStart");
    const yearEnd = document.getElementById("yearEnd");
    const yearDisplay = document.getElementById("yearDisplay");

    let data = [], ports = [], years = [], measures = [];
    const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let currentMeasure = "Trucks";
    let selectedYears = [];
    let viewMode = "byYear";
    let states = [], portToState = {}, statePorts = {};
    let activeState = null;
    // update year display
    function updateYearDisplay() {
        const start = parseInt(yearStart.value);
        const end = parseInt(yearEnd.value);
        yearDisplay.textContent = `${start} – ${end}`;
    }

    // Slider events
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

    // Switch
    viewToggle.addEventListener("change", () => {
        viewMode = viewToggle.checked ? "byMonth" : "byYear";
        renderHeatmap();
    });

    Papa.parse('history.csv', {
        download: true,
        header: true,
        complete: (results) => {
            loading.textContent = "Data loaded. Ready!";

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
            // Group ports by state
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
                loading.textContent = "No data in CSV!";
                return;
            }

            ports = [...new Set(raw.map(d => d.port))].sort();
            years = [...new Set(raw.map(d => d.year))].sort((a, b) => a - b);
            measures = [...new Set(raw.map(d => d.measure))].sort();
            data = raw;

            // update slider
            const minYear = Math.min(...years);
            const maxYear = Math.max(...years);
            yearStart.min = minYear; yearStart.max = maxYear;
            yearEnd.min = minYear; yearEnd.max = maxYear;
            yearStart.value = minYear;
            yearEnd.value = maxYear;
            updateYearDisplay();

            // Dropdown
            measures.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m; opt.textContent = m;
                if (m === "Trucks") opt.selected = true;
                measureSelect.appendChild(opt);
            });

            // Render first time
            selectedYears = years.slice();
            renderHeatmap();
            loading.style.display = "none";
            applyBtn.disabled = false;
        },
        error: (err) => {
            console.error(err);
            loading.textContent = "Load failed! Check console.";
        }
    });

    // Apply
    applyBtn.addEventListener('click', () => {
        currentMeasure = measureSelect.value;
        const start = parseInt(yearStart.value);
        const end = parseInt(yearEnd.value);
        selectedYears = [];
        for (let y = start; y <= end; y++) {
            if (years.includes(y)) selectedYears.push(y);
        }

        if (selectedYears.length === 0) {
            alert("No year in selected range!");
            return;
        }

        applyBtn.disabled = true;
        applyBtn.textContent = "Updating...";
        loading.style.display = "block";

        setTimeout(() => {
            renderHeatmap();
            loading.style.display = "none";
            applyBtn.disabled = false;
            applyBtn.textContent = "Apply";
        }, 50);
    });

    // Render heatmap
    function renderHeatmap() {
        const heatmapDiv = document.getElementById("heatmap");
        const svg = document.getElementById("connections");
        heatmapDiv.innerHTML = '';
        svg.innerHTML = '';

        // Reset active
        document.querySelectorAll('.state-col.active').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.connection-line.active').forEach(el => el.classList.remove('active'));

        if (selectedYears.length === 0) {
            heatmapDiv.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: #999; padding: 20px;">No year selected.</div>';
            return;
        }

        const filtered = data.filter(d => d.measure === currentMeasure && selectedYears.includes(d.year));

        // min/max for heatmap
        // === LỌC DỮ LIỆU THEO STATE (nếu có) ===
        let displayPorts = ports;
        if (activeState) {
            displayPorts = statePorts[activeState] || [];
        }
        const filteredForDisplay = filtered.filter(d => displayPorts.includes(d.port));

        // Tính min/max từ filteredForDisplay
        let values = [];
        if (viewMode === "byYear") {
            values = filteredForDisplay.map(d => d.value).filter(v => v > 0);
        } else {
            const totals = {};
            filteredForDisplay.forEach(d => {
                const key = `${d.port}|${d.month}`;
                totals[key] = (totals[key] || 0) + d.value;
            });
            values = Object.values(totals).filter(v => v > 0);
        }
        const minVal = values.length > 0 ? Math.min(...values) : 0;
        const maxVal = values.length > 0 ? Math.max(...values) : 1;

        const totalCols = viewMode === "byYear" ? selectedYears.length * 12 : 12;
        heatmapDiv.style.gridTemplateColumns = `90px 110px repeat(${totalCols}, 1fr)`; // State | Port | Data
        heatmapDiv.style.gridAutoRows = "16px";

        // Header
        const headerRow = document.createElement('div');
        headerRow.style.display = 'contents';
        headerRow.innerHTML = `<div></div><div></div>`;
        if (viewMode === "byYear") {
            selectedYears.forEach(year => {
                const cell = document.createElement('div');
                cell.className = 'year-header';
                cell.textContent = year;
                cell.style.gridColumn = 'span 12';
                headerRow.appendChild(cell);
            });
        } else {
            monthOrder.forEach(month => {
                const cell = document.createElement('div');
                cell.className = 'month-header';
                cell.textContent = month;
                headerRow.appendChild(cell);
            });
        }
        heatmapDiv.appendChild(headerRow);

        // Render States + Ports
        let currentRow = 2;
        states.forEach(state => {
            const portsInState = statePorts[state];

            // Tính rowSpan cho state (luôn giữ)
            const rowSpan = portsInState.length;

            // === TẠO STATE LABEL (luôn hiện) ===
            const stateLabel = document.createElement('div');
            stateLabel.className = 'state-col';
            stateLabel.textContent = state;
            stateLabel.style.gridRow = `span ${rowSpan}`;
            stateLabel.dataset.state = state;
            heatmapDiv.appendChild(stateLabel);

            // Click để zoom
            stateLabel.onclick = (e) => {
                e.preventDefault();
                if (activeState === state) {
                    activeState = null;
                    stateLabel.classList.remove('active');
                } else {
                    activeState = state;
                    document.querySelectorAll('.state-col').forEach(el => el.classList.remove('active'));
                    stateLabel.classList.add('active');
                }
                document.querySelectorAll('.connection-line').forEach(line => line.classList.remove('active'));
                if (activeState) {
                    document.querySelectorAll(`.connection-line[data-state="${activeState}"]`)
                        .forEach(line => line.classList.add('active'));
                }
                renderHeatmap(); // Vẽ lại
            };

            // === VẼ PORTS (chỉ vẽ nếu activeState = null hoặc = state) ===
            const shouldShowPorts = !activeState || activeState === state;

            portsInState.forEach((port, idx) => {
                const globalRow = getGlobalRowIndex(states.indexOf(state), idx, statePorts);

                // Chỉ thêm port nếu được phép hiển thị
                if (shouldShowPorts) {
                    // Port label
                    const portLabel = createPortLabel(port);
                    portLabel.style.gridRow = globalRow;
                    heatmapDiv.appendChild(portLabel);

                    // Đường nối
                    const y = (globalRow - 1) * 16 + 8;
                    drawLine(svg, 45, y, 145, y, state);

                    // Dữ liệu (chỉ tính trong state nếu zoom)
                    if (viewMode === "byYear") {
                        selectedYears.forEach(year => {
                            monthOrder.forEach(month => {
                                const entry = filtered.find(d => d.port === port && d.year === year && d.month === month);
                                const value = entry ? entry.value : 0;
                                appendCell(value, `${port} | ${month} ${year} | ${value.toLocaleString()}`, minVal, maxVal);
                            });
                        });
                    } else {
                        const totals = {};
                        filtered.filter(d => d.port === port).forEach(d => {
                            totals[d.month] = (totals[d.month] || 0) + d.value;
                        });
                        monthOrder.forEach(month => {
                            const value = totals[month] || 0;
                            const yearsStr = selectedYears.length > 1 ? ` (${selectedYears.join(', ')})` : ` ${selectedYears[0]}`;
                            appendCell(value, `${port} | ${month}${yearsStr} | ${value.toLocaleString()}`, minVal, maxVal);
                        });
                    }
                } else {
                    // Nếu không hiển thị → thêm ô trống để giữ vị trí
                    const emptyPort = document.createElement('div');
                    emptyPort.style.gridRow = globalRow;
                    heatmapDiv.appendChild(emptyPort);

                    // Thêm 12 ô trống cho dữ liệu
                    const colsPerRow = viewMode === "byYear" ? selectedYears.length * 12 : 12;
                    for (let i = 0; i < colsPerRow; i++) {
                        const emptyCell = document.createElement('div');
                        emptyCell.className = 'cell';
                        emptyCell.style.backgroundColor = '#f0f0f0';
                        heatmapDiv.appendChild(emptyCell);
                    }
                }
            });
        });
    }

    function appendCell(value, tooltip, minVal, maxVal) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.tooltip = tooltip;

        const levels = ['#f0f0f0', '#92eee7ff', '#ebe00fff', '#ee970cff', '#cc0000'];
        const level = value === 0 ? 0 : Math.min(Math.floor((value - minVal) / (maxVal - minVal || 1) * 4) + 1, 4);
        cell.style.backgroundColor = levels[level];

        heatmapDiv.appendChild(cell);
    }

    function createPortLabel(port) {
        const label = document.createElement('div');
        label.className = 'port-label';
        label.textContent = port;
        label.title = port;
        return label;
    }
    function getGlobalRowIndex(stateIdx, portIdx, statePorts) {
        let row = 2; // start after header
        for (let i = 0; i < stateIdx; i++) {
            row += statePorts[states[i]].length;
        }
        return row + portIdx;
    }

    function drawLine(svg, x1, y1, x2, y2, state) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x1);
        line.setAttribute("y1", y1);
        line.setAttribute("x2", x2);
        line.setAttribute("y2", y2);
        line.setAttribute("class", "connection-line");
        line.dataset.state = state;
        svg.appendChild(line);
    }
});