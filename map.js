// script.js - Year Timeline Only + Smart Label Spacing

document.addEventListener("DOMContentLoaded", () => {
    const map = L.map('map').setView([39.8, -98.5], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    let allData = [], months = [], heatLayer;
    const slider = document.getElementById('yearSlider');
    const currentLabel = document.getElementById('currentMonth');
    const labelsContainer = document.getElementById('monthLabels');

    // Load CSV
    Papa.parse('history.csv', {
    download: true,
    header: true,
    complete: (results) => {
        allData = results.data
            .filter(row => row.Date && row.Value && row.Latitude && row.Longitude)
            .map(row => ({
                date: row.Date.trim(),
                value: parseInt(row.Value),
                lat: parseFloat(row.Latitude),
                lng: parseFloat(row.Longitude)
            }));

        // timeline setup
        months = [...new Set(allData.map(d => d.date))];
        months.sort((a, b) => new Date(a) - new Date(b));

        if (months.length === 0) return;

        slider.max = months.length - 1;
        createSmartLabels();
        updateHeatmap(0);
        currentLabel.textContent = months[0];
    }
});

    slider.addEventListener('input', () => {
        updateHeatmap(slider.value);
        currentLabel.textContent = months[slider.value];
    });

    // === SMART LABELS: Only show if enough space ===
    function createSmartLabels() {
        labelsContainer.innerHTML = '';
        const containerWidth = labelsContainer.parentElement.offsetWidth;
        const step = containerWidth / (months.length - 1);
        const minDistance = 60; // Minimum px between labels

        let lastPos = -minDistance;

        months.forEach((month, i) => {
            const pos = i * step;
            if (pos - lastPos >= minDistance || i === 0 || i === months.length - 1) {
                const label = document.createElement('div');
                label.className = 'month-label';
                label.style.left = `${pos}px`;
                label.textContent = month;
                labelsContainer.appendChild(label);
                lastPos = pos;
            }
        });
    }

    function updateHeatmap(idx) {
        const month = months[idx];
        const data = allData.filter(d => d.date === month);
        if (data.length === 0) return;

        if (heatLayer) map.removeLayer(heatLayer);

        const values = data.map(d => d.value);
        const min = Math.min(...values), max = Math.max(...values);

        const heatPoints = data.map(p => {
            const intensity = max > min ? (p.value - min) / (max - min) : 1;
            return [p.lat, p.lng, intensity];
        });

        heatLayer = L.heatLayer(heatPoints, {
            radius: 45,
            blur: 30,
            maxZoom: 12,
            minOpacity: 0.4,
            gradient: { 0.0: '#00ff00', 0.5: '#ffff00', 1.0: '#ff0000' }
        }).addTo(map);

        const bounds = data.map(p => [p.lat, p.lng]);
        map.fitBounds(L.latLngBounds(bounds), { padding: [70, 70] });
    }
});