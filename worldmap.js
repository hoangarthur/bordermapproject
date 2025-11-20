// worldmap.js - Updated for Yearly Total + Monthly Average
let map, canvasLayer, allData = [], timelineData = [], currentData = [];
let firstLoad = true;
let isYearMode = true; // true = Yearly total, false = Monthly average

const slider = document.getElementById('yearSlider');
const currentLabel = document.getElementById('currentMonth');
const labelsContainer = document.getElementById('monthLabels');
const measureFilter = document.getElementById('measureFilter');
const btnYear = document.getElementById('modeYear');
const btnMonth = document.getElementById('modeMonth');

const ALLOWED_MEASURES = ["Trains", "Buses", "Trucks", "Pedestrians", "Personal Vehicles"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

document.addEventListener("DOMContentLoaded", () => {
    initMap();
    loadData();
});

function initMap() {
    map = L.map('map').setView([39.8, -98.5], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const CanvasCirclesLayer = L.Layer.extend({
        onAdd: function(map) {
            this._canvas = L.DomUtil.create('canvas', 'leaflet-canvas-layer');
            const pane = map.getPanes().overlayPane;
            pane.appendChild(this._canvas);
            this._ctx = this._canvas.getContext('2d');

            const resize = () => {
                const size = map.getSize();
                this._canvas.width = size.x;
                this._canvas.height = size.y;
            };
            resize();
            map.on('resize', resize);
            map.on('moveend zoomend viewreset', this._redraw, this);
            this._redraw();
        },
        onRemove: function(map) { L.DomUtil.remove(this._canvas); },
        _redraw: () => drawAllPoints()
    });

    canvasLayer = new CanvasCirclesLayer();
    canvasLayer.addTo(map);
}

function loadData() {
    Papa.parse('history.csv', {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            allData = results.data
                .filter(row => row.Date && row.Value && row.Latitude && row.Longitude && row.Measure)
                .map(row => ({
                    date: row.Date.trim(),           // "Jan 2024"
                    measure: row.Measure.trim(),
                    value: parseInt(row.Value) || 0,
                    lat: parseFloat(row.Latitude),
                    lng: parseFloat(row.Longitude),
                    port: row["Port Name"]?.trim() || "Unknown"
                }))
                .filter(d => ALLOWED_MEASURES.includes(d.measure));

            // Setup dropdown
            measureFilter.innerHTML = '<option value="all">All Types</option>';
            ALLOWED_MEASURES.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m; opt.textContent = m;
                measureFilter.appendChild(opt);
            });

            setupTimeline();
        }
    });
}

// Mode buttons
btnYear.onclick = () => {
    isYearMode = true;
    btnYear.classList.add('active');
    btnMonth.classList.remove('active');
    setupTimeline();
};

btnMonth.onclick = () => {
    isYearMode = false;
    btnMonth.classList.add('active');
    btnYear.classList.remove('active');
    setupTimeline();
};

slider.addEventListener('input', updateView);
measureFilter.addEventListener('change', setupTimeline); // Rebuild when changing type

function setupTimeline() {
    const selectedMeasure = measureFilter.value;

    if (isYearMode) {
        // YEAR MODE: Group by year → sum all months
        const yearMap = {};

        allData.forEach(d => {
            const year = d.date.split(" ")[1]; // "2024" 
            if (!yearMap[year]) yearMap[year] = {};

            const key = `${d.port}|${d.lat.toFixed(6)}|${d.lng.toFixed(6)}`;
            if (!yearMap[year][key]) {
                yearMap[year][key] = { port: d.port, lat: d.lat, lng: d.lng, byMeasure: {} };
            }
            yearMap[year][key].byMeasure[d.measure] = (yearMap[year][key].byMeasure[d.measure] || 0) + d.value;
        });

        timelineData = Object.keys(yearMap)
            .sort()
            .map(year => {
                const ports = Object.values(yearMap[year]).map(p => {
                    const total = selectedMeasure === 'all'
                        ? Object.values(p.byMeasure).reduce((a,b) => a + b, 0)
                        : (p.byMeasure[selectedMeasure] || 0);
                    return { year, port: p.port, lat: p.lat, lng: p.lng, value: total, byMeasure: p.byMeasure };
                }).filter(p => p.value > 0);
                return { label: year, data: ports };
            });

    } else {
        // MONTH MODE: Average across all years for each month
        const monthMap = {};

        allData.forEach(d => {
            const monthName = d.date.split(" ")[0]; // "Jan"
            if (!monthMap[monthName]) monthMap[monthName] = {};

            const key = `${d.port}|${d.lat.toFixed(6)}|${d.lng.toFixed(6)}`;
            if (!monthMap[monthName][key]) {
                monthMap[monthName][key] = { port: d.port, lat: d.lat, lng: d.lng, counts: {}, total: {} };
            }
            const m = d.measure;
            monthMap[monthName][key].counts[m] = (monthMap[monthName][key].counts[m] || 0) + 1;
            monthMap[monthName][key].total[m]  = (monthMap[monthName][key].total[m]  || 0) + d.value;
        });

        timelineData = MONTH_NAMES.map(month => {
            const ports = monthMap[month] || {};
            const averaged = Object.values(ports).map(p => {
                let avg = 0;
                if (selectedMeasure === 'all') {
                    avg = Object.keys(p.total).reduce((sum, m) => sum + (p.total[m] / p.counts[m]), 0);
                } else {
                    avg = p.total[selectedMeasure] ? p.total[selectedMeasure] / p.counts[selectedMeasure] : 0;
                }
                return { month, port: p.port, lat: p.lat, lng: p.lng, value: Math.round(avg) };
            }).filter(p => p.value > 0);
            return { label: month, data: averaged };
        });
    }

    // Slider setup
    slider.min = 0;
    slider.max = timelineData.length - 1;
    slider.value = isYearMode ? timelineData.length - 1 : 0; // Latest year or January
    createSmartLabels();
    updateView();
}

function updateView() {
    const idx = parseInt(slider.value);
    const selectedMeasure = measureFilter.value;
    const item = timelineData[idx];

    if (!item) {
        currentData = [];
        drawAllPoints();
        return;
    }

    currentData = item.data.map(p => ({
        port: p.port,
        lat: p.lat,
        lng: p.lng,
        value: selectedMeasure === 'all'
            ? Object.values(p.byMeasure || {}).reduce((a,b) => a+b, 0) || p.value
            : (p.byMeasure?.[selectedMeasure] || 0) || p.value
    })).filter(p => p.value > 0);

    const modeText = isYearMode ? "Annual Total" : "Monthly Average (all years)";
    currentLabel.textContent = `${item.label} (${modeText}) — ${selectedMeasure === 'all' ? 'All Types' : selectedMeasure}`;

    drawAllPoints();

    if (firstLoad && currentData.length > 0) {
        const latlngs = currentData.map(p => [p.lat, p.lng]);
        map.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60] });
        firstLoad = false;
    }
}
function drawAllPoints() {
    if (!canvasLayer || currentData.length === 0) return;

    const ctx = canvasLayer._ctx;
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(canvasLayer._canvas, topLeft);
    ctx.clearRect(0, 0, canvasLayer._canvas.width, canvasLayer._canvas.height);

    const maxValue = Math.max(...currentData.map(p => p.value), 1000);

    currentData.forEach(p => {
        const point = map.latLngToContainerPoint([p.lat, p.lng]);
        const ratio = p.value / maxValue;
        const maxRings = Math.min(10, 3 + Math.floor(ratio * 8));
        const baseRadius = 5 + ratio * 11;

        let color;
        if (ratio < 0.25) color = `rgba(0, 150, 255, ${0.15 + ratio * 0.4})`;
        else if (ratio < 0.5) color = `rgba(0, 255, 100, ${0.25 + (ratio - 0.25) * 0.6})`;
        else if (ratio < 0.75) color = `rgba(255, 220, 0, ${0.35 + (ratio - 0.5) * 0.7})`;
        else color = `rgba(255, 50, 50, ${0.45 + (ratio - 0.75) * 0.8})`;

        for (let i = maxRings; i >= 1; i--) {
            const r = baseRadius * i;
            const opacity = i === 1 ? 0.9 : (i / maxRings) * 0.3;
            ctx.beginPath();
            ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
            ctx.fillStyle = i === 1 ? color.replace(/[\d.]+\)$/, '0.9)') : color.replace(/[\d.]+\)$/, opacity + ')');
            ctx.fill();
            if (i === 1) { ctx.strokeStyle = 'white'; ctx.lineWidth = 2.5; ctx.stroke(); }
        }

        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'white'; ctx.fill();
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.stroke();

        if (map.getZoom() >= 7 && p.port) {
            ctx.font = 'bold 11px Arial';
            ctx.strokeStyle = 'black'; ctx.lineWidth = 3; ctx.fillStyle = 'white';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.strokeText(p.port, point.x, point.y - baseRadius - 8);
            ctx.fillText(p.port, point.x, point.y - baseRadius - 8);

            ctx.font = '10px Arial';
            ctx.strokeText(p.value.toLocaleString(), point.x, point.y + baseRadius + 12);
            ctx.fillText(p.value.toLocaleString(), point.x, point.y + baseRadius + 12);
        }
    });
}

function createSmartLabels() {
    labelsContainer.innerHTML = '';
    if (timelineData.length === 0) return;

    const first = timelineData[0];
    const last  = timelineData[timelineData.length - 1];

    const divFirst = document.createElement('div');
    divFirst.className = 'month-label';
    divFirst.textContent = first.label;
    labelsContainer.appendChild(divFirst);

    const divLast = document.createElement('div');
    divLast.className = 'month-label';
    divLast.textContent = last.label;
    labelsContainer.appendChild(divLast);

}

window.addEventListener('resize', () => setTimeout(createSmartLabels, 200));