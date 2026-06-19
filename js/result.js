/* ============================================
   SPK WEB APP — result.js
   Result page: reads sessionStorage, renders
   ranking, charts, step-by-step calculation,
   matrix view, and export.

   Dependensi (dimuat sebelum file ini):
   - js/core/spk-*.js
   - js/core/calculation-engine.js  → runSPK()
   - js/app.js                      → window.Toast
   - lib/export-xlsx.js             → exportXLSX()
   - lib/export-xlsx-plain.js       → exportXLSXPlain()
   - lib/print-preview.js           → printPreview()
   ============================================ */

   'use strict';

   /* ──────────────────────────────────────────
      LOAD STATE
   ────────────────────────────────────────── */
   let R = null;
   
   (function init() {
     try {
       const raw = sessionStorage.getItem('spk_result');
       if (!raw) { showNoData(); return; }
       R = JSON.parse(raw);
       if (!R || !R.result || !R.result.ranked) { showNoData(); return; }
     } catch (e) {
       showNoData(); return;
     }
     renderPage();
   })();
   
   function showNoData() {
     document.getElementById('noDataState').style.display  = 'block';
     document.getElementById('resultContent').style.display = 'none';
   }
   
   /* ──────────────────────────────────────────
      MAIN RENDER
   ────────────────────────────────────────── */
   function renderPage() {
     document.getElementById('noDataState').style.display  = 'none';
     document.getElementById('resultContent').style.display = 'block';
   
     const { method, weightMethod, selectedCols, result, rawData,
             compareAll, showSteps } = R;
     const ranked      = result.ranked;
     const methodLabel = getMethodLabel(method);
     const rows        = rawData ? rawData.length - 1 : ranked.length;
   
     // Page description
     setEl('resultPageDesc',
       `Metode ${methodLabel} · ${rows} Alternatif · ${selectedCols.length} Kriteria · Bobot ${cap(weightMethod)}`
     );
   
     renderMetaBadges(method, weightMethod, rows, selectedCols.length);
     renderStatCards(ranked);
     renderRankingTab(ranked, method);
     renderChart(ranked, method);
   
     if (showSteps !== false) {
       renderSteps(method);
     } else {
       const btn = document.getElementById('tabStepsBtn');
       if (btn) btn.style.display = 'none';
     }
   
     renderMatrixTab();
   
     if (compareAll) {
       const btn = document.getElementById('tabCompareBtn');
       if (btn) btn.style.display = 'inline-flex';
       renderCompareTab();
     }
   
     initTabs();
     initExportMenu();
   
     document.getElementById('btnBackToInput') &&
       document.getElementById('btnBackToInput').addEventListener('click', () => {
         window.location.href = 'input.html';
       });
   
     requestAnimationFrame(() => setTimeout(animateBars, 100));
   }
   
   /* ──────────────────────────────────────────
      TAB SWITCHING
   ────────────────────────────────────────── */
   function initTabs() {
     document.querySelectorAll('.result-tab').forEach(tab => {
       tab.addEventListener('click', () => {
         document.querySelectorAll('.result-tab').forEach(t => t.classList.remove('active'));
         document.querySelectorAll('.result-tab-panel').forEach(p => p.style.display = 'none');
         tab.classList.add('active');
         const target = document.getElementById('tab' + cap(tab.dataset.tab));
         if (target) target.style.display = 'block';
       });
     });
   }
   
   /* ──────────────────────────────────────────
      META BADGES
   ────────────────────────────────────────── */
   function renderMetaBadges(method, weightMethod, rows, cols) {
     const container = document.getElementById('resultMetaRow');
     if (!container) return;
   
     const badges = [
       { label: 'Metode',      value: getMethodLabel(method) },
       { label: 'Pembobotan',  value: cap(weightMethod) },
       { label: 'Alternatif',  value: rows },
       { label: 'Kriteria',    value: cols },
     ];
   
     if (method === 'waspas') {
       badges.push({ label: 'Lambda (λ)', value: R.lambda });
     }
   
     const src = R.dataSource === 'file'   ? R.fileName
               : R.dataSource === 'sample' ? `Contoh (${R.fileName})`
               : 'Manual';
     badges.push({ label: 'Sumber', value: src });
   
     container.innerHTML = badges.map(b => `
       <div class="meta-badge">
         <span class="meta-badge-label">${escHtml(String(b.label))}:</span>
         <span class="meta-badge-value">${escHtml(String(b.value))}</span>
       </div>`).join('');
   }
   
   /* ──────────────────────────────────────────
      STAT CARDS
   ────────────────────────────────────────── */
   function renderStatCards(ranked) {
     const container = document.getElementById('resultStatCards');
     if (!container) return;
   
     const scores = ranked.map(r => r.score);
     const best   = ranked[0];
     const worst  = ranked[ranked.length - 1];
     const range  = Math.max(...scores) - Math.min(...scores);
   
     const cards = [
       { icon: '🥇', value: best.label,    label: 'Alternatif Terbaik' },
       { icon: '📈', value: fmt(best.score),  label: 'Skor Tertinggi' },
       { icon: '📉', value: fmt(worst.score), label: 'Skor Terendah' },
       { icon: '⚡', value: fmt(range),       label: 'Rentang Skor' },
     ];
   
     container.innerHTML = cards.map(c => `
       <div class="result-stat-card">
         <div class="result-stat-icon">${c.icon}</div>
         <div class="result-stat-body">
           <div class="result-stat-value" title="${escHtml(c.value)}">${escHtml(String(c.value))}</div>
           <div class="result-stat-label">${c.label}</div>
         </div>
       </div>`).join('');
   }
   
   /* ──────────────────────────────────────────
      RANKING TAB
   ────────────────────────────────────────── */
   function renderRankingTab(ranked, method) {
     renderPodium(ranked);
     renderRankingTable(ranked, method);
   }
   
   function renderPodium(ranked) {
     const wrap = document.getElementById('podiumWrap');
     if (!wrap) return;
   
     const top3     = ranked.slice(0, Math.min(3, ranked.length));
     const maxScore = ranked[0].score;
   
     if (top3.length < 2) { wrap.style.display = 'none'; return; }
   
     wrap.innerHTML = top3.map(item => {
       const pct = maxScore > 0 ? (item.score / maxScore * 100) : 100;
       return `
         <div class="podium-card rank-${item.rank}">
           <div class="podium-rank-badge">${item.rank}</div>
           <div class="podium-label" title="${escHtml(item.label)}">${escHtml(item.label)}</div>
           <div class="podium-score">${fmt(item.score)}</div>
           <div class="podium-score-label">Skor Akhir</div>
           <div class="podium-bar-wrap">
             <div class="podium-bar" data-width="${pct}" style="width:0%"></div>
           </div>
         </div>`;
     }).join('');
   }
   
   function renderRankingTable(ranked, method) {
     const thead = document.getElementById('rankingThead');
     const tbody = document.getElementById('rankingTbody');
     if (!thead || !tbody) return;
   
     const maxScore = ranked[0].score;
   
     thead.innerHTML = `<tr>
       <th class="col-rank">Rank</th>
       <th>Alternatif</th>
       <th style="min-width:180px">Skor Akhir</th>
       <th>Persentil</th>
     </tr>`;
   
     tbody.innerHTML = ranked.map(item => {
       const pct            = maxScore > 0 ? (item.score / maxScore * 100) : 100;
       const rankBadgeClass = item.rank <= 3 ? `rank-badge-${item.rank}` : 'rank-badge-n';
       return `<tr>
         <td class="col-rank">
           <span class="rank-badge ${rankBadgeClass}">${item.rank}</span>
         </td>
         <td style="font-weight:500;color:var(--text-primary)">${escHtml(item.label)}</td>
         <td>
           <div class="score-bar-cell method-score-bar-${method}">
             <div class="score-bar-track">
               <div class="score-bar-fill" data-width="${pct}" style="width:0%"></div>
             </div>
             <span class="score-text">${fmt(item.score)}</span>
           </div>
         </td>
         <td style="color:var(--text-muted);font-size:0.82rem">${pct.toFixed(1)}%</td>
       </tr>`;
     }).join('');
   
     setEl('rankingTableSubtitle',
       `${ranked.length} alternatif diurutkan berdasarkan skor ${R.method.toUpperCase()}.`);
   }
   
   /* ──────────────────────────────────────────
      CHART TAB
   ────────────────────────────────────────── */
   function renderChart(ranked, method) {
     const wrap = document.getElementById('chartWrap');
     if (!wrap) return;
   
     const maxScore = ranked[0].score;
     const METHOD_COLORS = {
       saw:    'var(--saw)',
       topsis: 'var(--topsis)',
       waspas: 'var(--waspas)',
       moora:  'var(--moora)',
       edas:   'var(--edas)',
     };
     const color = METHOD_COLORS[method] || 'var(--topsis)';
   
     wrap.innerHTML = `<div class="bar-chart">` +
       [...ranked].sort((a, b) => a.rank - b.rank).map(item => {
         const pct            = maxScore > 0 ? (item.score / maxScore * 100) : 100;
         const rankBadgeClass = item.rank <= 3 ? `rank-badge-${item.rank}` : 'rank-badge-n';
         return `<div class="bar-chart-row">
           <div class="bar-chart-label" title="${escHtml(item.label)}">${escHtml(item.label)}</div>
           <div class="bar-chart-track">
             <div class="bar-chart-fill" data-width="${pct}" style="width:0%;background:${color}">
               <span class="bar-chart-fill-label">${fmt(item.score)}</span>
             </div>
           </div>
           <div class="bar-chart-rank rank-badge ${rankBadgeClass}">${item.rank}</div>
         </div>`;
       }).join('') +
     `</div>`;
   }
   
   /* ──────────────────────────────────────────
      STEPS TAB
   ────────────────────────────────────────── */
   function renderSteps(method) {
     const container = document.getElementById('stepsContent');
     if (!container) return;
   
     const stepBuilders = {
       saw:    buildStepsSAW,
       topsis: buildStepsTOPSIS,
       waspas: buildStepsWASPAS,
       moora:  buildStepsMOORA,
       edas:   buildStepsEDAS,
     };
   
     const builder = stepBuilders[method];
     if (!builder) {
       container.innerHTML = '<div class="panel"><p style="color:var(--text-muted);padding:20px">Langkah perhitungan tidak tersedia untuk metode ini.</p></div>';
       return;
     }
   
     const steps = builder();
     container.innerHTML = `<div class="steps-content">
       ${steps.map((s, i) => buildStepBlock(i + 1, s)).join('')}
     </div>`;
   
     // Accordion — step pertama terbuka
     container.querySelectorAll('.step-section-header').forEach(header => {
       header.addEventListener('click', () => {
         const body   = header.nextElementSibling;
         const isOpen = header.classList.contains('open');
         header.classList.toggle('open', !isOpen);
         if (body) body.style.display = isOpen ? 'none' : 'block';
       });
       if (header.dataset.stepIdx === '0') {
         header.classList.add('open');
         const body = header.nextElementSibling;
         if (body) body.style.display = 'block';
       }
     });
   }
   
   function buildStepBlock(num, step) {
     return `
       <div class="step-section">
         <div class="step-section-header" data-step-idx="${num - 1}">
           <div class="step-section-left">
             <div class="step-section-num">${num}</div>
             <div>
               <div class="step-section-title">${step.title}</div>
               ${step.desc ? `<div class="step-section-desc">${step.desc}</div>` : ''}
             </div>
           </div>
           <svg class="step-section-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
         </div>
         <div class="step-section-body" style="display:none;">
           ${step.formula   ? `<div class="step-formula-box">${step.formula}</div>` : ''}
           ${step.tableHtml || ''}
           ${step.note      ? `<div class="step-note"><span>💡</span><span>${step.note}</span></div>` : ''}
         </div>
       </div>`;
   }
   
   /* ── Step data builders ── */
   function getStepBaseData() {
     const { selectedCols, criteriaTypes, weights, rawData, labelCol } = R;
     const headers  = rawData[0];
     const rows     = rawData.slice(1);
     const labelIdx = headers.indexOf(labelCol);
     const labels   = rows.map((r, i) => labelIdx >= 0 ? r[labelIdx] : `A${i + 1}`);
     const matrix   = rows.map(row =>
       selectedCols.map(col => parseFloat(row[headers.indexOf(col)]) || 0)
     );
     return { labels, matrix, headers, rows };
   }
   
   function buildStepsSAW() {
     const { selectedCols, criteriaTypes, weights } = R;
     const { labels, matrix } = getStepBaseData();
     const m = matrix.length;
     const n = selectedCols.length;
   
     const normalized = matrix.map(r => r.slice());
     for (let j = 0; j < n; j++) {
       const vals = matrix.map(r => r[j]);
       const max  = Math.max(...vals);
       const min  = Math.min(...vals);
       const type = criteriaTypes[selectedCols[j]] || 'benefit';
       for (let i = 0; i < m; i++) {
         normalized[i][j] = type === 'benefit'
           ? (max === 0 ? 0 : matrix[i][j] / max)
           : (matrix[i][j] === 0 ? 0 : min / matrix[i][j]);
       }
     }
   
     const scores = normalized.map((row, i) =>
       selectedCols.reduce((s, col, j) => s + (weights[col] || 0) * row[j], 0)
     );
   
     return [
       {
         title: 'Matriks Keputusan Awal (X)',
         desc:  'Data nilai setiap alternatif pada setiap kriteria.',
         formula: `X<sub>ij</sub> = nilai alternatif ke-i pada kriteria ke-j`,
         tableHtml: buildMatrixTableHtml(labels, selectedCols, matrix, criteriaTypes, weights),
       },
       {
         title: 'Normalisasi Matriks (r)',
         desc:  'Normalisasi linear: benefit = x/max, cost = min/x.',
         formula: `r<sub>ij</sub> = X<sub>ij</sub> / max(X<sub>j</sub>) &nbsp;[Benefit]<br>r<sub>ij</sub> = min(X<sub>j</sub>) / X<sub>ij</sub> &nbsp;[Cost]`,
         tableHtml: buildMatrixTableHtml(labels, selectedCols, normalized, criteriaTypes, weights, true),
       },
       {
         title: 'Penjumlahan Terbobot (V)',
         desc:  'Skor akhir = penjumlahan nilai ternormalisasi × bobot.',
         formula: `V<sub>i</sub> = Σ w<sub>j</sub> × r<sub>ij</sub>`,
         tableHtml: buildFinalScoreTable(labels, scores),
         note: 'Alternatif dengan skor V tertinggi adalah yang terbaik.',
       },
     ];
   }
   
   function buildStepsTOPSIS() {
     const { selectedCols, criteriaTypes, weights } = R;
     const { labels, matrix } = getStepBaseData();
     const m = matrix.length;
     const n = selectedCols.length;
   
     const norm = matrix.map(r => r.slice());
     for (let j = 0; j < n; j++) {
       const d = Math.sqrt(matrix.reduce((s, r) => s + r[j] ** 2, 0));
       for (let i = 0; i < m; i++) norm[i][j] = d === 0 ? 0 : matrix[i][j] / d;
     }
   
     const weighted = norm.map(row => row.map((v, j) => v * (weights[selectedCols[j]] || 0)));
   
     const idealPos = selectedCols.map((col, j) => {
       const vals = weighted.map(r => r[j]);
       return (criteriaTypes[col] || 'benefit') === 'benefit' ? Math.max(...vals) : Math.min(...vals);
     });
     const idealNeg = selectedCols.map((col, j) => {
       const vals = weighted.map(r => r[j]);
       return (criteriaTypes[col] || 'benefit') === 'benefit' ? Math.min(...vals) : Math.max(...vals);
     });
   
     const dPos = weighted.map(row =>
       Math.sqrt(row.reduce((s, v, j) => s + (v - idealPos[j]) ** 2, 0))
     );
     const dNeg = weighted.map(row =>
       Math.sqrt(row.reduce((s, v, j) => s + (v - idealNeg[j]) ** 2, 0))
     );
   
     const scores = dPos.map((dp, i) => (dp + dNeg[i]) === 0 ? 0 : dNeg[i] / (dp + dNeg[i]));
   
     return [
       {
         title: 'Matriks Keputusan Awal',
         tableHtml: buildMatrixTableHtml(labels, selectedCols, matrix, criteriaTypes, weights),
       },
       {
         title:   'Normalisasi Vektor (r)',
         desc:    'Normalisasi menggunakan panjang vektor Euclidean.',
         formula: `r<sub>ij</sub> = X<sub>ij</sub> / √(Σ X<sub>ij</sub><sup>2</sup>)`,
         tableHtml: buildMatrixTableHtml(labels, selectedCols, norm, criteriaTypes, weights, true),
       },
       {
         title:   'Matriks Ternormalisasi Terbobot (v)',
         desc:    'Setiap nilai dikalikan bobotnya.',
         formula: `v<sub>ij</sub> = w<sub>j</sub> × r<sub>ij</sub>`,
         tableHtml: buildMatrixTableHtml(labels, selectedCols, weighted, criteriaTypes, weights, true),
       },
       {
         title:   'Solusi Ideal Positif (A⁺) &amp; Negatif (A⁻)',
         desc:    'Nilai terbaik dan terburuk dari tiap kriteria.',
         formula: `A<sup>+</sup> = { max v<sub>ij</sub> untuk Benefit, min v<sub>ij</sub> untuk Cost }<br>A<sup>−</sup> = { min v<sub>ij</sub> untuk Benefit, max v<sub>ij</sub> untuk Cost }`,
         tableHtml: buildIdealTable(selectedCols, idealPos, idealNeg, criteriaTypes),
       },
       {
         title:   'Jarak ke Solusi Ideal (D⁺ dan D⁻)',
         desc:    'Jarak Euclidean setiap alternatif dari solusi ideal.',
         formula: `D<sub>i</sub><sup>+</sup> = √(Σ (v<sub>ij</sub> − A<sub>j</sub><sup>+</sup>)²)<br>D<sub>i</sub><sup>−</sup> = √(Σ (v<sub>ij</sub> − A<sub>j</sub><sup>−</sup>)²)`,
         tableHtml: buildDistanceTable(labels, dPos, dNeg),
       },
       {
         title:   'Closeness Coefficient (CC)',
         desc:    'Skor akhir menunjukkan kedekatan relatif terhadap solusi ideal.',
         formula: `CC<sub>i</sub> = D<sub>i</sub><sup>−</sup> / (D<sub>i</sub><sup>+</sup> + D<sub>i</sub><sup>−</sup>)`,
         tableHtml: buildFinalScoreTable(labels, scores),
         note: 'Alternatif dengan CC tertinggi (mendekati 1) adalah yang terbaik.',
       },
     ];
   }
   
   function buildStepsWASPAS() {
     const { selectedCols, criteriaTypes, weights, lambda } = R;
     const { labels, matrix } = getStepBaseData();
     const m   = matrix.length;
     const n   = selectedCols.length;
     const lam = lambda ?? 0.5;
   
     const normalized = matrix.map(r => r.slice());
     for (let j = 0; j < n; j++) {
       const vals = matrix.map(r => r[j]);
       const max  = Math.max(...vals);
       const min  = Math.min(...vals);
       const type = criteriaTypes[selectedCols[j]] || 'benefit';
       for (let i = 0; i < m; i++) {
         normalized[i][j] = type === 'benefit'
           ? (max === 0 ? 0 : matrix[i][j] / max)
           : (matrix[i][j] === 0 ? 0 : min / matrix[i][j]);
       }
     }
   
     const wsm = normalized.map(row =>
       selectedCols.reduce((s, col, j) => s + (weights[col] || 0) * row[j], 0)
     );
     const wpm = normalized.map(row =>
       selectedCols.reduce((p, col, j) => p * (row[j] ** (weights[col] || 0)), 1)
     );
     const scores = wsm.map((w, i) => lam * w + (1 - lam) * wpm[i]);
   
     const wsmWpmRows = labels.map((lbl, i) => `<tr>
       <td style="font-weight:500;color:var(--text-primary)">${escHtml(lbl)}</td>
       <td>${fmt(wsm[i])}</td>
       <td>${fmt(wpm[i])}</td>
       <td style="font-weight:700;color:var(--text-primary)">${fmt(scores[i])}</td>
     </tr>`).join('');
   
     return [
       {
         title: 'Matriks Keputusan &amp; Normalisasi',
         desc:  'Normalisasi linear sama seperti SAW.',
         formula: `r<sub>ij</sub> = X<sub>ij</sub>/max(X<sub>j</sub>) [Benefit] &nbsp;|&nbsp; r<sub>ij</sub> = min(X<sub>j</sub>)/X<sub>ij</sub> [Cost]`,
         tableHtml: buildMatrixTableHtml(labels, selectedCols, normalized, criteriaTypes, weights, true),
       },
       {
         title:   'Weighted Sum Model (WSM)',
         desc:    'Komponen pertama WASPAS: penjumlahan terbobot.',
         formula: `Q<sub>i</sub><sup>(1)</sup> = Σ w<sub>j</sub> × r<sub>ij</sub>`,
         tableHtml: buildSingleScoreTable(labels, wsm, 'WSM Score'),
       },
       {
         title:   'Weighted Product Model (WPM)',
         desc:    'Komponen kedua WASPAS: perkalian terbobot.',
         formula: `Q<sub>i</sub><sup>(2)</sup> = Π (r<sub>ij</sub>)<sup>w<sub>j</sub></sup>`,
         tableHtml: buildSingleScoreTable(labels, wpm, 'WPM Score'),
       },
       {
         title:   `Skor Akhir WASPAS (λ = ${lam})`,
         desc:    'Kombinasi WSM dan WPM dengan parameter lambda.',
         formula: `Q<sub>i</sub> = λ × Q<sub>i</sub><sup>(1)</sup> + (1−λ) × Q<sub>i</sub><sup>(2)</sup>`,
         tableHtml: `<div class="table-container" style="margin-top:12px;">
           <table class="data-table compact">
             <thead><tr>
               <th>Alternatif</th><th>WSM (Q¹)</th><th>WPM (Q²)</th><th>Skor Akhir (Q)</th>
             </tr></thead>
             <tbody>${wsmWpmRows}</tbody>
           </table></div>`,
         note: `Lambda λ=${lam} artinya ${(lam * 100).toFixed(0)}% dari WSM dan ${((1 - lam) * 100).toFixed(0)}% dari WPM.`,
       },
     ];
   }
   
   function buildStepsMOORA() {
     const { selectedCols, criteriaTypes, weights } = R;
     const { labels, matrix } = getStepBaseData();
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
   
     return [
       {
         title: 'Matriks Keputusan Awal',
         tableHtml: buildMatrixTableHtml(labels, selectedCols, matrix, criteriaTypes, weights),
       },
       {
         title:   'Normalisasi Vektor Rasio',
         desc:    'Normalisasi menggunakan norma Euclidean dari tiap kolom.',
         formula: `x*<sub>ij</sub> = x<sub>ij</sub> / √(Σ x<sub>ij</sub><sup>2</sup>)`,
         tableHtml: buildMatrixTableHtml(labels, selectedCols, norm, criteriaTypes, weights, true),
       },
       {
         title:   'Matriks Ternormalisasi Terbobot',
         desc:    'Setiap nilai dikalikan bobotnya.',
         formula: `w<sub>j</sub> × x*<sub>ij</sub>`,
         tableHtml: buildMatrixTableHtml(labels, selectedCols, weighted, criteriaTypes, weights, true),
       },
       {
         title:   'Perhitungan Yi (Skor Ratio System)',
         desc:    'Jumlahkan kolom benefit, kurangkan kolom cost.',
         formula: `Y<sub>i</sub> = Σ<sub>Benefit</sub>(w<sub>j</sub>x*<sub>ij</sub>) − Σ<sub>Cost</sub>(w<sub>j</sub>x*<sub>ij</sub>)`,
         tableHtml: buildFinalScoreTable(labels, scores),
         note: 'Alternatif dengan Yi tertinggi adalah yang terbaik.',
       },
     ];
   }
   
   function buildStepsEDAS() {
     const { selectedCols, criteriaTypes, weights } = R;
     const { labels, matrix } = getStepBaseData();
     const m = matrix.length;
   
     const avgSol = selectedCols.map((_, j) => matrix.reduce((s, r) => s + r[j], 0) / m);
   
     const PDA = matrix.map(row =>
       selectedCols.map((col, j) => {
         const type = criteriaTypes[col] || 'benefit';
         const diff = type === 'benefit'
           ? Math.max(0, row[j] - avgSol[j])
           : Math.max(0, avgSol[j] - row[j]);
         return avgSol[j] === 0 ? 0 : diff / avgSol[j];
       })
     );
     const NDA = matrix.map(row =>
       selectedCols.map((col, j) => {
         const type = criteriaTypes[col] || 'benefit';
         const diff = type === 'benefit'
           ? Math.max(0, avgSol[j] - row[j])
           : Math.max(0, row[j] - avgSol[j]);
         return avgSol[j] === 0 ? 0 : diff / avgSol[j];
       })
     );
   
     const SP   = PDA.map(row => selectedCols.reduce((s, col, j) => s + (weights[col] || 0) * row[j], 0));
     const SN   = NDA.map(row => selectedCols.reduce((s, col, j) => s + (weights[col] || 0) * row[j], 0));
     const mxSP = Math.max(...SP);
     const mxSN = Math.max(...SN);
     const NSP  = SP.map(v => mxSP === 0 ? 0 : v / mxSP);
     const NSN  = SN.map(v => mxSN === 0 ? 1 : 1 - v / mxSN);
     const scores = NSP.map((v, i) => 0.5 * (v + NSN[i]));
   
     const avgHtml = `<div class="table-container" style="margin-top:12px;">
       <table class="data-table compact">
         <thead><tr><th>Kriteria</th>${selectedCols.map(c => `<th>${escHtml(c)}</th>`).join('')}</tr></thead>
         <tbody><tr><td style="font-weight:600">Rata-rata (AV)</td>
           ${avgSol.map(v => `<td>${fmt(v)}</td>`).join('')}
         </tr></tbody>
       </table></div>`;
   
     const finalRows = labels.map((lbl, i) => `<tr>
       <td style="font-weight:500;color:var(--text-primary)">${escHtml(lbl)}</td>
       <td>${fmt(SP[i])}</td><td>${fmt(SN[i])}</td>
       <td>${fmt(NSP[i])}</td><td>${fmt(NSN[i])}</td>
       <td style="font-weight:700;color:var(--text-primary)">${fmt(scores[i])}</td>
     </tr>`).join('');
   
     return [
       {
         title:   'Matriks Keputusan &amp; Solusi Rata-rata (AV)',
         desc:    'Hitung nilai rata-rata tiap kriteria sebagai solusi referensi.',
         formula: `AV<sub>j</sub> = (1/n) × Σ x<sub>ij</sub>`,
         tableHtml: buildMatrixTableHtml(labels, selectedCols, matrix, criteriaTypes, weights) + avgHtml,
       },
       {
         title:   'Positive Distance from Average (PDA)',
         desc:    'Seberapa jauh alternatif lebih baik dari rata-rata.',
         formula: `PDA<sub>ij</sub> = max(0, x<sub>ij</sub>−AV<sub>j</sub>) / AV<sub>j</sub> [Benefit]<br>PDA<sub>ij</sub> = max(0, AV<sub>j</sub>−x<sub>ij</sub>) / AV<sub>j</sub> [Cost]`,
         tableHtml: buildMatrixTableHtml(labels, selectedCols, PDA, criteriaTypes, weights, true),
       },
       {
         title:   'Negative Distance from Average (NDA)',
         desc:    'Seberapa jauh alternatif lebih buruk dari rata-rata.',
         formula: `NDA<sub>ij</sub> = max(0, AV<sub>j</sub>−x<sub>ij</sub>) / AV<sub>j</sub> [Benefit]<br>NDA<sub>ij</sub> = max(0, x<sub>ij</sub>−AV<sub>j</sub>) / AV<sub>j</sub> [Cost]`,
         tableHtml: buildMatrixTableHtml(labels, selectedCols, NDA, criteriaTypes, weights, true),
       },
       {
         title:   'Appraisal Score (AS)',
         desc:    'Gabungkan SP/SN yang ternormalisasi menjadi appraisal score.',
         formula: `SP<sub>i</sub> = Σ w<sub>j</sub>×PDA<sub>ij</sub> &nbsp;|&nbsp; SN<sub>i</sub> = Σ w<sub>j</sub>×NDA<sub>ij</sub><br>NSP<sub>i</sub> = SP<sub>i</sub>/max(SP) &nbsp;|&nbsp; NSN<sub>i</sub> = 1−SN<sub>i</sub>/max(SN)<br>AS<sub>i</sub> = 0.5×(NSP<sub>i</sub> + NSN<sub>i</sub>)`,
         tableHtml: `<div class="table-container" style="margin-top:12px;">
           <table class="data-table compact">
             <thead><tr>
               <th>Alternatif</th><th>SP</th><th>SN</th><th>NSP</th><th>NSN</th><th>AS (Skor)</th>
             </tr></thead>
             <tbody>${finalRows}</tbody>
           </table></div>`,
         note: 'Alternatif dengan AS tertinggi (mendekati 1) adalah yang terbaik.',
       },
     ];
   }
   
   /* ──────────────────────────────────────────
      TABLE BUILDERS (dipakai steps)
   ────────────────────────────────────────── */
   function buildMatrixTableHtml(labels, cols, matrix, criteriaTypes, weights) {
     const headerCols = cols.map(c => {
       const type = criteriaTypes[c] || 'benefit';
       const w    = weights[c] || 0;
       return `<th>
         <div>${escHtml(c)}</div>
         <div style="display:flex;gap:4px;margin-top:3px;justify-content:center;flex-wrap:wrap;">
           <span class="weight-input-type ${type}"
             style="font-size:0.62rem;padding:1px 5px;border-radius:999px;font-weight:700;">
             ${type === 'benefit' ? '+B' : '-C'}
           </span>
           <span style="font-size:0.65rem;color:var(--text-muted)">${(w * 100).toFixed(1)}%</span>
         </div>
       </th>`;
     }).join('');
   
     const bodyRows = labels.map((lbl, i) =>
       `<tr>
         <td style="font-weight:500;color:var(--text-primary)">${escHtml(lbl)}</td>
         ${matrix[i].map(v => `<td>${fmt(v)}</td>`).join('')}
       </tr>`
     ).join('');
   
     return `<div class="table-container" style="margin-top:12px;">
       <table class="data-table compact">
         <thead><tr><th>Alternatif</th>${headerCols}</tr></thead>
         <tbody>${bodyRows}</tbody>
       </table></div>`;
   }
   
   function buildFinalScoreTable(labels, scores) {
     const ranked = [...R.result.ranked];
     const rankMap = {};
     ranked.forEach(r => { rankMap[r.label] = r.rank; });
     const maxScore = Math.max(...scores);
   
     const sorted = labels
       .map((lbl, i) => ({ lbl, score: scores[i], rank: rankMap[lbl] || 99 }))
       .sort((a, b) => a.rank - b.rank);
   
     const rows = sorted.map(({ lbl, score, rank }) => {
       const rankBadge = rank <= 3 ? `rank-badge-${rank}` : 'rank-badge-n';
       const pct       = maxScore > 0 ? (score / maxScore * 100) : 0;
       return `<tr>
         <td><span class="rank-badge ${rankBadge}">${rank}</span></td>
         <td style="font-weight:500;color:var(--text-primary)">${escHtml(lbl)}</td>
         <td style="font-family:'Syne',sans-serif;font-weight:700">${fmt(score)}</td>
         <td><div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
           <div style="height:100%;border-radius:3px;background:var(--topsis);width:${pct.toFixed(1)}%"></div>
         </div></td>
       </tr>`;
     }).join('');
   
     return `<div class="table-container" style="margin-top:12px;">
       <table class="data-table compact">
         <thead><tr><th>Rank</th><th>Alternatif</th><th>Skor</th><th>Visual</th></tr></thead>
         <tbody>${rows}</tbody>
       </table></div>`;
   }
   
   function buildSingleScoreTable(labels, scores, colLabel) {
     const sorted = labels
       .map((lbl, i) => ({ lbl, score: scores[i] }))
       .sort((a, b) => b.score - a.score);
   
     const rows = sorted.map(({ lbl, score }) =>
       `<tr>
         <td style="font-weight:500;color:var(--text-primary)">${escHtml(lbl)}</td>
         <td style="font-family:'Syne',sans-serif;font-weight:700">${fmt(score)}</td>
       </tr>`
     ).join('');
   
     return `<div class="table-container" style="margin-top:12px;">
       <table class="data-table compact">
         <thead><tr><th>Alternatif</th><th>${colLabel}</th></tr></thead>
         <tbody>${rows}</tbody>
       </table></div>`;
   }
   
   function buildIdealTable(cols, idealPos, idealNeg, criteriaTypes) {
     const headerCols = cols.map(c =>
       `<th>${escHtml(c)}<br>
         <span style="font-size:0.65rem;color:var(--text-muted)">
           ${(criteriaTypes[c] || 'benefit') === 'benefit' ? '+B' : '-C'}
         </span>
       </th>`
     ).join('');
   
     return `<div class="table-container" style="margin-top:12px;">
       <table class="data-table compact">
         <thead><tr><th>Solusi</th>${headerCols}</tr></thead>
         <tbody>
           <tr>
             <td style="font-weight:700;color:var(--topsis)">A⁺ (Ideal Positif)</td>
             ${idealPos.map(v => `<td>${fmt(v)}</td>`).join('')}
           </tr>
           <tr>
             <td style="font-weight:700;color:var(--saw)">A⁻ (Ideal Negatif)</td>
             ${idealNeg.map(v => `<td>${fmt(v)}</td>`).join('')}
           </tr>
         </tbody>
       </table></div>`;
   }
   
   function buildDistanceTable(labels, dPos, dNeg) {
     const rows = labels.map((lbl, i) =>
       `<tr>
         <td style="font-weight:500;color:var(--text-primary)">${escHtml(lbl)}</td>
         <td>${fmt(dPos[i])}</td>
         <td>${fmt(dNeg[i])}</td>
         <td style="font-family:'Syne',sans-serif;font-weight:700;color:var(--topsis)">
           ${fmt(dNeg[i] / ((dPos[i] + dNeg[i]) || 1))}
         </td>
       </tr>`
     ).join('');
   
     return `<div class="table-container" style="margin-top:12px;">
       <table class="data-table compact">
         <thead><tr><th>Alternatif</th><th>D⁺</th><th>D⁻</th><th>CC (sementara)</th></tr></thead>
         <tbody>${rows}</tbody>
       </table></div>`;
   }
   
   /* ──────────────────────────────────────────
      MATRIX TAB
   ────────────────────────────────────────── */
   function renderMatrixTab() {
     if (!R.rawData) return;
   
     const headers  = R.rawData[0];
     const rows     = R.rawData.slice(1);
     const labelIdx = headers.indexOf(R.labelCol);
   
     const thead = document.getElementById('matrixThead');
     const tbody = document.getElementById('matrixTbody');
     if (thead && tbody) {
       thead.innerHTML = '<tr>' +
         headers.map(h => `<th>${escHtml(String(h))}</th>`).join('') +
       '</tr>';
       tbody.innerHTML = rows.map(row =>
         '<tr>' + row.map((cell, ci) =>
           `<td${ci === labelIdx ? ' style="font-weight:500;color:var(--text-primary)"' : ''}>
             ${escHtml(String(cell ?? ''))}
           </td>`
         ).join('') + '</tr>'
       ).join('');
     }
   
     const wtbody = document.getElementById('weightSummaryTbody');
     if (wtbody) {
       wtbody.innerHTML = R.selectedCols.map(col => {
         const type = R.criteriaTypes[col] || 'benefit';
         const w    = R.weights[col] || 0;
         return `<tr>
           <td style="font-weight:500;color:var(--text-primary)">${escHtml(col)}</td>
           <td><span class="weight-input-type ${type}"
             style="font-size:0.72rem;padding:2px 8px;border-radius:999px;font-weight:600;">
             ${type === 'benefit' ? '+ Benefit' : '– Cost'}
           </span></td>
           <td style="font-family:'Syne',sans-serif;font-weight:700">${w.toFixed(4)}</td>
           <td>${(w * 100).toFixed(2)}%</td>
         </tr>`;
       }).join('');
     }
   }
   
   /* ──────────────────────────────────────────
      COMPARE TAB
      Menggunakan runSPK() dari calculation-engine.js
   ────────────────────────────────────────── */
   function renderCompareTab() {
     const container = document.getElementById('compareContent');
     if (!container || !R.rawData) return;
   
     const methods  = ['saw', 'topsis', 'waspas', 'moora', 'edas'];
     const mLabels  = { saw: 'SAW', topsis: 'TOPSIS', waspas: 'WASPAS', moora: 'MOORA', edas: 'EDAS' };
     const headers  = R.rawData[0];
     const rows     = R.rawData.slice(1);
     const labelIdx = headers.indexOf(R.labelCol);
     const labels   = rows.map((r, i) => labelIdx >= 0 ? r[labelIdx] : `A${i + 1}`);
     const matrix   = rows.map(row =>
       R.selectedCols.map(col => parseFloat(row[headers.indexOf(col)]) || 0)
     );
     const dm = { labels, matrix, cols: R.selectedCols };
   
     // Jalankan semua metode via calculation-engine.js
     const allRankings = {};
     methods.forEach(m => {
       try {
         allRankings[m] = runSPK(dm, m, R.weights, R.criteriaTypes, R.lambda).ranked;
       } catch (e) {
         allRankings[m] = null;
       }
     });
   
     const headerRow = `<tr>
       <th>Alternatif</th>
       ${methods.map(m => `<th><span style="font-weight:800;font-family:'Syne',sans-serif">${mLabels[m]}</span></th>`).join('')}
       <th>Rank Mayoritas</th>
     </tr>`;
   
     const bodyRows = labels.map(lbl => {
       const ranks    = methods.map(m => {
         const res = allRankings[m];
         if (!res) return '—';
         const item = res.find(r => r.label === lbl);
         return item ? item.rank : '—';
       });
       const numRanks = ranks.filter(r => typeof r === 'number');
       const avgRank  = numRanks.length
         ? Math.round(numRanks.reduce((a, b) => a + b, 0) / numRanks.length)
         : '—';
       const badge = typeof avgRank === 'number' && avgRank <= 3
         ? `rank-badge-${avgRank}` : 'rank-badge-n';
   
       return `<tr>
         <td style="font-weight:500;color:var(--text-primary)">${escHtml(lbl)}</td>
         ${ranks.map(r => {
           const cls = typeof r === 'number' && r <= 3 ? `rank-badge-${r}` : 'rank-badge-n';
           return `<td><span class="rank-badge ${cls}"
             style="width:24px;height:24px;font-size:0.7rem">${r}</span></td>`;
         }).join('')}
         <td><span class="rank-badge ${badge}"
           style="width:24px;height:24px;font-size:0.7rem">${avgRank}</span></td>
       </tr>`;
     }).join('');
   
     container.innerHTML = `
       <div class="compare-grid">
         <div class="compare-header-note">
           <span>ℹ️</span>
           <span>Semua metode dijalankan dengan bobot dan kriteria yang sama.
             Rank Mayoritas adalah rata-rata rank dari semua metode.</span>
         </div>
         <div class="panel">
           <div class="panel-title"><span>⚖️</span> Perbandingan Ranking Antar Metode</div>
           <div class="table-container" style="margin-top:12px;">
             <table class="data-table">
               <thead>${headerRow}</thead>
               <tbody>${bodyRows}</tbody>
             </table>
           </div>
         </div>
       </div>`;
   }
   
   /* ──────────────────────────────────────────
      EXPORT MENU
   ────────────────────────────────────────── */
   function initExportMenu() {
     const toggleBtn = document.getElementById('btnExportToggle');
     const menu      = document.getElementById('exportMenu');
   
     if (toggleBtn && menu) {
       toggleBtn.addEventListener('click', (e) => {
         e.stopPropagation();
         menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
       });
       document.addEventListener('click', () => {
         if (menu) menu.style.display = 'none';
       });
     }
   
     // Excel lengkap (dengan formula + styling)
     document.getElementById('btnExportExcel') &&
       document.getElementById('btnExportExcel').addEventListener('click', () => {
         if (typeof exportXLSX === 'function') exportXLSX(R);
         else showToast('Modul export-xlsx.js belum dimuat.');
       });
   
     // Excel plain (tanpa formula)
     document.getElementById('btnExportPlain') &&
       document.getElementById('btnExportPlain').addEventListener('click', () => {
         if (typeof exportXLSXPlain === 'function') exportXLSXPlain(R);
         else showToast('Modul export-xlsx-plain.js belum dimuat.');
       });
   
     // JSON
     document.getElementById('btnExportJSON') &&
       document.getElementById('btnExportJSON').addEventListener('click', exportJSON);
   
     // Cetak / PDF
     document.getElementById('btnPrint') &&
       document.getElementById('btnPrint').addEventListener('click', () => {
         if (typeof printPreview === 'function') printPreview(R);
         else window.print();
       });
   }
   
   function exportJSON() {
     if (!R) return;
     const out = {
       method:        R.method,
       weightMethod:  R.weightMethod,
       lambda:        R.lambda,
       selectedCols:  R.selectedCols,
       weights:       R.weights,
       criteriaTypes: R.criteriaTypes,
       ranking:       R.result.ranked.map(r => ({ rank: r.rank, label: r.label, score: r.score })),
     };
     downloadText(JSON.stringify(out, null, 2), `spk_${R.method}_result.json`, 'application/json');
     showToast('JSON berhasil diunduh.');
   }
   
   function downloadText(content, filename, mime) {
     const blob = new Blob([content], { type: mime });
     const url  = URL.createObjectURL(blob);
     const a    = document.createElement('a');
     a.href     = url;
     a.download = filename;
     a.click();
     URL.revokeObjectURL(url);
   }
   
   /* ──────────────────────────────────────────
      ANIMATE BARS
   ────────────────────────────────────────── */
   function animateBars() {
     document.querySelectorAll('[data-width]').forEach(el => {
       el.style.width = el.dataset.width + '%';
     });
   }
   
   /* ──────────────────────────────────────────
      UTILITIES
   ────────────────────────────────────────── */
   function getMethodLabel(method) {
     const labels = { saw: 'SAW', topsis: 'TOPSIS', waspas: 'WASPAS', moora: 'MOORA', edas: 'EDAS' };
     return labels[method] || method.toUpperCase();
   }