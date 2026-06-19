/**
 * km_render.js — Rendering the K-Means result page
 *
 * Renders:
 *   Section A: Summary metrics (K, iterations, SSE, convergence)
 *   Section B: Data cleaning / missing value log
 *   Section C: Centroid initialization detail
 *   Section D: Per-iteration accordion (distance matrix → assignment → centroid update)
 *   Section E: Final cluster assignment table
 *   Section F: Cluster summary tiles (centroid, stats per cluster)
 *   Section G: Excel-like formulas for each step
 *   Section H: Export buttons
 */

'use strict';

/* ============================================================
   MAIN RENDER
   ============================================================ */
function renderResult(R) {
  hide('page-input');
  show('page-result');
  window.scrollTo(0, 0);

  const container = document.getElementById('result-content');
  container.innerHTML = '';

  // Back button row
  container.innerHTML += `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:1.5rem;flex-wrap:wrap">
      <button class="btn btn-sm" onclick="goBack()">← Kembali ke Input</button>
      <div style="font-size:22px;font-weight:500;color:var(--text)">
        Hasil K-Means Clustering &nbsp;<span style="color:var(--text3);font-size:18px;font-family:var(--mono)">K=${R.K} | ${R.distMetric} | ${R.totalIter} iterasi</span>
      </div>
    </div>`;

  container.innerHTML += renderSummaryMetrics(R);
  if (R.mvMissing.length) container.innerHTML += renderMVLog(R);
  container.innerHTML += renderPCAChart(R);
  container.innerHTML += renderInitSection(R);
  container.innerHTML += renderIterations(R);
  container.innerHTML += renderFinalTable(R);
  container.innerHTML += renderClusterTiles(R);
  container.innerHTML += renderExportRow(R);
}

function goBack() {
  hide('page-result');
  show('page-input');
  window.scrollTo(0, 0);
}

/* ============================================================
   A. SUMMARY METRICS
   ============================================================ */
function renderSummaryMetrics(R) {
  const convText = R.converged
    ? `<span style="color:var(--green)">✓ Konvergen pada iterasi ${R.totalIter}</span>`
    : `<span style="color:var(--yellow)">⚠ Berhenti di iterasi ${R.totalIter} (max)</span>`;

  return `
  <div class="section" style="margin-bottom:1rem">
    <div class="section-head">
      <div class="step-circle" style="background:var(--green);color:#0d2d22">✓</div>
      <div class="section-title">Ringkasan Hasil</div>
    </div>
    <div class="section-body">
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-label">Jumlah Cluster</div>
          <div class="metric-val metric-blue" style="font-size:48px">${R.K}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Total Data</div>
          <div class="metric-val" style="font-size:40px">${R.data.length}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Iterasi</div>
          <div class="metric-val metric-blue" style="font-size:40px">${R.totalIter}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">SSE / Inertia</div>
          <div class="metric-val metric-green" style="font-size:34px">${fmtShort(R.sse)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Konvergen?</div>
          <div style="margin-top:4px;font-size:20px">${convText}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Metrik Jarak</div>
          <div style="font-family:var(--mono);font-size:22px;color:var(--text);margin-top:4px">${R.distMetric}</div>
        </div>
      </div>

      <!-- Cluster size bar -->
      <div style="margin-top:0.75rem">
        <div style="font-size:18px;color:var(--text3);margin-bottom:0.5rem;font-family:var(--mono)">UKURAN TIAP CLUSTER</div>
        ${R.clusterSummary.map((c, ki) => {
          const pct = R.data.length > 0 ? (c.count / R.data.length * 100).toFixed(1) : 0;
          const col = getClusterColor(ki);
          return `<div class="sse-bar-wrap">
            <div class="sse-bar-label" style="color:${col.hex}">C${ki + 1} (${c.count} data)</div>
            <div class="sse-bar-track">
              <div class="sse-bar-fill" style="width:${pct}%;background:${col.hex}"></div>
            </div>
            <div class="sse-bar-val">${pct}%</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}

/* ============================================================
   B. MISSING VALUE LOG
   ============================================================ */
function renderMVLog(R) {
  const { mvMissing, mvStrategy } = R;
  const byCol = {};
  mvMissing.forEach(m => {
    if (!byCol[m.colName]) byCol[m.colName] = [];
    byCol[m.colName].push({ row: m.rowIdx + 1, raw: m.rawVal });
  });

  return `
  <div class="section" style="margin-bottom:1rem">
    <div class="section-head">
      <div class="step-circle" style="background:var(--yellow);color:#1a1000">!</div>
      <div class="section-title">Log Pembersihan Data — Missing Value</div>
    </div>
    <div class="section-body">
      <div class="warn-box" style="font-size:18px;margin-bottom:0.85rem">
        Ditemukan <strong>${mvMissing.length} nilai hilang</strong>.
        Strategi yang digunakan: <strong style="font-family:var(--mono)">${mvStrategy}</strong>
      </div>
      ${Object.entries(byCol).map(([col, entries]) => `
        <div style="margin-bottom:0.65rem">
          <div style="font-size:19px;font-weight:500;margin-bottom:4px">
            Kolom: <span style="font-family:var(--mono);color:var(--accent)">${col}</span>
            <span style="font-size:16px;color:var(--text3)"> — ${entries.length} nilai hilang</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${entries.map(e =>
              `<span class="mv-badge">Baris ${e.row}${e.raw ? ': "' + e.raw + '"' : ''}</span>`
            ).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

/* ============================================================
   PCA SCATTER PLOT (Section B.5)
   Proyeksi 2D menggunakan PCA manual (2 PC pertama dari
   matriks kovarians data ternormalisasi). Render via SVG
   agar tidak butuh library eksternal.
   ============================================================ */
function renderPCAChart(R) {
  // PCA hanya berguna jika fitur >= 2
  if (R.featureNames.length < 2 || R.data.length < 3) return '';

  // --- 1. Hitung PCA dua komponen pertama ---
  const n = R.data.length;
  const d = R.data[0].length;

  // Mean-center
  const means = Array.from({length: d}, (_, j) =>
    R.data.reduce((s, r) => s + r[j], 0) / n
  );
  const centered = R.data.map(row => row.map((v, j) => v - means[j]));

  // Covariance matrix (d x d)
  const cov = Array.from({length: d}, (_, i) =>
    Array.from({length: d}, (_, j) =>
      centered.reduce((s, r) => s + r[i] * r[j], 0) / (n - 1)
    )
  );

  // Power iteration untuk 2 eigenvectors
  function powerIter(matrix, dim, iters = 100) {
    let v = Array.from({length: dim}, () => Math.random() - 0.5);
    // normalize
    let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    v = v.map(x => x / norm);
    for (let it = 0; it < iters; it++) {
      // Av
      const Av = Array.from({length: dim}, (_, i) =>
        matrix[i].reduce((s, m, j) => s + m * v[j], 0)
      );
      norm = Math.sqrt(Av.reduce((s, x) => s + x * x, 0));
      if (norm < 1e-12) break;
      v = Av.map(x => x / norm);
    }
    const eigenval = v.reduce((s, vi, i) =>
      s + vi * matrix[i].reduce((ss, m, j) => ss + m * v[j], 0), 0
    );
    return { vec: v, val: eigenval };
  }

  // PC1
  const pc1 = powerIter(cov, d);

  // Deflate: M2 = M - λ1 * v1 * v1^T
  const cov2 = cov.map((row, i) =>
    row.map((m, j) => m - pc1.val * pc1.vec[i] * pc1.vec[j])
  );

  // PC2
  const pc2 = powerIter(cov2, d);

  // Project data
  const proj = centered.map(row => ({
    x: row.reduce((s, v, i) => s + v * pc1.vec[i], 0),
    y: row.reduce((s, v, i) => s + v * pc2.vec[i], 0),
  }));

  // Project centroids
  const centProj = R.finalCentroids.map(c => {
    const cc = c.map((v, j) => v - means[j]);
    return {
      x: cc.reduce((s, v, i) => s + v * pc1.vec[i], 0),
      y: cc.reduce((s, v, i) => s + v * pc2.vec[i], 0),
    };
  });

  // Variance explained (approximate)
  const totalVar = cov.reduce((s, row, i) => s + row[i], 0) || 1;
  const varPC1 = ((Math.abs(pc1.val) / totalVar) * 100).toFixed(1);
  const varPC2 = ((Math.abs(pc2.val) / totalVar) * 100).toFixed(1);

  // --- 2. Build SVG ---
  const W = 700, H = 420, PAD = 48;

  const xs = proj.map(p => p.x).concat(centProj.map(p => p.x));
  const ys = proj.map(p => p.y).concat(centProj.map(p => p.y));
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xRange = (xMax - xMin) || 1, yRange = (yMax - yMin) || 1;

  const toSVG = (px, py) => ({
    sx: PAD + ((px - xMin) / xRange) * (W - 2 * PAD),
    sy: (H - PAD) - ((py - yMin) / yRange) * (H - 2 * PAD),
  });

  // Data points
  const circles = proj.map((p, i) => {
    const label = R.finalLabels[i];
    const col   = getClusterColor(label);
    const {sx, sy} = toSVG(p.x, p.y);
    return `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="5"
      fill="${col.hex}" fill-opacity="0.75" stroke="${col.hex}"
      stroke-width="1.5" stroke-opacity="0.9">
      <title>Baris ${i} — C${label + 1}\n${R.featureNames.map((f, fi) => f + ': ' + fmt(R.data[i][fi])).join('\n')}</title>
    </circle>`;
  }).join('');

  // Centroid markers (star shape via polygon)
  function starPoints(cx, cy, r1, r2, n) {
    let pts = '';
    for (let i = 0; i < n * 2; i++) {
      const angle = (Math.PI / n) * i - Math.PI / 2;
      const r = i % 2 === 0 ? r1 : r2;
      pts += `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)} `;
    }
    return pts.trim();
  }

  const centMarkers = centProj.map((p, ki) => {
    const col = getClusterColor(ki);
    const {sx, sy} = toSVG(p.x, p.y);
    const pts = starPoints(sx, sy, 12, 5, 5);
    return `<polygon points="${pts}" fill="${col.hex}" stroke="#fff"
      stroke-width="1.5" opacity="0.95">
      <title>Centroid C${ki + 1}: [${R.finalCentroids[ki].map(fmt).join(', ')}]</title>
    </polygon>`;
  }).join('');

  // Axis ticks
  function ticks(min, max, count = 5) {
    const step = (max - min) / (count - 1);
    return Array.from({length: count}, (_, i) => min + i * step);
  }
  const xTicks = ticks(xMin, xMax, 5);
  const yTicks = ticks(yMin, yMax, 5);

  const xTickSVG = xTicks.map(v => {
    const {sx} = toSVG(v, yMin);
    return `<line x1="${sx.toFixed(1)}" y1="${H - PAD}" x2="${sx.toFixed(1)}" y2="${H - PAD + 5}"
      stroke="var(--border2)" stroke-width="1"/>
    <text x="${sx.toFixed(1)}" y="${H - PAD + 18}" text-anchor="middle"
      font-size="11" fill="#5a6275" font-family="monospace">${v.toFixed(2)}</text>`;
  }).join('');

  const yTickSVG = yTicks.map(v => {
    const {sy} = toSVG(xMin, v);
    return `<line x1="${PAD - 5}" y1="${sy.toFixed(1)}" x2="${PAD}" y2="${sy.toFixed(1)}"
      stroke="var(--border2)" stroke-width="1"/>
    <text x="${PAD - 8}" y="${(sy + 4).toFixed(1)}" text-anchor="end"
      font-size="11" fill="#5a6275" font-family="monospace">${v.toFixed(2)}</text>`;
  }).join('');

  // Grid lines
  const gridX = xTicks.map(v => {
    const {sx} = toSVG(v, yMin);
    return `<line x1="${sx.toFixed(1)}" y1="${PAD}" x2="${sx.toFixed(1)}" y2="${H - PAD}"
      stroke="rgba(46,53,72,0.6)" stroke-width="1" stroke-dasharray="3,4"/>`;
  }).join('');
  const gridY = yTicks.map(v => {
    const {sy} = toSVG(xMin, v);
    return `<line x1="${PAD}" y1="${sy.toFixed(1)}" x2="${W - PAD}" y2="${sy.toFixed(1)}"
      stroke="rgba(46,53,72,0.6)" stroke-width="1" stroke-dasharray="3,4"/>`;
  }).join('');

  // Legend items
  const legendItems = Array.from({length: R.K}, (_, ki) => {
    const col = getClusterColor(ki);
    const count = R.clusterSummary[ki].count;
    return `<div class="pca-legend-item">
      <div class="pca-legend-dot" style="background:${col.hex}"></div>
      C${ki + 1} (${count} data)
    </div>`;
  }).join('') + `<div class="pca-legend-item">
    <svg width="16" height="16" viewBox="0 0 16 16">
      <polygon points="${starPoints(8,8,7,3,5)}" fill="#ffffff" opacity="0.8"/>
    </svg>
    Centroid
  </div>`;

  const svgMarkup = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
    style="width:100%;height:auto;display:block">
    <!-- background -->
    <rect width="${W}" height="${H}" fill="#0f1117"/>
    <!-- grid -->
    ${gridX}${gridY}
    <!-- axes -->
    <line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H - PAD}"
      stroke="#2e3548" stroke-width="1.5"/>
    <line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}"
      stroke="#2e3548" stroke-width="1.5"/>
    <!-- ticks -->
    ${xTickSVG}${yTickSVG}
    <!-- axis labels -->
    <text x="${W / 2}" y="${H - 4}" text-anchor="middle"
      font-size="12" fill="#5a6275" font-family="monospace">
      PC1 (${varPC1}% variance)
    </text>
    <text x="12" y="${H / 2}" text-anchor="middle"
      font-size="12" fill="#5a6275" font-family="monospace"
      transform="rotate(-90,12,${H / 2})">
      PC2 (${varPC2}% variance)
    </text>
    <!-- data points -->
    ${circles}
    <!-- centroids -->
    ${centMarkers}
  </svg>`;

  return `
  <div class="section" style="margin-bottom:1rem">
    <div class="section-head">
      <div class="step-circle" style="background:var(--accent)">◎</div>
      <div class="section-title">
        Visualisasi Cluster — PCA 2D
        <span style="font-size:16px;color:var(--text3);font-family:var(--mono);margin-left:8px">
          PC1 ${varPC1}% + PC2 ${varPC2}% variance
        </span>
      </div>
    </div>
    <div class="section-body">
      <div class="info-box" style="font-size:17px;margin-bottom:0.85rem">
        Proyeksi <strong>PCA (Principal Component Analysis)</strong> — data diproyeksikan ke 2 komponen
        utama untuk visualisasi. <strong>★ bintang</strong> = posisi centroid akhir.
        Hover tiap titik untuk detail baris.
        PC1+PC2 menjelaskan <strong>${(+varPC1 + +varPC2).toFixed(1)}%</strong> total variansi.
      </div>
      <div class="pca-canvas-wrap">
        ${svgMarkup}
        <div class="pca-legend">${legendItems}</div>
      </div>
    </div>
  </div>`;
}

/* ============================================================
   C. INITIALIZATION SECTION
   ============================================================ */
function renderInitSection(R) {
  const initMethodLabel = { first: 'K Data Pertama', random: 'Random', manual: 'Manual' };

  const centroidRows = R.initCentroids.map((c, ki) => {
    const col = getClusterColor(ki);
    return `<tr>
      <td>${clusterBadgeHTML(ki)}</td>
      <td style="font-family:var(--mono);font-size:17px;color:var(--text3)">Baris ${R.initIndices[ki]}</td>
      ${c.map(v => `<td class="mono">${fmt(v)}</td>`).join('')}
    </tr>`;
  }).join('');

  const logLines = R.initLog.map(l => `<div style="margin:2px 0;font-size:17px">▸ ${l}</div>`).join('');

  return `
  <div class="section" style="margin-bottom:1rem">
    <div class="section-head">
      <div class="step-circle">1</div>
      <div class="section-title">Inisialisasi Centroid — <span style="font-family:var(--mono);color:var(--accent)">${initMethodLabel[R.initMethod]}</span></div>
    </div>
    <div class="section-body">
      <div class="info-box" style="font-size:18px;margin-bottom:0.75rem">
        Centroid awal dipilih sebelum iterasi dimulai. Pilihan centroid awal mempengaruhi kecepatan konvergensi dan hasil akhir.
      </div>

      <div style="font-size:19px;font-weight:500;margin-bottom:0.5rem">Centroid Awal C₀</div>
      <div class="tbl-wrap">
        <table>
          <thead><tr>
            <th>Cluster</th><th>Sumber</th>
            ${R.featureNames.map(f => `<th>${f}</th>`).join('')}
          </tr></thead>
          <tbody>${centroidRows}</tbody>
        </table>
      </div>

      <div style="margin-top:0.75rem;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:0.75rem 1rem">
        ${logLines}
      </div>
    </div>
  </div>`;
}

/* ============================================================
   D. ITERATIONS
   ============================================================ */
function renderIterations(R) {
  const VISIBLE = 5; // iterasi langsung tampil tanpa scroll
  const iters   = R.iterations;
  const total   = iters.length;

  // Iterasi yang selalu tampil: 5 pertama + iterasi konvergen (jika berbeda)
  const lastIdx      = total - 1;
  const alwaysShow   = new Set(iters.slice(0, VISIBLE).map(it => it.iter));
  if (total > VISIBLE) alwaysShow.add(iters[lastIdx].iter); // pastikan iterasi terakhir selalu ada

  const visibleBlocks = iters
    .filter(it => alwaysShow.has(it.iter))
    .map(it => renderOneIteration(it, R))
    .join('');

  // Blok yang disembunyikan di dalam scroll container
  const hiddenIters = iters.filter(it => !alwaysShow.has(it.iter));
  const hiddenCount = hiddenIters.length;
  const hiddenBlocks = hiddenIters.map(it => renderOneIteration(it, R)).join('');

  const scrollSection = hiddenCount > 0 ? `
    <div style="margin:0.75rem 0 0.25rem">
      <button class="km-toggle" id="tog-iter-more" onclick="toggleIterScroll(this)"
        style="width:100%;justify-content:center;font-size:17px">
        <span class="tog-icon">▶</span>
        Lihat ${hiddenCount} iterasi lainnya (iterasi ${VISIBLE + 1} – ${lastIdx})
      </button>
    </div>
    <div id="iter-scroll-container" style="display:none;
      max-height:520px;overflow-y:auto;
      border:1px solid var(--border);border-radius:var(--radius-lg);
      padding:0.75rem;background:var(--bg);margin-top:0.5rem;
      scroll-behavior:smooth">
      <div style="font-size:15px;color:var(--text3);font-family:var(--mono);
        text-align:center;padding:0.5rem 0 0.75rem;letter-spacing:0.05em">
        — ${hiddenCount} ITERASI — scroll untuk navigasi —
      </div>
      ${hiddenBlocks}
    </div>` : '';

  return `
  <div class="section" style="margin-bottom:1rem">
    <div class="section-head">
      <div class="step-circle">2</div>
      <div class="section-title">
        Proses Iterasi (${total} iterasi)
        ${total > VISIBLE ? `<span style="font-size:15px;color:var(--text3);font-family:var(--mono);margin-left:8px">
          tampil: ${alwaysShow.size} langsung + ${hiddenCount} dalam scroll</span>` : ''}
      </div>
    </div>
    <div class="section-body">
      <div class="info-box" style="font-size:18px;margin-bottom:1rem">
        Setiap iterasi: <strong>(1)</strong> Hitung jarak tiap data ke semua centroid →
        <strong>(2)</strong> Assign ke cluster terdekat →
        <strong>(3)</strong> Hitung centroid baru sebagai rata-rata tiap cluster →
        <strong>(4)</strong> Cek konvergensi.
        ${total > VISIBLE ? `<br><span style="color:var(--text3);font-size:16px">
          ℹ Iterasi 1–${VISIBLE} dan iterasi konvergen (${total}) ditampilkan langsung.
          Iterasi ${VISIBLE + 1}–${lastIdx} tersedia dalam panel scroll di bawah.</span>` : ''}
      </div>
      ${visibleBlocks}
      ${scrollSection}
    </div>
  </div>`;
}

function toggleIterScroll(btn) {
  const container = document.getElementById('iter-scroll-container');
  const isOpen    = container.style.display !== 'none';
  container.style.display = isOpen ? 'none' : 'block';
  btn.classList.toggle('open', !isOpen);
  const countMatch = btn.textContent.match(/\d+ iterasi lainnya/);
  if (!isOpen) {
    btn.querySelector('.tog-icon').style.transform = 'rotate(90deg)';
    // Ganti label saat terbuka
    btn.innerHTML = btn.innerHTML.replace('Lihat', 'Tutup');
  } else {
    btn.querySelector('.tog-icon').style.transform = '';
    btn.innerHTML = btn.innerHTML.replace('Tutup', 'Lihat');
  }
}

function renderOneIteration(it, R) {
  const isConverged = it.converged;
  const id          = `iter-body-${it.iter}`;
  const isFirst     = it.iter === 1;

  // Build distance matrix table (max 20 rows for display, scroll for more)
  const maxDisplay = 20;
  const rowsToShow = Math.min(R.data.length, maxDisplay);

  const distHead = `<tr>
    <th style="font-size:16px">Baris</th>
    ${R.featureNames.map(f => `<th style="font-size:15px">${f}</th>`).join('')}
    ${Array.from({length: R.K}, (_, k) => `<th style="font-size:15px">d(C${k+1})</th>`).join('')}
    <th style="font-size:15px">Cluster</th>
  </tr>`;

  const distRows = Array.from({length: rowsToShow}, (_, ri) => {
    const row   = R.data[ri];
    const dists = it.distances[ri];
    const minD  = Math.min(...dists);
    const label = it.labels[ri];
    const col   = getClusterColor(label);

    return `<tr>
      <td style="font-family:var(--mono);font-size:16px;color:var(--text3)">${ri}</td>
      ${row.map(v => `<td class="mono" style="font-size:16px">${fmtShort(v)}</td>`).join('')}
      ${dists.map((d, k) =>
        `<td class="mono ${Math.abs(d - minD) < 1e-9 ? 'min-dist' : ''}" style="font-size:16px">${fmt(d)}</td>`
      ).join('')}
      <td>${clusterBadgeHTML(label, `C${label+1}`)}</td>
    </tr>`;
  }).join('');

  const moreRows = R.data.length > maxDisplay
    ? `<tr><td colspan="${2 + R.featureNames.length + R.K}" style="text-align:center;color:var(--text3);font-size:15px">... ${R.data.length - maxDisplay} baris lainnya</td></tr>`
    : '';

  // Centroid update section
  const centUpdateRows = Array.from({length: R.K}, (_, ki) => {
    const oldC = it.centroidsOld[ki];
    const newC = it.centroidsNew[ki];
    const changed = !oldC.every((v, i) => Math.abs(v - newC[i]) < 1e-9);
    const col = getClusterColor(ki);
    const memberCount = it.labels.filter(l => l === ki).length;

    return `<tr>
      <td>${clusterBadgeHTML(ki)}</td>
      <td style="font-family:var(--mono);font-size:16px;color:var(--text3)">${memberCount} data</td>
      ${oldC.map(v => `<td class="mono" style="font-size:16px;color:var(--text3)">${fmt(v)}</td>`).join('')}
      ${newC.map((v, fi) => {
        const delta = v - oldC[fi];
        const deltaStr = delta > 0 ? `+${fmt(delta)}` : fmt(delta);
        const color = Math.abs(delta) < 1e-9 ? 'var(--text3)' : changed ? 'var(--green)' : 'var(--text3)';
        return `<td class="mono" style="font-size:16px;color:${color};font-weight:${changed?'600':'400'}">${fmt(v)}</td>`;
      }).join('')}
      <td style="font-size:16px">${changed
        ? '<span style="color:var(--green);font-family:var(--mono)">✓ berubah</span>'
        : '<span style="color:var(--text3);font-family:var(--mono)">— sama</span>'}</td>
    </tr>`;
  }).join('');

  // Build Excel formula block for distance calc (show first data point as example)
  const exFormula = buildIterExcelFormula(R.data[0], it.centroidsOld, R.featureNames, R.distMetric, it.distances[0]);

  // Convergence badge
  const convBadge = isConverged
    ? `<div class="converge-banner">
        <div class="converge-icon">🎯</div>
        <div>
          <div class="converge-text">Konvergen! Centroid tidak berubah.</div>
          <div class="converge-sub">Algoritma selesai pada iterasi ${it.iter}.</div>
        </div>
      </div>`
    : '';

  const headerClass = `iter-header ${isConverged ? 'converged' : 'active'} ${isFirst ? 'open' : ''}`;

  return `
  <div class="iter-block">
    <div class="${headerClass}" onclick="toggleIterBlock(this)">
      <div class="iter-title">
        <div class="iter-num ${isConverged ? 'green' : ''}">${it.iter}</div>
        <span>Iterasi ${it.iter}</span>
        ${isConverged ? '<span style="font-size:16px;color:var(--green);font-family:var(--mono);margin-left:6px">KONVERGEN ✓</span>' : ''}
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <div style="font-size:17px;color:var(--text3);font-family:var(--mono)">
          ${it.labels.map((l,_) => `<span style="color:${getClusterColor(l).hex}">●</span>`).join('')}
        </div>
        <div class="iter-chevron">▶</div>
      </div>
    </div>

    <div class="iter-body ${isFirst ? 'open' : ''}" id="${id}">

      <!-- Step 2.1: Distance Matrix -->
      <div class="step-divider"><span>LANGKAH 2.${it.iter}.1 — Hitung Jarak ke Semua Centroid</span></div>
      <div style="font-size:18px;color:var(--text2);margin-bottom:0.5rem">
        Hitung jarak setiap data ke semua K centroid, lalu assign ke centroid terdekat (ditandai biru).
      </div>

      <!-- Formula explanation toggle -->
      <div class="km-toggle" id="tog-dist-${it.iter}" onclick="toggleSection('formula-dist-${it.iter}', this)">
        <span class="tog-icon">▶</span> Lihat Formula Jarak Baris-0 (Contoh)
      </div>
      <div id="formula-dist-${it.iter}" style="display:none;margin-top:0.5rem">
        ${exFormula}
      </div>

      <div class="tbl-scroll-both" style="margin-top:0.75rem">
        <table class="dist-matrix">
          <thead>${distHead}</thead>
          <tbody>${distRows}${moreRows}</tbody>
        </table>
      </div>

      <!-- Step 2.2: Centroid Update -->
      <div class="step-divider" style="margin-top:1.25rem"><span>LANGKAH 2.${it.iter}.2 — Update Centroid (Rata-rata Cluster)</span></div>
      <div style="font-size:18px;color:var(--text2);margin-bottom:0.5rem">
        Centroid baru = rata-rata koordinat semua anggota cluster.
        Nilai <span style="color:var(--green);font-family:var(--mono)">hijau</span> = berubah dari iterasi sebelumnya.
      </div>

      <div class="km-toggle" id="tog-cent-${it.iter}" onclick="toggleSection('formula-cent-${it.iter}', this)">
        <span class="tog-icon">▶</span> Lihat Formula Centroid (Contoh C1)
      </div>
      <div id="formula-cent-${it.iter}" style="display:none;margin-top:0.5rem">
        ${buildCentroidFormula(it, R, 0)}
      </div>

      <div class="tbl-wrap" style="margin-top:0.75rem">
        <table>
          <thead><tr>
            <th>Cluster</th>
            <th>Anggota</th>
            ${R.featureNames.map(f => `<th style="color:var(--text3)">Lama: ${f}</th>`).join('')}
            ${R.featureNames.map(f => `<th style="color:var(--green)">Baru: ${f}</th>`).join('')}
            <th>Status</th>
          </tr></thead>
          <tbody>${centUpdateRows}</tbody>
        </table>
      </div>

      ${convBadge}
    </div>
  </div>`;
}

/* ============================================================
   E. FINAL ASSIGNMENT TABLE
   ============================================================ */
function renderFinalTable(R) {
  // Reconstruct original row labels
  const activeCols = R.rawHeaders.map((_, i) => i).filter(i => R.selectedCols[i]);

  const rows = R.data.map((row, ri) => {
    const label = R.finalLabels[ri];
    const col   = getClusterColor(label);
    // Find original raw row (accounting for dropped rows is complex; use data index)
    const rawRow = R.rawRows[ri] || [];

    return `<tr>
      <td class="mono" style="font-size:16px;color:var(--text3)">${ri + 1}</td>
      ${activeCols.map(ci => `<td class="mono" style="font-size:16px">${rawRow[ci] !== undefined ? rawRow[ci] : fmtShort(row[activeCols.indexOf(ci)])}</td>`).join('')}
      <td class="cluster-cell" style="color:${col.hex};font-family:var(--mono);font-size:17px">C${label + 1}</td>
      <td>${clusterBadgeHTML(label, `Cluster ${label + 1}`)}</td>
    </tr>`;
  }).join('');

  return `
  <div class="section" style="margin-bottom:1rem">
    <div class="section-head">
      <div class="step-circle">3</div>
      <div class="section-title">Hasil Akhir — Penugasan Cluster</div>
    </div>
    <div class="section-body">
      <div class="tbl-scroll-both">
        <table class="result-table">
          <thead><tr>
            <th>#</th>
            ${activeCols.map(ci => `<th>${R.rawHeaders[ci]}</th>`).join('')}
            <th>Cluster ID</th>
            <th>Cluster</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

/* ============================================================
   F. CLUSTER TILES (SUMMARY)
   ============================================================ */
function renderClusterTiles(R) {
  const tiles = R.clusterSummary.map(c => {
    const col   = getClusterColor(c.clusterIdx);
    const stats = c.stats.map(s =>
      `<tr>
        <td style="font-size:17px;color:var(--text2)">${s.feature}</td>
        <td class="mono" style="font-size:17px;color:${col.hex}">${fmt(s.mean)}</td>
        <td class="mono" style="font-size:16px;color:var(--text3)">${fmt(s.min)}</td>
        <td class="mono" style="font-size:16px;color:var(--text3)">${fmt(s.max)}</td>
      </tr>`
    ).join('');

    return `
    <div class="cluster-tile" style="border-left:3px solid ${col.hex}">
      <div class="cluster-tile-head">
        ${clusterBadgeHTML(c.clusterIdx, `Cluster ${c.clusterIdx + 1}`)}
        <span class="cluster-tile-count">${c.count} anggota</span>
        <span style="margin-left:auto;font-family:var(--mono);font-size:16px;color:var(--text3)">SSE: ${fmtShort(c.sse)}</span>
      </div>
      <div style="font-size:17px;color:var(--text3);margin-bottom:0.5rem">
        Centroid: [${c.centroid.map(v => fmt(v)).join(', ')}]
      </div>
      <table style="font-size:17px">
        <thead><tr>
          <th style="font-size:15px">Fitur</th>
          <th style="font-size:15px;color:${col.hex}">Mean</th>
          <th style="font-size:15px">Min</th>
          <th style="font-size:15px">Max</th>
        </tr></thead>
        <tbody>${stats}</tbody>
      </table>
    </div>`;
  }).join('');

  return `
  <div class="section" style="margin-bottom:1rem">
    <div class="section-head">
      <div class="step-circle">4</div>
      <div class="section-title">Ringkasan Tiap Cluster</div>
    </div>
    <div class="section-body">
      ${tiles}
    </div>
  </div>`;
}

/* ============================================================
   G. FORMULA HELPERS
   ============================================================ */

function buildIterExcelFormula(point, centroids, featureNames, metric, dists) {
  const blocks = centroids.map((c, ki) => {
    const detail = window._buildDistDetail(point, c, metric, featureNames);
    const col = getClusterColor(ki);

    let formulaBody = '';
    if (metric === 'euclidean') {
      const terms = detail.steps.map(s =>
        `(${fmt(s.pointVal)} − ${fmt(s.centVal)})² = ${fmt(s.diff)}² = ${fmt(s.squared)}`
      ).join('\n           ');
      formulaBody = `d(x, C${ki+1}) = √[ ${detail.steps.map(s => `(${fmt(s.pointVal)}−${fmt(s.centVal)})²`).join(' + ')} ]
           = √[ ${detail.steps.map(s => fmt(s.squared)).join(' + ')} ]
           = √[ ${fmt(detail.sumSq)} ]
           = ${fmt(detail.result)}`;
    } else {
      const terms = detail.steps.map(s =>
        `|${fmt(s.pointVal)} − ${fmt(s.centVal)}| = ${fmt(s.absVal)}`
      ).join('\n           ');
      formulaBody = `d(x, C${ki+1}) = ${detail.steps.map(s => `|${fmt(s.pointVal)}−${fmt(s.centVal)}|`).join(' + ')}
           = ${detail.steps.map(s => fmt(s.absVal)).join(' + ')}
           = ${fmt(detail.result)}`;
    }

    return `<div style="margin-bottom:0.65rem">
      <div style="font-size:16px;font-weight:600;color:${col.hex};margin-bottom:3px">
        ke C${ki+1} = [${c.map(fmt).join(', ')}]
      </div>
      <pre style="margin:0;white-space:pre-wrap;word-break:break-all;font-size:16px;color:#a8c8ff;line-height:1.7">${formulaBody}</pre>
    </div>`;
  }).join('<hr style="border:none;border-top:1px dashed rgba(79,156,249,0.15);margin:6px 0">');

  return `<div class="km-excel-block">
    <div class="excel-label">Formula Jarak — Baris 0: [${point.map(fmt).join(', ')}]</div>
    ${blocks}
  </div>`;
}

function buildCentroidFormula(it, R, ki) {
  const members = it.labels.map((l, i) => ({ l, i })).filter(x => x.l === ki);
  if (!members.length) return '';

  const col = getClusterColor(ki);
  const rows = members.map(x => R.data[x.i]);

  const formulaLines = R.featureNames.map((f, fi) => {
    const vals = rows.map(r => fmt(r[fi]));
    const s    = rows.reduce((acc, r) => acc + r[fi], 0);
    return `${f}: (${vals.join(' + ')}) / ${rows.length} = ${fmt(s / rows.length)}`;
  }).join('\n');

  return `<div class="km-excel-block">
    <div class="excel-label">Centroid Baru C${ki+1} — ${members.length} anggota</div>
    <pre style="margin:0;white-space:pre-wrap;font-size:16px;color:#a8c8ff;line-height:1.9">${formulaLines}</pre>
  </div>`;
}

/* ============================================================
   H. EXPORT BUTTONS
   ============================================================ */
function renderExportRow(R) {
  return `
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin:1.5rem 0 2rem">
    <button class="btn btn-green" onclick="exportFormulaXLSX()">&#8595; Download Excel (Formula)</button>
    <button class="btn btn-green" onclick="exportPlainTextXLSX()">&#8595; Download Excel (Plain Text)</button>
    <button class="btn btn-sm"    onclick="goBack()">← Kembali ke Input</button>
  </div>`;
}