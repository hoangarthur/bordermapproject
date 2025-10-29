document.addEventListener("DOMContentLoaded", () => {
    const heatmapDiv = document.getElementById("heatmap");
    const loading = document.getElementById("loading");
    const measureSelect = document.getElementById("measureSelect");
    const yearCheckboxesContainer = document.getElementById("yearCheckboxes");
    const applyBtn = document.getElementById("applyBtn");

    let data = [], ports = [], years = [], measures = [];
    const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let currentMeasure = "Trucks";
    let selectedYears = [];

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

            ports = [...new Set(raw.map(d => d.port))].sort();
            years = [...new Set(raw.map(d => d.year))].sort((a, b) => a - b);
            measures = [...new Set(raw.map(d => d.measure))].sort();
            data = raw;

            // === Dropdown loại phương tiện ===
            measures.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m; opt.textContent = m;
                if (m === "Trucks") opt.selected = true;
                measureSelect.appendChild(opt);
            });

            // === Checkbox năm ===
            years.forEach(year => {
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = year;
                checkbox.checked = true; // Mặc định chọn tất cả
                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(` ${year}`));
                yearCheckboxesContainer.appendChild(label);
            });

            // Mặc định chọn tất cả năm
            selectedYears = years.slice();

            if (ports.length === 0) {
                loading.textContent = "No data!";
                return;
            }

            // === NÚT APPLY ===
            applyBtn.addEventListener('click', () => {
                currentMeasure = measureSelect.value;
                selectedYears = Array.from(yearCheckboxesContainer.querySelectorAll('input:checked'))
                                      .map(cb => parseInt(cb.value));

                if (selectedYears.length === 0) {
                    alert("Please select at least one year!");
                    return;
                }

                applyBtn.disabled = true;
                applyBtn.textContent = "Updating...";
                loading.style.display = "block";

                // Dùng setTimeout để tránh block UI
                setTimeout(() => {
                    renderHeatmap();
                    loading.style.display = "none";
                    applyBtn.disabled = false;
                    applyBtn.textContent = "Apply";
                }, 50);
            });

            // Render lần đầu
            renderHeatmap();
            loading.style.display = "none";
            applyBtn.disabled = false;
        },
        error: () => {
            loading.textContent = "Load failed!";
        }
    });

    function renderHeatmap() {
        heatmapDiv.innerHTML = '';

        if (selectedYears.length === 0) {
            heatmapDiv.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: #999; padding: 20px;">No year selected.</div>';
            return;
        }

        const filtered = data.filter(d => 
            d.measure === currentMeasure && 
            selectedYears.includes(d.year)
        );

        const values = filtered.map(d => d.value).filter(v => v > 0);
        const minVal = values.length > 0 ? Math.min(...values) : 0;
        const maxVal = values.length > 0 ? Math.max(...values) : 1;

        const totalCols = selectedYears.length * 12;
        heatmapDiv.style.gridTemplateColumns = `110px repeat(${totalCols}, 1fr)`;

        // Year headers
        const yearRow = document.createElement('div');
        yearRow.style.display = 'contents';
        yearRow.innerHTML = `<div></div>`;
        selectedYears.forEach(year => {
            const cell = document.createElement('div');
            cell.className = 'year-header';
            cell.textContent = year;
            yearRow.appendChild(cell);
        });
        heatmapDiv.appendChild(yearRow);

        // Port rows
        ports.forEach(port => {
            const label = document.createElement('div');
            label.className = 'port-label';
            label.textContent = port;
            label.title = port;
            heatmapDiv.appendChild(label);

            selectedYears.forEach(year => {
                monthOrder.forEach(month => {
                    const entry = filtered.find(d => d.port === port && d.year === year && d.month === month);
                    const value = entry ? entry.value : 0;

                    const cell = document.createElement('div');
                    cell.className = 'cell';
                    cell.dataset.tooltip = `${port} | ${month} ${year} | ${value.toLocaleString()} ${currentMeasure.toLowerCase()}`;

                    const levels = [ 
                        '#f0f0f0', // 0: Không có dữ liệu 
                        '#92eee7ff', // 1: Rất thấp (đỏ nhạt) 
                        '#ebe00fff', // 2: Trung bình 
                        '#ee970cff', // 3: Cao 
                        '#cc0000' // 4: Rất cao (đỏ đậm) 
                        ];
                    const level = value === 0 ? 0 : Math.min(Math.floor((value - minVal) / (maxVal - minVal || 1) * 4) + 1, 4);
                    cell.style.backgroundColor = levels[level];

                    heatmapDiv.appendChild(cell);
                });
            });
        });
    }
});