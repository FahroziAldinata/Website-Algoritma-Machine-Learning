// ============================================================
//  js/LinearRegression/lr_render.js
//  Tampilkan persamaan, scatter plot (SVG), tabel kalkulasi
// ============================================================

// ---- Render Equation Banner ----
function renderEquation(model) {
  const el = document.getElementById('r-equation');
  if (!el) return;
  const eq = equationString(model);
  el.innerHTML = `
    <div class="formula" style="font-size:22px; letter-spacing:0.02em; color:#a8d8ff;">
      ${eq}
    </div>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:0.5rem;">
      ${model.mode === 'simple'
        ? `<span class="chip chip-ok">Sederhana · 1 fitur</span>`
        : `<span class="chip chip-ok">Berganda · ${model.feats.length} fitur</span>`}
      <span class="chip" style="background:var(--bg4);color:var(--text2);">
        Reg: ${model.reg.toUpperCase()}${model.reg !== 'none' ? ' λ=' + model.lambda : ''}
      </span>
      <span class="chip" style="background:var(--bg4);color:var(--text2);">n = ${model.n}</span>
    </div>
  `;
}

// ---- Render Metrics Cards ----
function renderMetrics(metrics, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const r2Color = metrics.r2 >= 0.8 ? 'metric-green' : metrics.r2 >= 0.5 ? 'metric-blue' : 'metric-red';
  el.innerHTML = `
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">R²</div>
        <div class="metric-val ${r2Color}">${fmt(metrics.r2, 4)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">MSE</div>
        <div class="metric-val metric-blue">${fmt(metrics.mse, 4)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">RMSE</div>
        <div class="metric-val metric-blue">${fmt(metrics.rmse, 4)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">MAE</div>
        <div class="metric-val metric-blue">${fmt(metrics.mae, 4)}</div>
      </div>
    </div>
    <div class="info-box" style="margin-top:0.5rem; font-size:13px;">
      SS<sub>res</sub> = ${fmt(metrics.ssRes, 4)} &nbsp;|&nbsp;
      SS<sub>tot</sub> = ${fmt(metrics.ssTot, 4)}
    </div>
  `;
}

// ---- Scatter Plot (SVG inline) — diperbesar & center ----
function renderScatterPlot(model, containerId = 'r-scatter-plot') {
  const el = document.getElementById(containerId);
  if (!el) return;

  // FIX #4: Perbesar dimensi dan center
  const W = 700, H = 420;
  const PAD = { top: 30, right: 30, bottom: 60, left: 70 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top  - PAD.bottom;

  let xVals, yVals, xLabel, yLabel;

  if (model.mode === 'simple') {
    xVals  = model.details.map(d => d.x);
    yVals  = model.details.map(d => d.y);
    xLabel = model.feats[0];
    yLabel = model.target;
  } else {
    xVals  = model.preds;
    yVals  = model.yArr;
    xLabel = 'ŷ (Prediksi)';
    yLabel = model.target + ' (Aktual)';
  }

  const xMin = Math.min(...xVals), xMax = Math.max(...xVals);
  const yMin = Math.min(...yVals), yMax = Math.max(...yVals);
  const xPad = (xMax - xMin) * 0.1 || 1;
  const yPad = (yMax - yMin) * 0.1 || 1;
  const xL = xMin - xPad, xR = xMax + xPad;
  const yB = yMin - yPad, yT = yMax + yPad;

  const sx = v => PAD.left + (v - xL) / (xR - xL) * iW;
  const sy = v => PAD.top  + (1 - (v - yB) / (yT - yB)) * iH;

  function niceRange(lo, hi, n = 6) {
    const step = (hi - lo) / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step)));
    const niceStep = Math.ceil(step / mag) * mag;
    const start = Math.ceil(lo / niceStep) * niceStep;
    const ticks = [];
    for (let t = start; t <= hi + 1e-9; t += niceStep) ticks.push(parseFloat(t.toFixed(10)));
    return ticks;
  }

  const xTicks = niceRange(xL, xR);
  const yTicks = niceRange(yB, yT);

  let linePath;
  if (model.mode === 'simple') {
    const ly1 = model.intercept + model.slope * xL;
    const ly2 = model.intercept + model.slope * xR;
    linePath = `M ${sx(xL)} ${sy(ly1)} L ${sx(xR)} ${sy(ly2)}`;
  } else {
    const lo = Math.min(xL, yB), hi = Math.max(xR, yT);
    linePath = `M ${sx(lo)} ${sy(lo)} L ${sx(hi)} ${sy(hi)}`;
  }

  const dots = xVals.map((x, i) =>
    `<circle cx="${sx(x).toFixed(1)}" cy="${sy(yVals[i]).toFixed(1)}" r="6"
      fill="var(--accent)" stroke="var(--bg)" stroke-width="1.5" opacity="0.88"/>`
  ).join('');

  const xTicksSVG = xTicks.map(t => `
    <line x1="${sx(t)}" y1="${PAD.top + iH}" x2="${sx(t)}" y2="${PAD.top + iH + 6}" stroke="var(--border2)"/>
    <text x="${sx(t)}" y="${PAD.top + iH + 20}" text-anchor="middle" font-size="12" fill="var(--text3)">${fmt(t, 2)}</text>
  `).join('');

  const yTicksSVG = yTicks.map(t => `
    <line x1="${PAD.left - 6}" y1="${sy(t)}" x2="${PAD.left}" y2="${sy(t)}" stroke="var(--border2)"/>
    <text x="${PAD.left - 10}" y="${sy(t) + 4}" text-anchor="end" font-size="12" fill="var(--text3)">${fmt(t, 2)}</text>
    <line x1="${PAD.left}" y1="${sy(t)}" x2="${PAD.left + iW}" y2="${sy(t)}" stroke="var(--border)" stroke-dasharray="3,3"/>
  `).join('');

  // FIX #4: wrapper center dengan max-width penuh
  el.innerHTML = `
    <div style="display:flex; justify-content:center; width:100%;">
      <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
           style="width:100%; max-width:${W}px; background:var(--bg2); border-radius:10px; border:1px solid var(--border);">
        <!-- axes -->
        <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + iH}" stroke="var(--border2)" stroke-width="1.5"/>
        <line x1="${PAD.left}" y1="${PAD.top + iH}" x2="${PAD.left + iW}" y2="${PAD.top + iH}" stroke="var(--border2)" stroke-width="1.5"/>
        ${yTicksSVG}
        ${xTicksSVG}
        <!-- regression / reference line -->
        <path d="${linePath}" stroke="var(--accent)" stroke-width="2.5" fill="none"
              stroke-dasharray="${model.mode === 'multiple' ? '7,4' : 'none'}"/>
        <!-- dots -->
        ${dots}
        <!-- axis labels -->
        <text x="${PAD.left + iW / 2}" y="${H - 6}" text-anchor="middle" font-size="13" fill="var(--text2)" font-weight="500">${xLabel}</text>
        <text x="14" y="${PAD.top + iH / 2}" text-anchor="middle" font-size="13" fill="var(--text2)" font-weight="500"
              transform="rotate(-90, 14, ${PAD.top + iH / 2})">${yLabel}</text>
        ${model.mode === 'multiple'
          ? `<text x="${sx((xL+xR)/2)}" y="${sy((xL+xR)/2) - 10}" font-size="12" fill="var(--text3)" text-anchor="middle">y = ŷ (perfect fit)</text>`
          : ''}
      </svg>
    </div>
  `;
}

// ---- Pagination Bar Helper ----
function _paginationBar(curPage, totalPages, total, sliceStart, sliceEnd, tabKey) {
  if (totalPages <= 1) return '';
  const info = `Baris ${sliceStart + 1}–${sliceEnd} dari ${total}`;

  const prevDisabled = curPage <= 1 ? 'disabled' : '';
  const nextDisabled = curPage >= totalPages ? 'disabled' : '';

  // Buat tombol halaman (max 5 terlihat)
  let pages = '';
  const maxBtn = 5;
  let start = Math.max(1, curPage - 2);
  let end   = Math.min(totalPages, start + maxBtn - 1);
  if (end - start < maxBtn - 1) start = Math.max(1, end - maxBtn + 1);

  if (start > 1) pages += `<button class="pg-btn" onclick="goCalcPage('${tabKey}',1)">1</button>`;
  if (start > 2) pages += `<span class="pg-ellipsis">…</span>`;
  for (let i = start; i <= end; i++) {
    pages += `<button class="pg-btn${i === curPage ? ' pg-active' : ''}" onclick="goCalcPage('${tabKey}',${i})">${i}</button>`;
  }
  if (end < totalPages - 1) pages += `<span class="pg-ellipsis">…</span>`;
  if (end < totalPages)     pages += `<button class="pg-btn" onclick="goCalcPage('${tabKey}',${totalPages})">${totalPages}</button>`;

  return `
    <div class="pagination-bar">
      <span class="pg-info">${info}</span>
      <div class="pg-controls">
        <button class="pg-btn pg-nav" onclick="goCalcPage('${tabKey}',${curPage-1})" ${prevDisabled}>&#8592;</button>
        ${pages}
        <button class="pg-btn pg-nav" onclick="goCalcPage('${tabKey}',${curPage+1})" ${nextDisabled}>&#8594;</button>
      </div>
    </div>
  `;
}

// ---- Tabel Kalkulasi Manual — Train/Test (Sederhana) ----
// page & pageSize opsional — jika tidak diisi, tampilkan semua
function renderCalcTableSimple(model, rows, containerId, page = 1, pageSize = 0) {
  const el = document.getElementById(containerId);
  if (!el || model.mode !== 'simple') return;

  const xMean = model.xMean;
  const yMean = model.yMean;
  const total = rows.length;

  // Tentukan slice yang ditampilkan
  const usePaging = pageSize > 0 && total > pageSize;
  const totalPages = usePaging ? Math.ceil(total / pageSize) : 1;
  const curPage    = usePaging ? Math.max(1, Math.min(page, totalPages)) : 1;
  const sliceStart = usePaging ? (curPage - 1) * pageSize : 0;
  const sliceEnd   = usePaging ? Math.min(sliceStart + pageSize, total) : total;
  const slicedRows = rows.slice(sliceStart, sliceEnd);

  // Hitung detail hanya untuk baris yang ditampilkan
  const details = slicedRows.map((r, i) => {
    const x    = r[model.feats[0]];
    const y    = r[model.target];
    const xDev = x - xMean;
    const yDev = y - yMean;
    const yHat = model.intercept + model.slope * x;
    return { x, y, xDev, yDev, xDevSq: xDev**2, crossDev: xDev*yDev, yHat, resid: y-yHat, residSq: (y-yHat)**2 };
  });

  // Total keseluruhan (bukan hanya halaman)
  const totXDevSq   = rows.reduce((s, r) => { const d = r[model.feats[0]] - xMean; return s + d*d; }, 0);
  const totCrossDev = rows.reduce((s, r) => { const dx = r[model.feats[0]]-xMean; const dy = r[model.target]-yMean; return s+dx*dy; }, 0);
  const totResidSq  = rows.reduce((s, r) => { const e = r[model.target]-(model.intercept+model.slope*r[model.feats[0]]); return s+e*e; }, 0);

  const trows = details.map((d, i) => `
    <tr>
      <td class="mono">${sliceStart + i + 1}</td>
      <td class="mono">${fmt(d.x)}</td>
      <td class="mono">${fmt(d.y)}</td>
      <td class="mono">${fmt(d.xDev)}</td>
      <td class="mono">${fmt(d.yDev)}</td>
      <td class="mono">${fmt(d.xDevSq)}</td>
      <td class="mono">${fmt(d.crossDev)}</td>
      <td class="mono">${fmt(d.yHat)}</td>
      <td class="mono">${fmt(d.resid)}</td>
      <td class="mono">${fmt(d.residSq)}</td>
    </tr>`).join('');

  // Tentukan tabKey dari containerId
  const tabKey = containerId.includes('train') ? 'train' : 'test';

  el.innerHTML = `
    ${usePaging ? _paginationBar(curPage, totalPages, total, sliceStart, sliceEnd, tabKey) : ''}
    <div class="tbl-wrap-scroll">
    <table>
      <thead><tr>
        <th>#</th>
        <th>${model.feats[0]} (x)</th>
        <th>${model.target} (y)</th>
        <th>x − x̄</th><th>y − ȳ</th>
        <th>(x−x̄)²</th><th>(x−x̄)(y−ȳ)</th>
        <th>ŷ</th><th>e = y−ŷ</th><th>e²</th>
      </tr></thead>
      <tbody>
        ${trows}
        ${!usePaging ? `
        <tr style="border-top:2px solid var(--border2);background:var(--bg3);">
          <td class="mono" colspan="2"><strong>Rata-rata / Total</strong></td>
          <td class="mono"><strong>${fmt(yMean)}</strong></td>
          <td colspan="2"></td>
          <td class="mono"><strong>${fmt(totXDevSq)}</strong></td>
          <td class="mono"><strong>${fmt(totCrossDev)}</strong></td>
          <td colspan="2"></td>
          <td class="mono"><strong>${fmt(totResidSq)}</strong></td>
        </tr>` : ''}
      </tbody>
    </table>
    </div>
    ${usePaging ? _paginationBar(curPage, totalPages, total, sliceStart, sliceEnd, tabKey) : ''}
    <div class="info-box" style="margin-top:0.75rem;font-size:13px;line-height:2;">
      x̄ = ${fmt(xMean)} &nbsp;|&nbsp; ȳ = ${fmt(yMean)} &nbsp;|&nbsp;
      n total = ${total}<br>
      Σ(x−x̄)² = ${fmt(totXDevSq)} &nbsp;|&nbsp; Σ(x−x̄)(y−ȳ) = ${fmt(totCrossDev)}<br>
      b = ${fmt(totCrossDev)} / ${fmt(totXDevSq)} = <strong>${fmt(model.slope)}</strong> &nbsp;|&nbsp;
      a = <strong>${fmt(model.intercept)}</strong>
    </div>
  `;
}

// ---- Tabel Kalkulasi Berganda (train & test) dengan pagination ----
function renderCalcTableMultiple(model, rows, containerId, page = 1, pageSize = 0) {
  const el = document.getElementById(containerId);
  if (!el || model.mode !== 'multiple') return;

  const total      = rows.length;
  const usePaging  = pageSize > 0 && total > pageSize;
  const totalPages = usePaging ? Math.ceil(total / pageSize) : 1;
  const curPage    = usePaging ? Math.max(1, Math.min(page, totalPages)) : 1;
  const sliceStart = usePaging ? (curPage - 1) * pageSize : 0;
  const sliceEnd   = usePaging ? Math.min(sliceStart + pageSize, total) : total;
  const slicedRows = rows.slice(sliceStart, sliceEnd);
  const tabKey     = containerId.includes('train') ? 'train' : 'test';

  const trows = slicedRows.map((r, i) => {
    const yHat  = predictLR(model, r);
    const y     = r[model.target];
    const resid = y - yHat;
    const xCells = model.feats.map(f => `<td class="mono">${fmt(r[f])}</td>`).join('');
    return `<tr>
      <td class="mono">${sliceStart + i + 1}</td>
      ${xCells}
      <td class="mono">${fmt(y)}</td>
      <td class="mono">${fmt(yHat)}</td>
      <td class="mono">${fmt(resid)}</td>
      <td class="mono">${fmt(resid**2)}</td>
    </tr>`;
  }).join('');

  const featHeaders = model.feats.map(f => `<th>${f}</th>`).join('');

  el.innerHTML = `
    ${usePaging ? _paginationBar(curPage, totalPages, total, sliceStart, sliceEnd, tabKey) : ''}
    <div class="tbl-wrap-scroll">
    <table>
      <thead><tr>
        <th>#</th>${featHeaders}
        <th>${model.target} (y)</th>
        <th>ŷ (prediksi)</th>
        <th>e = y−ŷ</th>
        <th>e²</th>
      </tr></thead>
      <tbody>${trows}</tbody>
    </table>
    </div>
    ${usePaging ? _paginationBar(curPage, totalPages, total, sliceStart, sliceEnd, tabKey) : ''}
  `;
}

// ---- Tabel Prediksi (untuk test, dengan kolom aktual & residual) ----
function renderPredTable(model, rows, label, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const header = model.feats.map(f => `<th>${f}</th>`).join('');
  const trows = rows.map((r, i) => {
    const yHat   = predictLR(model, r);
    const xCells = model.feats.map(f => `<td class="mono">${fmt(r[f])}</td>`).join('');
    const actual = r[model.target] !== undefined
      ? `<td class="mono">${fmt(r[model.target])}</td><td class="mono">${fmt(r[model.target] - yHat)}</td>`
      : `<td>—</td><td>—</td>`;
    return `<tr><td class="mono">${i + 1}</td>${xCells}<td class="mono">${fmt(yHat)}</td>${actual}</tr>`;
  }).join('');

  el.innerHTML = `
    <p class="sub-title">${label}</p>
    <div class="tbl-wrap-scroll">
    <table>
      <thead><tr>
        <th>#</th>${header}<th>ŷ (Pred)</th><th>${model.target} (Aktual)</th><th>Residual</th>
      </tr></thead>
      <tbody>${trows}</tbody>
    </table>
    </div>
  `;
}

// ---- Render Koefisien Berganda ----
function renderCoefTable(model, containerId = 'r-coef-table') {
  const el = document.getElementById(containerId);
  if (!el || model.mode !== 'multiple') return;
  const rows = [
    `<tr><td class="mono">Intercept (a)</td><td class="mono"><strong>${fmt(model.intercept, 6)}</strong></td></tr>`,
    ...model.feats.map((f, j) =>
      `<tr><td class="mono">${f} (b${j + 1})</td><td class="mono"><strong>${fmt(model.slopes[j], 6)}</strong></td></tr>`
    )
  ].join('');

  el.innerHTML = `
    <div class="tbl-wrap">
    <table>
      <thead><tr><th>Parameter</th><th>Nilai</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
  `;
}