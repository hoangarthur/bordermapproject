/**
 * lineChart.js using plotly js: https://plotly.com/javascript/
 * Border Port Traffic Line Chart for overview
 * 
 * Features:
 * hover to see exact values
 * drag to pan
 * use the slider below to animate the timeline year by year
 * 
 * Data Source: history.csv
 *   Columns: Port Name, Date ("Jan 2020"), Value, Measure, State
 * 
 * Libraries:
 * - Papa Parse v5+: CSV parsing[](https://www.papaparse.com)
 * - Vanilla JS (ES6+)is used for DOM manipulation
 * - CSS Grid for layout
 * - Tooltip for cell details
 * - ChatGPT for code assistance
 * - Grok for rendering optimization
 * 
 *How to run file:
    * 1. Host files on a local server (e.g., using Live Server in VSCode) or run the command: 
    * python -m http.server 8000
    * 2. Open browser and navigate to http://localhost:8000/lineChart.html
 */

document.addEventListener("DOMContentLoaded", () => {
    let data = [];

    // Load and process CSV
    Papa.parse('history.csv', {
        download: true,
        header: true,
        complete: (results) => {
            data = results.data
                .filter(row => row["Port Name"] && row.Date && row.Value && row.Measure)
                .map(row => {
                    const [monthStr, yearStr] = row.Date.trim().split(" ");
                    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    const month = monthNames.indexOf(monthStr) + 1;
                    const year = parseInt(yearStr);
                    return {
                        year: year,
                        month: month,
                        value: parseInt(row.Value) || 0
                    };
                })
                .filter(d => d.year >= 1996 && d.value > 0); // Filter post-1996, non-zero

            // Aggregate yearly totals
            const yearly = {};
            data.forEach(d => {
                if (!yearly[d.year]) yearly[d.year] = 0;
                yearly[d.year] += d.value;
            });
            const plotYears = Object.keys(yearly).sort((a, b) => a - b).map(Number);
            const plotValues = plotYears.map(y => yearly[y]);

            if (plotYears.length === 0) {
                console.error("No data available");
                return;
            }

            const maxY = Math.max(...plotValues);

            // Plotly trace
            const trace1 = {
                x: plotYears,
                y: plotValues,
                mode: 'lines+markers',
                name: 'Total Crossings',
                line: { color: 'blue', width: 2 },
                marker: { size: 8 }
            };

            // Layout
            const layout = {
                title: '',
                xaxis: { title: 'Year' },
                yaxis: { title: 'Total Crossings' },
                hovermode: 'x unified',
                dragmode: 'pan',
                template: 'plotly_white',
                shapes: [
                    { type: 'line', x0: 2001, x1: 2001, y0: 0, y1: maxY * 1.1, line: { color: 'red', width: 2, dash: 'dash' } },
                    { type: 'line', x0: 2008, x1: 2008, y0: 0, y1: maxY * 1.1, line: { color: 'brown', width: 2, dash: 'dash' } },
                    { type: 'line', x0: 2020, x1: 2020, y0: 0, y1: maxY * 1.1, line: { color: 'orange', width: 2, dash: 'dash' } }
                ],
                annotations: [
                    { x: 2001, y: maxY * 1.05, xref: 'x', yref: 'y', text: '9/11', showarrow: true, arrowhead: 7, ax: 20, ay: -30, font: { color: 'red' } },
                    { x: 2008, y: maxY * 1.05, xref: 'x', yref: 'y', text: '2008 Great Recession', showarrow: true, arrowhead: 7, ax: 20, ay: -30, font: { color: 'brown' } },
                    { x: 2020, y: maxY * 1.05, xref: 'x', yref: 'y', text: '2020 Pandemic', showarrow: true, arrowhead: 7, ax: 20, ay: -30, font: { color: 'orange' } }
                ]
            };

            // Sliders for cumulative years
            const steps = [];
            for (let i = 0; i < plotYears.length; i++) {
                steps.push({
                    method: 'restyle',
                    args: [
                        {
                            'x': [plotYears.slice(0, i + 1)],
                            'y': [plotValues.slice(0, i + 1)]
                        }
                    ],
                    label: plotYears[i].toString()
                });
            }
            layout.sliders = [{
                active: plotYears.length - 1,
                currentvalue: { prefix: 'Year: ' },
                pad: { t: 50 },
                steps: steps
            }];

            // Render chart
            Plotly.newPlot('chart', [trace1], layout);

            // Click event handler
            document.getElementById('chart').on('plotly_click', (data) => {
                const point = data.points[0];
                console.log('Clicked point:', point.x, point.y);
            });
        },
        error: (err) => {
            console.error('Error loading CSV:', err);
        }
    });
});