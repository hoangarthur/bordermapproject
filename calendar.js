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
    let activeState = null;

    // Cache để tăng tốc
    let cachedData = null;
    let lastFilterKey = "";

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

    // === Sort select: render ngay khi đổi ===
    sortSelect.addEventListener("change", () => {
        sortMode = sortSelect.value;
        renderHeatmap();
    });

    // === View toggle: byYear / byMonth ===
    viewToggle.addEventListener("change", () => {
        viewMode = viewToggle.checked ? "byMonth" : "byYear";
        renderHeatmap();
    });

    // === TẢI DỮ LIỆU CSV ===
    Papa.parse('history.csv', {
        download: true,
        header: true,
        complete: (results) => {
            loading.textContent = "Dữ liệu đã sẵn sàng! Đang vẽ...";
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

            // === Nhóm cảng theo bang (state) ===
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
                loading.textContent = "Không có dữ liệu trong CSV!";
                return;
            }

            ports = [...new Set(raw.map(d => d.port))].sort();
            years = [...new Set(raw.map(d => d.year))].sort((a, b) => a - b);
            measures = [...new Set(raw.map(d => d.measure))].sort();
            data = raw;

            // === Cập nhật slider ===
            const minYear = Math.min(...years);
            const maxYear = Math.max(...years);
            yearStart.min = minYear; yearStart.max = maxYear;
            yearEnd.min = minYear; yearEnd.max = maxYear;
            yearStart.value = minYear;
            yearEnd.value = maxYear;
            updateYearDisplay();

            // === Dropdown measures ===
            measures.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m; opt.textContent = m;
                if (m === "Trucks") opt.selected = true;
                measureSelect.appendChild(opt);
            });

            // === Thêm "All Vehicles" ===
            const allOpt = document.createElement('option');
            allOpt.value = "All Vehicles";
            allOpt.textContent = "Tất cả phương tiện";
            measureSelect.insertBefore(allOpt, measureSelect.firstChild);

            // === Render lần đầu ===
            selectedYears = years.slice();
            renderHeatmap();
            loading.style.display = "none";
            applyBtn.disabled = false;
        },
        error: (err) => {
            console.error(err);
            loading.textContent = "Tải thất bại! Kiểm tra console.";
        }
    });

    // === Nút Apply ===
    applyBtn.addEventListener('click', () => {
        currentMeasure = measureSelect.value;
        const start = parseInt(yearStart.value);
        const end = parseInt(yearEnd.value);
        selectedYears = [];
        for (let y = start; y <= end; y++) {
            if (years.includes(y)) selectedYears.push(y);
        }
        if (selectedYears.length === 0) {
            alert("Không có năm nào trong khoảng chọn!");
            return;
        }

        applyBtn.disabled = true;
        applyBtn.textContent = "Đang cập nhật...";
        loading.style.display = "block";

        setTimeout(() => {
            cachedData = null; // Xóa cache khi filter thay đổi
            renderHeatmap();
            loading.style.display = "none";
            applyBtn.disabled = false;
            applyBtn.textContent = "Áp dụng";
        }, 50);
    });

    // === Hàm tạo key cache ===
    function getFilterKey() {
        return `${currentMeasure}|${selectedYears.join(',')}|${activeState || ''}|${viewMode}|${sortMode}`;
    }

    // === Tiền xử lý dữ liệu (chỉ chạy 1 lần) ===
    function preprocessData() {
        const displayPorts = activeState ? statePorts[activeState] : ports;
        const filteredMap = {}; // key: port|year|month hoặc port|month
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

    // === Render Heatmap - SIÊU TỐI ƯU ===
    function renderHeatmap() {
        const filterKey = getFilterKey();

        // Dùng cache nếu filter không đổi
        if (!cachedData || cachedData.key !== filterKey) {
            const data = preprocessData();
            cachedData = { ...data, key: filterKey };
        }

        const { filteredMap, displayPorts, minVal, maxVal, portTotals } = cachedData;

        // Xóa cũ
        heatmapDiv.innerHTML = '';
        svg.innerHTML = '';
        document.querySelectorAll('.state-col.active, .connection-line.active').forEach(el => el.classList.remove('active'));

        if (selectedYears.length === 0) {
            heatmapDiv.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: #999; padding: 20px;">Chưa chọn năm nào nha~</div>';
            return;
        }

        const totalCols = viewMode === "byYear" ? selectedYears.length * 12 : 12;
        heatmapDiv.style.gridTemplateColumns = `110px 130px repeat(${totalCols}, 1fr)`;
        heatmapDiv.style.gridAutoRows = "20px";

        const fragment = document.createDocumentFragment();
        const headerRow = document.createElement('div');
        headerRow.style.display = 'contents';
        headerRow.innerHTML = `<div></div><div></div>`;

        // Header: Năm hoặc Tháng
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
        fragment.appendChild(headerRow);

        let currentRow = 2;

        states.forEach(state => {
            let portsInState = [...statePorts[state]];

            // Sort ports theo tổng lưu lượng
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
            const shouldShowPorts = !activeState || activeState === state;

            // State label
            const stateLabel = document.createElement('div');
            stateLabel.className = 'state-col';
            stateLabel.textContent = state;
            stateLabel.style.gridRow = `span ${rowSpan}`;
            stateLabel.dataset.state = state;
            stateLabel.style.gridColumn = '1';
            if (activeState === state) stateLabel.classList.add('active');

            stateLabel.onclick = (e) => {
                e.preventDefault();
                activeState = activeState === state ? null : state;
                cachedData = null;
                renderHeatmap();
            };
            fragment.appendChild(stateLabel);

            if (shouldShowPorts) {
                portsInState.forEach((port, idx) => {
                    const globalRow = getGlobalRowIndex(states.indexOf(state), idx, statePorts);

                    // Port label
                    const portLabel = createPortLabel(port);
                    portLabel.style.gridRow = globalRow;
                    portLabel.style.gridColumn = '2';
                    fragment.appendChild(portLabel);

                    // Dòng nối
                    const y = (globalRow - 1) * 20 + 10;
                    drawLine(svg, 45, y, 145, y, state);

                    // Cells
                    if (viewMode === "byYear") {
                        selectedYears.forEach(year => {
                            monthOrder.forEach(month => {
                                const key = `${port}|${year}|${month}`;
                                const value = filteredMap[key] || 0;
                                appendCell(fragment, value, `${port} | ${month} ${year} | ${value.toLocaleString()}`, minVal, maxVal);
                            });
                        });
                    } else {
                        monthOrder.forEach(month => {
                            const key = `${port}|${month}`;
                            const value = filteredMap[key] || 0;
                            const yearsStr = selectedYears.length > 1 ? ` (${selectedYears.join(', ')})` : ` ${selectedYears[0]}`;
                            appendCell(fragment, value, `${port} | ${month}${yearsStr} | ${value.toLocaleString()}`, minVal, maxVal);
                        });
                    }
                });
            }
            currentRow += rowSpan;
        });

        heatmapDiv.appendChild(fragment);

        // Highlight dòng nối khi zoom
        if (activeState) {
            document.querySelectorAll(`.connection-line[data-state="${activeState}"]`).forEach(line => line.classList.add('active'));
        }
    }

    // === Hàm phụ ===
    function appendCell(fragment, value, tooltip, minVal, maxVal) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.tooltip = tooltip;
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

    function getGlobalRowIndex(stateIdx, portIdx, statePorts) {
        let row = 2;
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