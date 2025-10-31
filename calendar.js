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
        heatmapDiv.innerHTML = '';

        if (selectedYears.length === 0) {
            heatmapDiv.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: #999; padding: 20px;">No year selected.</div>';
            return;
        }

        const filtered = data.filter(d =>
            d.measure === currentMeasure && selectedYears.includes(d.year)
        );

        // min/max
        let values = [];
        if (viewMode === "byYear") {
            values = filtered.map(d => d.value).filter(v => v > 0);
        } else {
            const totals = {};
            filtered.forEach(d => {
                const key = `${d.port}|${d.month}`;
                totals[key] = (totals[key] || 0) + d.value;
            });
            values = Object.values(totals).filter(v => v > 0);
        }
        const minVal = values.length > 0 ? Math.min(...values) : 0;
        const maxVal = values.length > 0 ? Math.max(...values) : 1;

        if (viewMode === "byYear") {
            const totalCols = selectedYears.length * 12;
            heatmapDiv.style.gridTemplateColumns = `110px repeat(${totalCols}, 1fr)`;
            heatmapDiv.style.gridAutoRows = "16px";


            const yearRow = document.createElement('div');
            yearRow.style.display = 'contents';
            yearRow.innerHTML = `<div></div>`;
            selectedYears.forEach(year => {
                const cell = document.createElement('div');
                cell.className = 'year-header';
                cell.textContent = year;
                cell.style.gridColumn = 'span 12';
                yearRow.appendChild(cell);
            });
            heatmapDiv.appendChild(yearRow);

            ports.forEach(port => {
                const label = createPortLabel(port);
                heatmapDiv.appendChild(label);

                selectedYears.forEach(year => {
                    monthOrder.forEach(month => {
                        const entry = filtered.find(d => d.port === port && d.year === year && d.month === month);
                        const value = entry ? entry.value : 0;
                        appendCell(value, `${port} | ${month} ${year} | ${value.toLocaleString()}`, minVal, maxVal);
                    });
                });
            });

        } else {
            //group by month
            heatmapDiv.style.gridTemplateColumns = `110px repeat(12, 1fr)`;
            heatmapDiv.style.width = "100%";

            const monthRow = document.createElement('div');
            monthRow.style.display = 'contents';
            monthRow.appendChild(document.createElement('div')); 
            monthOrder.forEach(month => {
                const cell = document.createElement('div');
                cell.className = 'month-header';
                cell.textContent = month;
                monthRow.appendChild(cell);
            });
            heatmapDiv.appendChild(monthRow);

            const totalByPortMonth = {};
            filtered.forEach(d => {
                const key = `${d.port}|${d.month}`;
                totalByPortMonth[key] = (totalByPortMonth[key] || 0) + d.value;
            });

            ports.forEach(port => {
                const label = createPortLabel(port);
                heatmapDiv.appendChild(label);

                monthOrder.forEach(month => {
                    const key = `${port}|${month}`; 
                    const value = totalByPortMonth[key] || 0;
                    const yearsStr = selectedYears.length > 1 ? ` (${selectedYears.join(', ')})` : ` ${selectedYears[0]}`;
                    appendCell(value, `${port} | ${month}${yearsStr} | ${value.toLocaleString()}`, minVal, maxVal);
                });
            });
        }
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
});