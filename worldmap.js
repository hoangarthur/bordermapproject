// worldmap.js - FINAL FIX: Month View không còn chồng điểm NỮA!
let map, canvasLayer, allData = [], timelineData = [], currentData = [];
let firstLoad = true;
let allMeasures = new Set();
let isYearMode = true;

const slider = document.getElementById('yearSlider');
const currentLabel = document.getElementById('currentMonth');
const labelsContainer = document.getElementById('monthLabels');
const measureFilter = document.getElementById('measureFilter');
const btnYear = document.getElementById('modeYear');
const btnMonth = document.getElementById('modeMonth');

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
            L.DomUtil.addClass(this._canvas, 'leaflet-canvas-layer', 'leaflet-zoom-hide');

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
                .filter(row => row.Date && row.Value && row.Latitude && row.Longitude)
                .map(row => ({
                    date: row.Date.trim(),
                    measure: row.Measure?.trim() || "Unknown",
                    value: parseInt(row.Value) || 0,
                    lat: parseFloat(row.Latitude),
                    lng: parseFloat(row.Longitude),
                    port: row["Port Name"]?.trim() || "Unknown"
                }));

            allData.forEach(d => allMeasures.add(d.measure));
            Array.from(allMeasures).sort().forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                measureFilter.appendChild(opt);
            });

            setupTimeline();
        }
    });
}

btnYear.onclick = () => { isYearMode = true; btnYear.classList.add('active'); btnMonth.classList.remove('active'); setupTimeline(); };
btnMonth.onclick = () => { isYearMode = false; btnMonth.classList.add('active'); btnYear.classList.remove('active'); setupTimeline(); };

slider.addEventListener('input', () => updateView());
measureFilter.addEventListener('change', () => updateView());

function setupTimeline() {
    if (isYearMode) {
        timelineData = [...new Set(allData.map(d => d.date))];
        timelineData.sort((a, b) => new Date(a) - new Date(b));
    } else {
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthMap = {};

        allData.forEach(d => {
            const monthStr = d.date.split(" ")[0];
            if (!monthMap[monthStr]) monthMap[monthStr] = {};
            const key = `${d.port}|${d.lat.toFixed(6)}|${d.lng.toFixed(6)}`; // key to avoid duplicates
            if (!monthMap[monthStr][key]) {
                monthMap[monthStr][key] = { port: d.port, lat: d.lat, lng: d.lng, byMeasure: {} };
            }
            monthMap[monthStr][key].byMeasure[d.measure] = (monthMap[monthStr][key].byMeasure[d.measure] || []).concat(d.value);
        });

        timelineData = monthNames.map(month => {
            const ports = monthMap[month] || {};
            const averagedPorts = Object.values(ports).map(p => {
                const values = p.byMeasure;
                let totalValue = 0;
                let count = 0;
                Object.values(values).forEach(arr => {
                    const avg = arr.reduce((a,b) => a+b, 0) / arr.length;
                    totalValue += avg;
                    count++;
                });
                return {
                    port: p.port,
                    lat: p.lat,
                    lng: p.lng,
                    value: Math.round(totalValue) //avg all measures
                };
            });
            return { label: month, data: averagedPorts };
        });
    }

    slider.max = timelineData.length - 1;
    slider.value = 0;
    createSmartLabels();
    updateView();
}

function updateView() {
    const idx = parseInt(slider.value);
    const selectedMeasure = measureFilter.value;
    let filtered = [];

    if (isYearMode) {
        const monthStr = timelineData[idx];
        filtered = allData.filter(d => d.date === monthStr);
        currentLabel.textContent = `${formatDate(monthStr)} — ${selectedMeasure === 'all' ? 'All Types' : selectedMeasure}`;
    } else {
        const monthObj = timelineData[idx];
        filtered = monthObj.data.map(p => ({ ...p, measure: "All" })); // giả lập measure để filter
        currentLabel.textContent = `${monthObj.label} (Avg all years) — ${selectedMeasure === 'all' ? 'All Types' : selectedMeasure}`;
    }

    // Filter by measure
    if (selectedMeasure !== 'all' && isYearMode) {
        filtered = filtered.filter(d => d.measure === selectedMeasure);
    }

    currentData = filtered;
    drawAllPoints();

    if (firstLoad && currentData.length > 0) {
        const latlngs = currentData.map(p => [p.lat, p.lng]);
        map.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60] });
        firstLoad = false;
    }
}

// Drawing points
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

// Smart labels & format
function createSmartLabels() {
    labelsContainer.innerHTML = '';
    const w = labelsContainer.parentElement.offsetWidth - 40;
    const step = w / (timelineData.length - 1);
    let last = -80;

    timelineData.forEach((item, i) => {
        const pos = i * step;
        if (i === 0 || i === timelineData.length - 1 || pos - last >= 80) {
            const div = document.createElement('div');
            div.className = 'month-label';
            div.style.left = pos + 'px';
            div.textContent = isYearMode ? item.substring(0, 7) : (item.label || item);
            labelsContainer.appendChild(div);
            last = pos;
        }
    });
}

function formatDate(str) {
    const d = new Date(str);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}

window.addEventListener('resize', () => setTimeout(createSmartLabels, 200));