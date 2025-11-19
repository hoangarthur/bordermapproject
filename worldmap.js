let map, canvasLayer, allData = [], months = [], currentData = [];
let firstLoad = true;

const slider = document.getElementById('yearSlider');
const currentLabel = document.getElementById('currentMonth');
const labelsContainer = document.getElementById('monthLabels');

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
            L.DomUtil.addClass(this._canvas, 'leaflet-zoom-hide');

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
        onRemove: function(map) {
            L.DomUtil.remove(this._canvas);
        },
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
                    value: parseInt(row.Value) || 0,
                    lat: parseFloat(row.Latitude),
                    lng: parseFloat(row.Longitude),
                    port: row["Port Name"]?.trim() || ""
                }));

            months = [...new Set(allData.map(d => d.date))];
            months.sort((a, b) => new Date(a) - new Date(b));

            if (months.length === 0) {
                currentLabel.textContent = "Không có dữ liệu";
                return;
            }

            slider.max = months.length - 1;
            slider.value = 0;
            createSmartLabels();
            updateMonth(0);
            currentLabel.textContent = formatDate(months[0]);
        }
    });
}

slider.addEventListener('input', (e) => {
    updateMonth(parseInt(e.target.value));
});

function updateMonth(idx) {
    const month = months[idx];
    currentData = allData.filter(d => d.date === month);
    currentLabel.textContent = formatDate(month);
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

    // find max value for scaling
    const maxValue = Math.max(...currentData.map(p => p.value), 1000);

    currentData.forEach(p => {
        const point = map.latLngToContainerPoint([p.lat, p.lng]);
        const ratio = p.value / maxValue; // 0 → 1

        // Scale cicle size
        const maxRings = Math.min(10, 3 + Math.floor(ratio * 8));
        const baseRadius = 5 + ratio * 11; // từ 5px → max ~16px

        // Color choosing based on ratio
        let color;
        if (ratio < 0.25) color = `rgba(0, 150, 255, ${0.15 + ratio * 0.4})`;       // xanh dương
        else if (ratio < 0.5) color = `rgba(0, 255, 100, ${0.25 + (ratio - 0.25) * 0.6})`; // xanh lá
        else if (ratio < 0.75) color = `rgba(255, 220, 0, ${0.35 + (ratio - 0.5) * 0.7})`;  // vàng
        else color = `rgba(255, 50, 50, ${0.45 + (ratio - 0.75) * 0.8})`;         // đỏ

        // draw rings
        for (let i = maxRings; i >= 1; i--) {
            const r = baseRadius * i;
            const opacity = i === 1 ? 0.9 : (i / maxRings) * 0.3;

            ctx.beginPath();
            ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
            ctx.fillStyle = i === 1 ? color.replace(/[\d.]+\)$/, '0.9)') : color.replace(/[\d.]+\)$/, opacity + ')');
            ctx.fill();

            if (i === 1) {
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2.5;
                ctx.stroke();
            }
        }

        // draw center point
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // draw labels if zoomed in enough
        if (map.getZoom() >= 7 && p.port) {
            ctx.font = 'bold 11px Arial';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 3;
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.strokeText(p.port, point.x, point.y - baseRadius - 8);
            ctx.fillText(p.port, point.x, point.y - baseRadius - 8);

            ctx.font = '10px Arial';
            ctx.strokeText(p.value.toLocaleString(), point.x, point.y + baseRadius + 12);
            ctx.fillText(p.value.toLocaleString(), point.x, point.y + baseRadius + 12);
        }
    });
}

// Smart Labels & formatDate
function createSmartLabels() {
    labelsContainer.innerHTML = '';
    const containerWidth = labelsContainer.parentElement.offsetWidth - 40;
    const total = months.length;
    if (total <= 1) return;

    const minGap = 70;
    const step = containerWidth / (total - 1);
    let lastPos = -minGap;

    months.forEach((month, i) => {
        const pos = i * step;
        if (i === 0 || i === total - 1 || pos - lastPos >= minGap) {
            const div = document.createElement('div');
            div.className = 'month-label';
            div.style.left = pos + 'px';
            div.textContent = month.substring(0, 7);
            labelsContainer.appendChild(div);
            lastPos = pos;
        }
    });
}

function formatDate(str) {
    const d = new Date(str);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}

window.addEventListener('resize', () => setTimeout(createSmartLabels, 200));