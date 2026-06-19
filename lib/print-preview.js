/* ============================================
   SPK MODULES — print-preview.js
   Generate halaman print khusus berisi:
   1. Info konfigurasi + tabel dataset
   2. Tabel normalisasi
   3. Tabel perhitungan per tahap (dipisah)
   4. Tabel perangkingan final
   Dipanggil dari result.js via printPreview(R)
   Dependensi: tidak ada (standalone)
   ============================================ */

'use strict';

/**
 * Buka jendela print dengan layout tabel lengkap.
 * @param {Object} R - payload lengkap dari sessionStorage
 */
function printPreview(R) {
  if (!R || !R.result) return;

  const html = buildPrintHTML(R);
  const win  = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    if (window.Toast) window.Toast.show('Popup diblokir browser. Izinkan popup untuk halaman ini.');
    return;
  }

  win.document.write(html);
  win.document.close();

  // Tunggu semua konten selesai lalu trigger print dialog
  win.onload = () => {
    setTimeout(() => win.print(), 300);
  };
}


/* ══════════════════════════════════════════
   BUILDER UTAMA
══════════════════════════════════════════ */
function buildPrintHTML(R) {
  const { method, weightMethod, selectedCols, criteriaTypes, weights,
          result, rawData, labelCol, lambda, dataSource, fileName } = R;

  const METHOD_LABELS = { saw: 'SAW', topsis: 'TOPSIS', waspas: 'WASPAS', moora: 'MOORA', edas: 'EDAS' };
  const methodLabel   = METHOD_LABELS[method] || method.toUpperCase();

  // Data rows
  const headers  = rawData[0];
  const dataRows = rawData.slice(1);
  const labelIdx = headers.indexOf(labelCol);
  const labels   = dataRows.map((r, i) => labelIdx >= 0 ? String(r[labelIdx]) : `A${i + 1}`);
  const matrix   = dataRows.map(row =>
    selectedCols.map(col => parseFloat(row[headers.indexOf(col)]) || 0)
  );

  const src = dataSource === 'file'   ? fileName
            : dataSource === 'sample' ? `Contoh (${fileName})`
            : 'Input Manual';

  // Bangun semua section
  const sections = [
    buildSectionInfo(R, methodLabel, src, labels.length),
    buildSectionDataset(labels, matrix, selectedCols, criteriaTypes, weights),
    ...buildSectionCalc(method, labels, matrix, selectedCols, criteriaTypes, weights, lambda),
    buildSectionRanking(result.ranked, methodLabel),
  ];

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Laporan SPK — ${methodLabel}</title>
  <style>${getPrintCSS()}</style>
</head>
<body>
  <div class="print-wrap">
    ${sections.join('\n')}
  </div>
</body>
</html>`;
}


/* ══════════════════════════════════════════
   SECTION 0 — INFO KONFIGURASI
══════════════════════════════════════════ */
function buildSectionInfo(R, methodLabel, src, altCount) {
  const { selectedCols, weights, criteriaTypes, method, weightMethod, lambda } = R;

  const rows = selectedCols.map(col => {
    const type = criteriaTypes[col] || 'benefit';
    const w    = weights[col] || 0;
    return `<tr>
      <td>${esc(col)}</td>
      <td class="${type === 'benefit' ? 'benefit' : 'cost'}">
        ${type === 'benefit' ? 'Benefit (+)' : 'Cost (−)'}
      </td>
      <td class="num">${(w * 100).toFixed(2)}%</td>
      <td class="num">${w.toFixed(4)}</td>
    </tr>`;
  }).join('');

  const lambdaRow = method === 'waspas'
    ? `<div class="meta-item"><span class="meta-label">Lambda (λ)</span><span class="meta-val">${lambda ?? 0.5}</span></div>`
    : '';

  return `
  <div class="section no-break">
    <div class="doc-header">
      <div class="doc-title">Laporan Analisis SPK</div>
      <div class="doc-subtitle">Sistem Pendukung Keputusan Multi-Kriteria — DecisionLab</div>
    </div>

    <div class="meta-row">
      <div class="meta-item"><span class="meta-label">Metode</span><span class="meta-val bold">${esc(methodLabel)}</span></div>
      <div class="meta-item"><span class="meta-label">Pembobotan</span><span class="meta-val">${esc(cap(R.weightMethod))}</span></div>
      <div class="meta-item"><span class="meta-label">Alternatif</span><span class="meta-val">${altCount}</span></div>
      <div class="meta-item"><span class="meta-label">Kriteria</span><span class="meta-val">${selectedCols.length}</span></div>
      <div class="meta-item"><span class="meta-label">Sumber Data</span><span class="meta-val">${esc(src)}</span></div>
      ${lambdaRow}
    </div>

    <div class="section-title">Konfigurasi Bobot &amp; Tipe Kriteria</div>
    <table>
      <thead><tr>
        <th>Kriteria</th><th>Tipe</th><th>Bobot (%)</th><th>Bobot (desimal)</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}


/* ══════════════════════════════════════════
   SECTION 1 — DATASET ASLI
══════════════════════════════════════════ */
function buildSectionDataset(labels, matrix, selectedCols, criteriaTypes, weights) {
  const headerCols = selectedCols.map(col => {
    const type = criteriaTypes[col] || 'benefit';
    const w    = weights[col] || 0;
    return `<th>${esc(col)}<br>
      <span class="sub ${type === 'benefit' ? 'benefit' : 'cost'}">${type === 'benefit' ? '+B' : '−C'}</span>
      <span class="sub">${(w * 100).toFixed(1)}%</span>
    </th>`;
  }).join('');

  const bodyRows = labels.map((lbl, i) =>
    `<tr>
      <td class="label-col">${esc(lbl)}</td>
      ${matrix[i].map(v => `<td class="num">${fmt(v)}</td>`).join('')}
    </tr>`
  ).join('');

  return `
  <div class="section">
    <div class="section-title">1. Dataset Asli (Matriks Keputusan)</div>
    <p class="section-desc">Nilai mentah setiap alternatif pada setiap kriteria sebelum normalisasi.</p>
    <table>
      <thead><tr><th>Alternatif</th>${headerCols}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>`;
}


/* ══════════════════════════════════════════
   SECTION 2 — PERHITUNGAN PER METODE
   Mengembalikan array section HTML (dipisah)
══════════════════════════════════════════ */
function buildSectionCalc(method, labels, matrix, selectedCols, criteriaTypes, weights, lambda) {
  const builders = {
    saw:    () => calcSectionsSAW(labels, matrix, selectedCols, criteriaTypes, weights),
    topsis: () => calcSectionsTOPSIS(labels, matrix, selectedCols, criteriaTypes, weights),
    waspas: () => calcSectionsWASPAS(labels, matrix, selectedCols, criteriaTypes, weights, lambda),
    moora:  () => calcSectionsMOORA(labels, matrix, selectedCols, criteriaTypes, weights),
    edas:   () => calcSectionsEDAS(labels, matrix, selectedCols, criteriaTypes, weights),
  };

  const builder = builders[method];
  return builder ? builder() : [`<div class="section"><p>Metode tidak dikenal.</p></div>`];
}


/* ──────────────────────────────────────────
   SAW — 2 section: normalisasi + skor akhir
────────────────────────────────────────── */
function calcSectionsSAW(labels, matrix, selectedCols, criteriaTypes, weights) {
  const m = matrix.length;
  const n = selectedCols.length;

  // Normalisasi
  const norm = matrix.map(r => r.slice());
  for (let j = 0; j < n; j++) {
    const vals = matrix.map(r => r[j]);
    const max  = Math.max(...vals);
    const min  = Math.min(...vals);
    const type = criteriaTypes[selectedCols[j]] || 'benefit';
    for (let i = 0; i < m; i++) {
      norm[i][j] = type === 'benefit'
        ? (max === 0 ? 0 : matrix[i][j] / max)
        : (matrix[i][j] === 0 ? 0 : min / matrix[i][j]);
    }
  }

  const scores = norm.map((row, i) =>
    selectedCols.reduce((s, col, j) => s + (weights[col] || 0) * row[j], 0)
  );
  const ranked = labels.map((lbl, i) => ({ lbl, score: scores[i] }))
    .sort((a, b) => b.score - a.score).map((item, ri) => ({ ...item, rank: ri + 1 }));

  return [
    buildMatrixSection('2. Normalisasi Linear (r)',
      'Benefit: r = x / MAX(kolom) &nbsp;|&nbsp; Cost: r = MIN(kolom) / x',
      labels, norm, selectedCols, criteriaTypes, weights),

    buildSimpleSection('3. Skor Akhir SAW (V)',
      'V<sub>i</sub> = Σ w<sub>j</sub> × r<sub>ij</sub> &nbsp;|&nbsp; Alternatif dengan V tertinggi adalah terbaik.',
      ['Rank', 'Alternatif', 'Skor V'],
      ranked.map(item => [item.rank, item.lbl, fmt(item.score)])),
  ];
}


/* ──────────────────────────────────────────
   TOPSIS — 5 section
────────────────────────────────────────── */
function calcSectionsTOPSIS(labels, matrix, selectedCols, criteriaTypes, weights) {
  const m = matrix.length;
  const n = selectedCols.length;

  // Normalisasi vektor
  const norm = matrix.map(r => r.slice());
  for (let j = 0; j < n; j++) {
    const d = Math.sqrt(matrix.reduce((s, r) => s + r[j] ** 2, 0));
    for (let i = 0; i < m; i++) norm[i][j] = d === 0 ? 0 : matrix[i][j] / d;
  }

  // Weighted
  const weighted = norm.map(row => row.map((v, j) => v * (weights[selectedCols[j]] || 0)));

  // Ideal
  const idealPos = selectedCols.map((col, j) => {
    const vals = weighted.map(r => r[j]);
    return (criteriaTypes[col] || 'benefit') === 'benefit' ? Math.max(...vals) : Math.min(...vals);
  });
  const idealNeg = selectedCols.map((col, j) => {
    const vals = weighted.map(r => r[j]);
    return (criteriaTypes[col] || 'benefit') === 'benefit' ? Math.min(...vals) : Math.max(...vals);
  });

  // Distances
  const dPos = weighted.map(row => Math.sqrt(row.reduce((s, v, j) => s + (v - idealPos[j]) ** 2, 0)));
  const dNeg = weighted.map(row => Math.sqrt(row.reduce((s, v, j) => s + (v - idealNeg[j]) ** 2, 0)));

  // CC
  const scores = dPos.map((dp, i) => (dp + dNeg[i]) === 0 ? 0 : dNeg[i] / (dp + dNeg[i]));
  const ranked = labels.map((lbl, i) => ({ lbl, score: scores[i], dp: dPos[i], dn: dNeg[i] }))
    .sort((a, b) => b.score - a.score).map((item, ri) => ({ ...item, rank: ri + 1 }));

  // Ideal rows untuk tabel khusus
  const idealHeaderCols = selectedCols.map(col => {
    const type = criteriaTypes[col] || 'benefit';
    return `<th>${esc(col)}<br><span class="sub ${type === 'benefit' ? 'benefit' : 'cost'}">${type === 'benefit' ? '+B' : '−C'}</span></th>`;
  }).join('');
  const idealTable = `
    <table>
      <thead><tr><th>Solusi</th>${idealHeaderCols}</tr></thead>
      <tbody>
        <tr><td class="label-col benefit bold">A⁺ (Ideal Positif)</td>${idealPos.map(v => `<td class="num">${fmt(v)}</td>`).join('')}</tr>
        <tr><td class="label-col cost bold">A⁻ (Ideal Negatif)</td>${idealNeg.map(v => `<td class="num">${fmt(v)}</td>`).join('')}</tr>
      </tbody>
    </table>`;

  return [
    buildMatrixSection('2. Normalisasi Vektor (r)',
      'r<sub>ij</sub> = x<sub>ij</sub> / √(Σ x<sub>ij</sub>²)',
      labels, norm, selectedCols, criteriaTypes, weights),

    buildMatrixSection('3. Matriks Ternormalisasi Terbobot (v)',
      'v<sub>ij</sub> = w<sub>j</sub> × r<sub>ij</sub>',
      labels, weighted, selectedCols, criteriaTypes, weights),

    `<div class="section">
      <div class="section-title">4. Solusi Ideal Positif (A⁺) &amp; Negatif (A⁻)</div>
      <p class="section-desc">A⁺: MAX untuk Benefit, MIN untuk Cost &nbsp;|&nbsp; A⁻: sebaliknya</p>
      ${idealTable}
    </div>`,

    buildSimpleSection('5. Jarak Euclidean (D⁺ dan D⁻)',
      'D<sub>i</sub>⁺ = √Σ(v<sub>ij</sub> − A<sub>j</sub>⁺)² &nbsp;|&nbsp; D<sub>i</sub>⁻ = √Σ(v<sub>ij</sub> − A<sub>j</sub>⁻)²',
      ['Alternatif', 'D⁺ (ke ideal positif)', 'D⁻ (ke ideal negatif)'],
      labels.map((lbl, i) => [lbl, fmt(dPos[i]), fmt(dNeg[i])])),

    buildSimpleSection('6. Closeness Coefficient (CC)',
      'CC<sub>i</sub> = D<sub>i</sub>⁻ / (D<sub>i</sub>⁺ + D<sub>i</sub>⁻) &nbsp;|&nbsp; Mendekati 1 = terbaik',
      ['Rank', 'Alternatif', 'D⁺', 'D⁻', 'CC (Skor Akhir)'],
      ranked.map(item => [item.rank, item.lbl, fmt(item.dp), fmt(item.dn), fmt(item.score)])),
  ];
}


/* ──────────────────────────────────────────
   WASPAS — 4 section
────────────────────────────────────────── */
function calcSectionsWASPAS(labels, matrix, selectedCols, criteriaTypes, weights, lambda) {
  const m   = matrix.length;
  const n   = selectedCols.length;
  const lam = lambda ?? 0.5;

  const norm = matrix.map(r => r.slice());
  for (let j = 0; j < n; j++) {
    const vals = matrix.map(r => r[j]);
    const max  = Math.max(...vals);
    const min  = Math.min(...vals);
    const type = criteriaTypes[selectedCols[j]] || 'benefit';
    for (let i = 0; i < m; i++) {
      norm[i][j] = type === 'benefit'
        ? (max === 0 ? 0 : matrix[i][j] / max)
        : (matrix[i][j] === 0 ? 0 : min / matrix[i][j]);
    }
  }

  const wsm = norm.map((row, i) =>
    selectedCols.reduce((s, col, j) => s + (weights[col] || 0) * row[j], 0)
  );
  const wpm = norm.map((row, i) =>
    selectedCols.reduce((p, col, j) => p * (row[j] ** (weights[col] || 0)), 1)
  );
  const scores = wsm.map((w, i) => lam * w + (1 - lam) * wpm[i]);
  const ranked = labels.map((lbl, i) => ({ lbl, score: scores[i], wsm: wsm[i], wpm: wpm[i] }))
    .sort((a, b) => b.score - a.score).map((item, ri) => ({ ...item, rank: ri + 1 }));

  return [
    buildMatrixSection('2. Normalisasi Linear (r)',
      'Benefit: r = x / MAX(kolom) &nbsp;|&nbsp; Cost: r = MIN(kolom) / x',
      labels, norm, selectedCols, criteriaTypes, weights),

    buildSimpleSection('3. Weighted Sum Model (Q¹)',
      'Q<sub>i</sub>¹ = Σ w<sub>j</sub> × r<sub>ij</sub>',
      ['Alternatif', 'Q¹ (WSM Score)'],
      labels.map((lbl, i) => [lbl, fmt(wsm[i])])),

    buildSimpleSection('4. Weighted Product Model (Q²)',
      'Q<sub>i</sub>² = Π (r<sub>ij</sub>)<sup>w<sub>j</sub></sup>',
      ['Alternatif', 'Q² (WPM Score)'],
      labels.map((lbl, i) => [lbl, fmt(wpm[i])])),

    buildSimpleSection(`5. Skor Akhir WASPAS (λ = ${lam})`,
      `Q<sub>i</sub> = λ × Q¹ + (1−λ) × Q² &nbsp;|&nbsp; λ=${lam} → ${(lam*100).toFixed(0)}% WSM + ${((1-lam)*100).toFixed(0)}% WPM`,
      ['Rank', 'Alternatif', 'Q¹ (WSM)', 'Q² (WPM)', 'Skor Q'],
      ranked.map(item => [item.rank, item.lbl, fmt(item.wsm), fmt(item.wpm), fmt(item.score)])),
  ];
}


/* ──────────────────────────────────────────
   MOORA — 3 section
────────────────────────────────────────── */
function calcSectionsMOORA(labels, matrix, selectedCols, criteriaTypes, weights) {
  const m = matrix.length;
  const n = selectedCols.length;

  const norm = matrix.map(r => r.slice());
  for (let j = 0; j < n; j++) {
    const d = Math.sqrt(matrix.reduce((s, r) => s + r[j] ** 2, 0));
    for (let i = 0; i < m; i++) norm[i][j] = d === 0 ? 0 : matrix[i][j] / d;
  }

  const weighted = norm.map(row => row.map((v, j) => v * (weights[selectedCols[j]] || 0)));

  const scores = weighted.map(row =>
    selectedCols.reduce((s, col, j) =>
      (criteriaTypes[col] || 'benefit') === 'benefit' ? s + row[j] : s - row[j], 0)
  );
  const ranked = labels.map((lbl, i) => ({ lbl, score: scores[i] }))
    .sort((a, b) => b.score - a.score).map((item, ri) => ({ ...item, rank: ri + 1 }));

  return [
    buildMatrixSection('2. Normalisasi Vektor Rasio',
      'x*<sub>ij</sub> = x<sub>ij</sub> / √(Σ x<sub>ij</sub>²)',
      labels, norm, selectedCols, criteriaTypes, weights),

    buildMatrixSection('3. Matriks Ternormalisasi Terbobot',
      'w<sub>j</sub> × x*<sub>ij</sub>',
      labels, weighted, selectedCols, criteriaTypes, weights),

    buildSimpleSection('4. Skor Yi (Ratio System)',
      'Y<sub>i</sub> = Σ<sub>Benefit</sub>(w<sub>j</sub>×x*<sub>ij</sub>) − Σ<sub>Cost</sub>(w<sub>j</sub>×x*<sub>ij</sub>)',
      ['Rank', 'Alternatif', 'Skor Yi'],
      ranked.map(item => [item.rank, item.lbl, fmt(item.score)])),
  ];
}


/* ──────────────────────────────────────────
   EDAS — 4 section
────────────────────────────────────────── */
function calcSectionsEDAS(labels, matrix, selectedCols, criteriaTypes, weights) {
  const m = matrix.length;

  const avg = selectedCols.map((_, j) => matrix.reduce((s, r) => s + r[j], 0) / m);

  const PDA = matrix.map(row =>
    selectedCols.map((col, j) => {
      const type = criteriaTypes[col] || 'benefit';
      const diff = type === 'benefit' ? Math.max(0, row[j] - avg[j]) : Math.max(0, avg[j] - row[j]);
      return avg[j] === 0 ? 0 : diff / avg[j];
    })
  );
  const NDA = matrix.map(row =>
    selectedCols.map((col, j) => {
      const type = criteriaTypes[col] || 'benefit';
      const diff = type === 'benefit' ? Math.max(0, avg[j] - row[j]) : Math.max(0, row[j] - avg[j]);
      return avg[j] === 0 ? 0 : diff / avg[j];
    })
  );

  const SP   = PDA.map(row => selectedCols.reduce((s, col, j) => s + (weights[col] || 0) * row[j], 0));
  const SN   = NDA.map(row => selectedCols.reduce((s, col, j) => s + (weights[col] || 0) * row[j], 0));
  const mxSP = Math.max(...SP);
  const mxSN = Math.max(...SN);
  const NSP  = SP.map(v => mxSP === 0 ? 0 : v / mxSP);
  const NSN  = SN.map(v => mxSN === 0 ? 1 : 1 - v / mxSN);
  const scores = NSP.map((v, i) => 0.5 * (v + NSN[i]));
  const ranked = labels.map((lbl, i) => ({ lbl, score: scores[i], SP: SP[i], SN: SN[i], NSP: NSP[i], NSN: NSN[i] }))
    .sort((a, b) => b.score - a.score).map((item, ri) => ({ ...item, rank: ri + 1 }));

  // Avg solution row tambahan di bawah tabel dataset
  const avgRowHTML = `
    <table style="margin-top:8px">
      <thead><tr><th>Rata-rata Solusi (AV)</th>
        ${selectedCols.map(c => `<th>${esc(c)}</th>`).join('')}
      </tr></thead>
      <tbody><tr>
        <td class="label-col bold">AV</td>
        ${avg.map(v => `<td class="num">${fmt(v)}</td>`).join('')}
      </tr></tbody>
    </table>`;

  return [
    `<div class="section">
      <div class="section-title">2. Rata-rata Solusi (AV) &amp; PDA</div>
      <p class="section-desc">AV<sub>j</sub> = (1/n) × Σ x<sub>ij</sub> &nbsp;|&nbsp; PDA: Benefit: MAX(0, x−AV)/AV &nbsp;|&nbsp; Cost: MAX(0, AV−x)/AV</p>
      ${avgRowHTML}
      ${buildMatrixTableOnly(labels, PDA, selectedCols, criteriaTypes, weights)}
    </div>`,

    buildMatrixSection('3. Negative Distance from Average (NDA)',
      'Benefit: MAX(0, AV<sub>j</sub>−x<sub>ij</sub>)/AV<sub>j</sub> &nbsp;|&nbsp; Cost: MAX(0, x<sub>ij</sub>−AV<sub>j</sub>)/AV<sub>j</sub>',
      labels, NDA, selectedCols, criteriaTypes, weights),

    buildSimpleSection('4. Appraisal Score (AS)',
      'SP=Σ(w×PDA) | SN=Σ(w×NDA) | NSP=SP/max(SP) | NSN=1−SN/max(SN) | AS=0.5×(NSP+NSN)',
      ['Rank', 'Alternatif', 'SP', 'SN', 'NSP', 'NSN', 'AS'],
      ranked.map(item => [item.rank, item.lbl, fmt(item.SP), fmt(item.SN), fmt(item.NSP), fmt(item.NSN), fmt(item.score)])),
  ];
}


/* ══════════════════════════════════════════
   SECTION TERAKHIR — PERANGKINGAN FINAL
══════════════════════════════════════════ */
function buildSectionRanking(ranked, methodLabel) {
  const maxScore = ranked[0].score;

  const rows = ranked.map(item => {
    const pct      = maxScore > 0 ? (item.score / maxScore * 100).toFixed(1) : '0.0';
    const medalMap = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const medal    = medalMap[item.rank] || '';
    return `<tr class="${item.rank <= 3 ? 'top-row rank-' + item.rank : ''}">
      <td class="num bold">${item.rank}</td>
      <td class="label-col">${medal} ${esc(item.label)}</td>
      <td class="num bold">${fmt(item.score)}</td>
      <td class="num">${pct}%</td>
      <td>
        <div class="bar-wrap">
          <div class="bar-fill" style="width:${pct}%"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="section no-break">
    <div class="section-title">Hasil Perangkingan Final — ${esc(methodLabel)}</div>
    <p class="section-desc">Alternatif diurutkan dari skor tertinggi ke terendah. Persentil dihitung relatif terhadap skor terbaik.</p>
    <table>
      <thead><tr>
        <th>Rank</th><th>Alternatif</th><th>Skor Akhir</th><th>Persentil</th><th style="min-width:120px">Visual</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}


/* ══════════════════════════════════════════
   TABLE BUILDER HELPERS
══════════════════════════════════════════ */

/** Tabel matrix dengan header bertipe Benefit/Cost + bobot */
function buildMatrixSection(title, desc, labels, matrix, selectedCols, criteriaTypes, weights) {
  return `
  <div class="section">
    <div class="section-title">${title}</div>
    <p class="section-desc">${desc}</p>
    ${buildMatrixTableOnly(labels, matrix, selectedCols, criteriaTypes, weights)}
  </div>`;
}

function buildMatrixTableOnly(labels, matrix, selectedCols, criteriaTypes, weights) {
  const headerCols = selectedCols.map(col => {
    const type = criteriaTypes[col] || 'benefit';
    const w    = weights[col] || 0;
    return `<th>${esc(col)}<br>
      <span class="sub ${type === 'benefit' ? 'benefit' : 'cost'}">${type === 'benefit' ? '+B' : '−C'}</span>
      <span class="sub">${(w * 100).toFixed(1)}%</span>
    </th>`;
  }).join('');

  const bodyRows = labels.map((lbl, i) =>
    `<tr>
      <td class="label-col">${esc(lbl)}</td>
      ${matrix[i].map(v => `<td class="num">${fmt(v)}</td>`).join('')}
    </tr>`
  ).join('');

  return `<table>
    <thead><tr><th>Alternatif</th>${headerCols}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>`;
}

/** Tabel sederhana dengan kolom custom (untuk skor, jarak, ranking) */
function buildSimpleSection(title, desc, colHeaders, rows) {
  const thead = colHeaders.map((h, i) =>
    `<th class="${i > 0 ? 'num' : ''}">${h}</th>`
  ).join('');

  const tbody = rows.map(row =>
    `<tr>${row.map((cell, i) =>
      `<td class="${i > 0 ? 'num' : 'label-col'}">${typeof cell === 'number' ? fmt(cell) : esc(String(cell))}</td>`
    ).join('')}</tr>`
  ).join('');

  return `
  <div class="section">
    <div class="section-title">${title}</div>
    <p class="section-desc">${desc}</p>
    <table>
      <thead><tr>${thead}</tr></thead>
      <tbody>${tbody}</tbody>
    </table>
  </div>`;
}


/* ══════════════════════════════════════════
   CSS UNTUK HALAMAN PRINT
══════════════════════════════════════════ */
function getPrintCSS() {
  return `
    /* Reset & Base */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #1a1917;
      background: #fff;
    }

    .print-wrap {
      max-width: 960px;
      margin: 0 auto;
      padding: 20px 24px 40px;
    }

    /* Document header */
    .doc-header {
      text-align: center;
      padding-bottom: 14px;
      margin-bottom: 16px;
      border-bottom: 2px solid #1a1917;
    }
    .doc-title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #1a1917;
    }
    .doc-subtitle {
      font-size: 11px;
      color: #666;
      margin-top: 3px;
    }

    /* Meta row */
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 16px;
      padding: 10px 14px;
      background: #f4f2ed;
      border-radius: 6px;
      margin-bottom: 16px;
    }
    .meta-item { display: flex; align-items: center; gap: 5px; }
    .meta-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; font-weight: 600; }
    .meta-val   { font-size: 11px; font-weight: 500; color: #1a1917; }
    .meta-val.bold { font-weight: 700; }

    /* Section */
    .section {
      margin-bottom: 28px;
      page-break-inside: auto;
    }
    .no-break { page-break-inside: avoid; }

    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #1a1917;
      margin-bottom: 4px;
      padding-bottom: 5px;
      border-bottom: 1px solid #ddd;
    }
    .section-desc {
      font-size: 10px;
      color: #666;
      margin-bottom: 8px;
      font-style: italic;
    }

    /* Table */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    th {
      background: #eceae4;
      color: #1a1917;
      font-weight: 700;
      padding: 6px 8px;
      text-align: center;
      border: 1px solid #ccc;
      font-size: 9px;
      letter-spacing: 0.02em;
      vertical-align: bottom;
    }
    td {
      padding: 5px 8px;
      border: 1px solid #ddd;
      color: #333;
      vertical-align: middle;
    }
    tr:nth-child(even) td { background: #fafaf8; }
    tr:hover td { background: #f0ede6; }

    /* Cell types */
    .num        { text-align: right; font-variant-numeric: tabular-nums; font-family: monospace; font-size: 10px; }
    .label-col  { text-align: left; font-weight: 500; color: #1a1917; }
    .bold       { font-weight: 700; }
    .benefit    { color: #0a7a4a; }
    .cost       { color: #d4570a; }
    .sub        { display: inline-block; font-size: 8px; margin-left: 3px; opacity: 0.75; }

    /* Top 3 ranking rows */
    .rank-1 td { background: #fef9e7 !important; }
    .rank-2 td { background: #f9fafb !important; }
    .rank-3 td { background: #fdf6ee !important; }
    .top-row td { font-weight: 600; }

    /* Bar chart inline */
    .bar-wrap {
      width: 100%;
      height: 8px;
      background: #eee;
      border-radius: 4px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      background: #0a7a4a;
      border-radius: 4px;
      min-width: 2px;
    }

    /* Print media */
    @media print {
      body { font-size: 10px; }
      .print-wrap { padding: 0; max-width: 100%; }
      .section { page-break-inside: auto; }
      .no-break { page-break-inside: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
      thead { display: table-header-group; }
    }
  `;
}


/* ══════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════ */
if (typeof fmt !== 'function') {
  /* eslint-disable no-var */
  var fmt = function fmt(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    const n = parseFloat(v);
    if (Math.abs(n) < 0.0001 && n !== 0) return n.toExponential(3);
    return n.toFixed(4);
  };
}
 
if (typeof esc !== 'function') {
  var esc = function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
}
 
if (typeof cap !== 'function') {
  var cap = function cap(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
}