/**
 * src/shared/svg_chart.js
 * SVG Line Chart Builder untuk Time Series
 */

class SVGChart {
  /**
   * Mengenerate HTML SVG murni untuk grafik Line Chart
   * @param {Array} data - Array object {label: string, actual: number, forecast: number}
   * @param {object} options - Opsi konfigurasi (width, height, dll)
   * @returns {string} String HTML SVG
   */
  static renderLineChart(data, options = {}) {
    if (!data || data.length === 0) return '';

    const width = options.width || 800;
    const height = options.height || 300;
    const padding = options.padding || 40;
    const paddingBottom = padding + 20;

    let minVal = Infinity;
    let maxVal = -Infinity;

    data.forEach(d => {
      if (d.actual !== null && d.actual !== undefined) {
        if (d.actual < minVal) minVal = d.actual;
        if (d.actual > maxVal) maxVal = d.actual;
      }
      if (d.forecast !== null && d.forecast !== undefined) {
        if (d.forecast < minVal) minVal = d.forecast;
        if (d.forecast > maxVal) maxVal = d.forecast;
      }
    });

    if (minVal === Infinity) { minVal = 0; maxVal = 100; }
    if (minVal === maxVal) { minVal -= 10; maxVal += 10; }

    const range = maxVal - minVal;
    // Berikan margin 10% di atas dan bawah
    minVal -= range * 0.1;
    maxVal += range * 0.1;
    const adjustedRange = maxVal - minVal;

    const scaleX = (width - 2 * padding) / Math.max(1, data.length - 1);
    const scaleY = (height - padding - paddingBottom) / adjustedRange;

    // Build paths
    let pathActual = '';
    let pathForecast = '';
    
    const pointsActual = [];
    const pointsForecast = [];

    data.forEach((d, i) => {
      const x = padding + i * scaleX;
      
      if (d.actual !== null && d.actual !== undefined) {
        const y = height - paddingBottom - ((d.actual - minVal) * scaleY);
        pathActual += (pathActual === '' ? `M ${x} ${y} ` : `L ${x} ${y} `);
        pointsActual.push({x, y, val: d.actual, label: d.label});
      }
      
      if (d.forecast !== null && d.forecast !== undefined) {
        const y = height - paddingBottom - ((d.forecast - minVal) * scaleY);
        pathForecast += (pathForecast === '' ? `M ${x} ${y} ` : `L ${x} ${y} `);
        pointsForecast.push({x, y, val: d.forecast, label: d.label});
      }
    });

    // Grid Y
    let gridHTML = '';
    const numGrids = 5;
    for (let i = 0; i <= numGrids; i++) {
      const val = minVal + (adjustedRange * (i / numGrids));
      const y = height - paddingBottom - ((val - minVal) * scaleY);
      gridHTML += `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="4" />`;
      gridHTML += `<text x="${padding - 5}" y="${y + 4}" fill="var(--text3)" font-size="10" text-anchor="end" font-family="var(--mono)">${val.toFixed(1)}</text>`;
    }

    // X Axis Labels (tampilkan maks 10 label)
    let xAxisHTML = '';
    const stepX = Math.ceil(data.length / 10);
    data.forEach((d, i) => {
      if (i % stepX === 0 || i === data.length - 1) {
        const x = padding + i * scaleX;
        xAxisHTML += `<text x="${x}" y="${height - 15}" fill="var(--text3)" font-size="10" text-anchor="middle" font-family="var(--mono)">${escapeHTML(d.label)}</text>`;
        xAxisHTML += `<line x1="${x}" y1="${height - paddingBottom}" x2="${x}" y2="${height - paddingBottom + 5}" stroke="var(--text3)" stroke-width="1" />`;
      }
    });

    // Points HTML (optional, maybe too heavy for large data, let's keep it minimal)
    let circlesHTML = '';
    pointsActual.forEach(p => {
       circlesHTML += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--accent)" />`;
    });
    pointsForecast.forEach(p => {
       circlesHTML += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--green)" />`;
    });

    const svg = `
      <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="background:var(--bg1);border-radius:var(--radius);border:1px solid var(--border);">
        ${gridHTML}
        <!-- X Axis line -->
        <line x1="${padding}" y1="${height - paddingBottom}" x2="${width - padding}" y2="${height - paddingBottom}" stroke="var(--text2)" stroke-width="1" />
        <!-- Y Axis line -->
        <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - paddingBottom}" stroke="var(--text2)" stroke-width="1" />
        ${xAxisHTML}
        
        <!-- Actual Line -->
        ${pathActual ? `<path d="${pathActual}" fill="none" stroke="var(--accent)" stroke-width="2" />` : ''}
        
        <!-- Forecast Line -->
        ${pathForecast ? `<path d="${pathForecast}" fill="none" stroke="var(--green)" stroke-width="2" stroke-dasharray="5" />` : ''}
        
        ${circlesHTML}

        <!-- Legend -->
        <g transform="translate(${width - 150}, 20)">
           <line x1="0" y1="0" x2="20" y2="0" stroke="var(--accent)" stroke-width="2" />
           <text x="25" y="4" font-size="12" fill="var(--text2)" font-family="var(--font)">Actual</text>
           <line x1="0" y1="20" x2="20" y2="20" stroke="var(--green)" stroke-width="2" stroke-dasharray="5" />
           <text x="25" y="24" font-size="12" fill="var(--text2)" font-family="var(--font)">Forecast</text>
        </g>
      </svg>
    `;

    return svg;
  }
}

if (typeof window !== 'undefined') {
  window.SVGChart = SVGChart;
} else if (typeof self !== 'undefined') {
  self.SVGChart = SVGChart;
}
