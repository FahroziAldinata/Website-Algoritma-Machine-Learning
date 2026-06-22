/**
 * src/plugins/knn/knn_plugin.js
 * K-NN Algorithm Plugin
 * 
 * Tujuan: Mengimplementasikan algoritma K-Nearest Neighbors (K-NN) yang mendukung
 * multi-jarak (Euclidean, Manhattan, Minkowski), standardisasi/normalisasi data,
 * boolean & label encoding otomatis, visualisasi step-by-step detail, dan
 * ekspor Excel dinamis (Formula & Plain).
 */

class KNNPlugin extends AlgorithmPlugin {
  constructor() {
    super();
    this.id = 'knn';
    this.name = 'K-NN (K-Nearest Neighbors)';
    this.icon = '&#9633;';
    this.description = 'Klasifikasi berbasis jarak (Euclidean, Manhattan, Minkowski) dengan normalisasi dan voting tetangga.';
    
    this.configSchema = {
      k: { label: 'Nilai K (Jumlah Tetangga)', type: 'number', min: 1, max: 100, step: 1, default: 3 },
      metric: {
        label: 'Metrik Jarak',
        type: 'select',
        options: [
          { label: 'Euclidean', value: 'euclidean' },
          { label: 'Manhattan', value: 'manhattan' },
          { label: 'Minkowski', value: 'minkowski' }
        ],
        default: 'euclidean'
      },
      p: { label: 'Parameter Minkowski (p)', type: 'number', min: 1, max: 10, step: 0.1, default: 3 },
      weighting: {
        label: 'Bobot Tetangga (Weighting)',
        type: 'select',
        options: [
          { label: 'Uniform (Sama rata)', value: 'uniform' },
          { label: 'Distance Weighting (1/jarak)', value: 'distance' }
        ],
        default: 'uniform'
      },
      normType: {
        label: 'Normalisasi Data',
        type: 'select',
        options: [
          { label: 'Tanpa Normalisasi', value: 'none' },
          { label: 'Min-Max Scaling', value: 'minmax' },
          { label: 'Z-Score Standardization', value: 'standard' }
        ],
        default: 'minmax'
      }
    };
  }

  /**
   * Logika perhitungan utama KNN (berjalan di Worker thread)
   */
  async process(trainRowsDummy, testRowsDummy, config, onProgress) {
    const {
      rawRows,
      classCol,
      featureCols,
      k,
      metric,
      p,
      weighting,
      normType,
      testRatio,
      seed,
      splitMethod
    } = config;

    // 1. Deteksi Tipe Kolom
    onProgress('Inisialisasi', 'Mendeteksi tipe kolom...', 10);
    const numericCols = this._detectNumeric(rawRows, featureCols);
    const boolCols = this._detectBoolean(rawRows, featureCols);
    const catCols = this._detectCategorical(rawRows, featureCols);

    // 2. Boolean Encoding
    let encodedRows = rawRows;
    let boolEncodings = {};
    if (boolCols.length > 0) {
      onProgress('Boolean Encoding', `Encoding ${boolCols.length} kolom boolean...`, 15);
      boolCols.forEach(c => {
        boolEncodings[c] = { 'True': 1, 'False': 0, 'true': 1, 'false': 0 };
      });
      encodedRows = encodedRows.map(r => {
        const nr = { ...r };
        boolCols.forEach(c => { nr[c] = this._parseBool(r[c]); });
        return nr;
      });
    }

    // 3. Label Encoding
    let labelEncodings = {};
    if (catCols.length > 0) {
      onProgress('Label Encoding', `Encoding ${catCols.length} kolom kategoris...`, 20);
      labelEncodings = this._buildLabelEncodings(encodedRows, catCols);
      encodedRows = this._applyLabelEncoding(encodedRows, labelEncodings);
    }

    // 4. Split Data (berdasarkan LCG deterministik)
    onProgress('Split Data', 'Melakukan partisi training & testing...', 30);
    // Panggil splitData yang diimpor dari pipeline.js
    const { train: trainRaw, test: testRaw } = splitData(encodedRows, classCol, testRatio, seed, splitMethod);
    
    // Simpan data raw asli (sebelum encode) untuk display tabel
    const { train: trainRawOrig, test: testRawOrig } = splitData(rawRows, classCol, testRatio, seed, splitMethod);

    // 5. Normalisasi Fitur (Z-Score / Min-Max)
    onProgress('Normalisasi', 'Menghitung statistik & normalisasi...', 40);
    const allNumericCols = featureCols; // Setelah encode, semua kolom fitur bertipe angka
    let normStats = null;
    if (normType !== 'none') {
      normStats = getNormalizationStats(trainRaw, allNumericCols, normType);
    }

    const toNum = (rows) => rows.map(r => ({
      ...r,
      ...Object.fromEntries(allNumericCols.map(c => [c, parseFloat(r[c])]))
    }));

    const trainNorm = normType !== 'none'
      ? applyNormalization(trainRaw, allNumericCols, normType, statsSafe(normStats))
      : toNum(trainRaw);
    const testNorm = normType !== 'none'
      ? applyNormalization(testRaw, allNumericCols, normType, statsSafe(normStats))
      : toNum(testRaw);

    function statsSafe(st) { return st || {}; }

    // 6. Prediksi Test Set
    onProgress('Prediksi Test', 'Memprediksi test set...', 50);
    const testPredictions = this._predictSet(
      testNorm, testRawOrig, trainNorm, trainRawOrig,
      allNumericCols, classCol, k, metric, p, weighting,
      'Prediksi Test', 2, 0, onProgress
    );

    // 7. Prediksi Training Set
    onProgress('Prediksi Training', 'Memprediksi training set...', 75);
    const trainPredictions = this._predictSet(
      trainNorm, trainRawOrig, trainNorm, trainRawOrig,
      allNumericCols, classCol, k, metric, p, weighting,
      'Prediksi Training', 2, 1, onProgress
    );

    // 8. Evaluasi Metrik
    onProgress('Evaluasi', 'Menghitung metrik evaluasi...', 95);
    const classes = [...new Set(rawRows.map(r => r[classCol]))].sort();
    const testCM = this._buildConfusionMatrix(testPredictions, classes);
    const trainCM = this._buildConfusionMatrix(trainPredictions, classes);
    const testMetrics = this._calcMetrics(testPredictions, classes, testCM);
    const trainMetrics = this._calcMetrics(trainPredictions, classes, trainCM);

    onProgress('Selesai', 'Perhitungan K-NN selesai.', 100);

    return {
      k, metric, p, weighting, normType,
      featureCols,
      numericCols,
      boolCols,
      catCols,
      boolEncodings,
      labelEncodings,
      allNumericCols,
      trainRaw: trainRawOrig,
      testRaw: testRawOrig,
      trainNorm,
      testNorm,
      normStats,
      predictions: testPredictions,
      cm: testCM,
      metrics: testMetrics,
      trainPredictions,
      trainCM,
      trainMetrics,
      classes,
      splitRatio: 1 - testRatio,
      totalRows: rawRows.length,
      seed,
      classCol
    };
  }

  /**
   * Rendering visual HTML hasil model KNN di Main Thread
   */
  renderHTML(r, container) {
    const pctHelper = (v) => (v * 100).toFixed(2) + '%';
    const fmtHelper = (v, d = 4) => typeof v === 'number' ? v.toFixed(d) : v;

    const metricLabel = { euclidean: 'Euclidean', manhattan: 'Manhattan', minkowski: 'Minkowski' };
    const normLabel = { none: 'Tanpa Normalisasi', minmax: 'Min-Max (0–1)', standard: 'Z-Score Standardisasi' };

    const gap = r.trainMetrics.accuracy - r.metrics.accuracy;
    const gapNote = gap > 0.15
      ? `<span style="color:var(--red);font-size:12px">&#9888; Potensi overfitting (gap ${pctHelper(gap)})</span>`
      : gap < -0.05
      ? `<span style="color:var(--yellow);font-size:12px">&#9888; Test lebih tinggi dari train — periksa data</span>`
      : `<span style="color:var(--green);font-size:12px">&#10003; Generalisasi baik (gap ${pctHelper(Math.abs(gap))})</span>`;

    let html = `
      <!-- Train vs Test comparison cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:12px;margin-bottom:1.5rem">
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem;border-top:3px solid var(--yellow)">
          <div style="font-size:11px;font-family:var(--mono);color:var(--yellow);letter-spacing:.08em;text-transform:uppercase;margin-bottom:.5rem">Training Set (${r.trainPredictions.length} data)</div>
          <div class="metrics-grid" style="grid-template-columns:repeat(2,1fr);gap:8px">
            <div class="metric-card"><div class="metric-label">Accuracy</div><div class="metric-val" style="color:var(--yellow)">${pctHelper(r.trainMetrics.accuracy)}</div></div>
            <div class="metric-card"><div class="metric-label">Macro F1</div><div class="metric-val" style="color:var(--yellow)">${fmtHelper(r.trainMetrics.macro.f1,4)}</div></div>
            <div class="metric-card"><div class="metric-label">Benar</div><div class="metric-val metric-green">${r.trainMetrics.correct}</div></div>
            <div class="metric-card"><div class="metric-label">Salah</div><div class="metric-val metric-red">${r.trainMetrics.total - r.trainMetrics.correct}</div></div>
          </div>
        </div>
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem;border-top:3px solid var(--accent)">
          <div style="font-size:11px;font-family:var(--mono);color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:.5rem">Test Set (${r.predictions.length} data)</div>
          <div class="metrics-grid" style="grid-template-columns:repeat(2,1fr);gap:8px">
            <div class="metric-card"><div class="metric-label">Accuracy</div><div class="metric-val metric-${r.metrics.accuracy >= .7 ? 'green' : 'red'}">${pctHelper(r.metrics.accuracy)}</div></div>
            <div class="metric-card"><div class="metric-label">Macro F1</div><div class="metric-val metric-blue">${fmtHelper(r.metrics.macro.f1,4)}</div></div>
            <div class="metric-card"><div class="metric-label">Benar</div><div class="metric-val metric-green">${r.metrics.correct}</div></div>
            <div class="metric-card"><div class="metric-label">Salah</div><div class="metric-val metric-red">${r.metrics.total - r.metrics.correct}</div></div>
          </div>
        </div>
      </div>
      <div style="text-align:right;margin-top:-1rem;margin-bottom:1.5rem">${gapNote}</div>
    `;

    // 1. Dataset & Split
    const classDistHTML = r.classes.map(cls => {
      const n = r.trainRaw.filter(row => row[r.classCol] === cls).length;
      const nt = r.testRaw.filter(row => row[r.classCol] === cls).length;
      return `<tr><td class="mono">${escapeHTML(cls)}</td><td class="mono">${n}</td><td class="mono">${nt}</td><td class="mono">${n + nt}</td></tr>`;
    }).join('');

    html += `
      <div class="section">
        <div class="section-head"><div class="step-circle">1</div><div class="section-title">Dataset &amp; Distribusi Kelas</div></div>
        <div class="section-body">
          <div class="info-box">
            Total: <strong>${r.totalRows}</strong> baris &nbsp;|&nbsp;
            Train: <strong>${r.trainRaw.length}</strong> (${pctHelper(r.trainRaw.length / r.totalRows)}) &nbsp;|&nbsp;
            Test: <strong>${r.testRaw.length}</strong> (${pctHelper(r.testRaw.length / r.totalRows)}) &nbsp;|&nbsp;
            Seed: <strong>${r.seed}</strong>
          </div>
          <div style="margin-bottom:.5rem;font-size:13px;color:var(--text2)">
            <strong>Fitur:</strong>
            ${r.featureCols.map(c => `<span class="chip" style="background:var(--bg4);color:var(--text2);margin:2px">${escapeHTML(c)} <span style="font-size:11px;color:var(--text3)">${r.numericCols.includes(c) ? 'num' : 'cat'}</span></span>`).join('')}
            &nbsp;<strong>Label Target:</strong> <span class="chip chip-ok">${escapeHTML(r.classCol)}</span>
          </div>
          <div class="sub-title">DISTRIBUSI KELAS (Stratified Split)</div>
          <div class="tbl-wrap-scroll">
            <table>
              <thead><tr><th>Kelas</th><th>Train</th><th>Test</th><th>Total</th></tr></thead>
              <tbody>${classDistHTML}</tbody>
            </table>
          </div>
          <div class="excel-block" style="margin-top:1rem">
            <div class="excel-label">Formula Split &amp; PRNG</div>
            <div class="exc-row"><span class="exc-cell">n_test</span><span class="exc-formula">=MAX(1, ROUND(n_class × test_ratio, 0))</span><span class="exc-comment">// per kelas (stratified)</span></div>
            <div class="exc-row"><span class="exc-cell">LCG</span><span class="exc-formula">X_(n+1) = (1664525 × X_n + 1013904223) mod 2^32, seed=42</span></div>
          </div>
        </div>
      </div>
    `;

    // 2. Encoding Section
    if (r.catCols && r.catCols.length > 0) {
      const tableRows = r.catCols.map(col => {
        const map = r.labelEncodings[col];
        const entries = Object.entries(map).sort((a, b) => a[1] - b[1]);
        const mapStr = entries.map(([val, idx]) => `<span class="chip" style="background:var(--bg4);color:var(--text2);margin:2px;font-size:11px">${escapeHTML(val)} → ${idx}</span>`).join(' ');
        return `<tr>
          <td class="mono">${escapeHTML(col)}</td>
          <td style="font-size:12px">${mapStr}</td>
          <td class="mono" style="color:var(--text3)">${entries.length} nilai unik</td>
        </tr>`;
      }).join('');

      html += `
        <div class="section">
          <div class="section-head"><div class="step-circle">2</div><div class="section-title">Label Encoding — Fitur Kategoris</div></div>
          <div class="section-body">
            <div class="info-box">
              Teks kategorik dikonversi ke angka via Label Encoding alfabetis agar perhitungan jarak dapat dihitung.
            </div>
            <div class="tbl-wrap-scroll">
              <table>
                <thead><tr><th>Kolom</th><th>Mapping (Nilai → Angka)</th><th>Info</th></tr></thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    // 3. Normalisasi
    if (r.normType !== 'none') {
      const isMinMax = r.normType === 'minmax';
      const statsRows = r.allNumericCols.map(c => {
        const ns = r.normStats?.[c];
        if (!ns) return '';
        const tag = r.boolCols.includes(c) ? ' [bool]' : r.catCols.includes(c) ? ' [encoded]' : ' [num]';
        if (isMinMax) {
          return `<tr><td class="mono">${escapeHTML(c)}<span style="color:var(--text3);font-size:10px">${tag}</span></td><td class="mono">${fmtHelper(ns.min)}</td><td class="mono">${fmtHelper(ns.max)}</td><td class="mono">${fmtHelper(ns.max - ns.min)}</td></tr>`;
        } else {
          return `<tr><td class="mono">${escapeHTML(c)}<span style="color:var(--text3);font-size:10px">${tag}</span></td><td class="mono">${fmtHelper(ns.mean)}</td><td class="mono">${fmtHelper(ns.std)}</td><td></td></tr>`;
        }
      }).join('');

      html += `
        <div class="section">
          <div class="section-head"><div class="step-circle">3</div><div class="section-title">Normalisasi Fitur — ${isMinMax ? 'Min-Max' : 'Z-Score'}</div></div>
          <div class="section-body">
            <div class="info-box">Statistik dihitung dari training set saja untuk mencegah kebocoran data (data leakage).</div>
            <div class="tbl-wrap-scroll">
              <table>
                <thead><tr><th>Kolom &amp; Tipe</th>${isMinMax ? '<th>Min</th><th>Max</th><th>Range</th>' : '<th>Mean</th><th>Std Dev</th><th></th>'}</tr></thead>
                <tbody>${statsRows}</tbody>
              </table>
            </div>
            <div class="excel-block" style="margin-top:1rem">
              <div class="excel-label">Formula Normalisasi</div>
              ${isMinMax
                ? `<div class="exc-row"><span class="exc-cell">Min-Max</span><span class="exc-formula">=(x - MIN) / (MAX - MIN)</span></div>`
                : `<div class="exc-row"><span class="exc-cell">Z-Score</span><span class="exc-formula">=(x - MEAN) / STD</span></div>`
              }
            </div>
          </div>
        </div>
      `;
    }

    // 4. Jarak Test Row #1
    const pred = r.predictions[0];
    if (pred) {
      const metricFormula = {
        euclidean: 'd = √(Σ(xᵢ − yᵢ)²)',
        manhattan: 'd = Σ|xᵢ − yᵢ|',
        minkowski: `d = (Σ|xᵢ − yᵢ|ᵖ)^(1/p), p=${r.p}`
      };
      
      const distRows = pred.dists.map((dn, i) => {
        const isNeighbor = i < r.k;
        return `<tr ${isNeighbor ? 'class="row-hl"' : ''}>
          <td class="mono" style="color:var(--text3)">#${i + 1}</td>
          <td class="mono">${escapeHTML(dn.rawRow[r.classCol])}</td>
          ${r.allNumericCols.map(c => {
            const tv = r.normType !== 'none' ? pred.queryNormRow[c] : parseFloat(pred.queryRawRow[c]);
            const nv = r.normType !== 'none' ? dn.row[c] : parseFloat(dn.rawRow[c]);
            return `<td class="mono" style="font-size:12px">${fmtHelper(tv, 3)} vs ${fmtHelper(nv, 3)}</td>`;
          }).join('')}
          <td class="mono" style="color:var(--accent)">${fmtHelper(dn.dist, 6)}</td>
          <td>${isNeighbor ? `<span class="chip chip-ok">K${i + 1}</span>` : ''}</td>
        </tr>`;
      }).join('');

      const tallyHTML = Object.entries(pred.tally).sort(([a], [b]) => a.localeCompare(b))
        .map(([cls, score]) => `<tr><td class="mono">${escapeHTML(cls)}</td><td class="mono">${fmtHelper(score, 4)}</td></tr>`).join('');

      html += `
        <div class="section">
          <div class="section-head"><div class="step-circle">4</div><div class="section-title">Perhitungan Jarak — Contoh Test Row #1</div></div>
          <div class="section-body">
            <div class="info-box">
              <strong>Query Test Row #1:</strong>
              ${r.allNumericCols.map(c => `<span class="mono" style="margin-right:8px">${escapeHTML(c)}=${pred.queryRawRow[c]}</span>`).join('')}
            </div>
            <div class="excel-block">
              <div class="excel-label">Metode Jarak — ${metricLabel[r.metric]}</div>
              <div class="exc-row"><span class="exc-formula">${metricFormula[r.metric]}</span></div>
            </div>
            <div class="tbl-wrap-scroll">
              <table>
                <thead><tr><th>Rank</th><th>Kelas</th>${r.allNumericCols.map(c => `<th>${escapeHTML(c)}</th>`).join('')}<th>Jarak</th><th>Tetangga?</th></tr></thead>
                <tbody>${distRows}</tbody>
              </table>
            </div>
            <div style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-top:1rem">
              <div>
                <div class="sub-title">VOTING TALLY</div>
                <table>
                  <thead><tr><th>Kelas</th><th>${r.weighting === 'distance' ? 'Skor (Σ1/d)' : 'Jumlah Suara'}</th></tr></thead>
                  <tbody>${tallyHTML}</tbody>
                </table>
              </div>
              <div style="display:flex;align-items:center">
                <div class="metric-card" style="min-width:180px">
                  <div class="metric-label">Hasil Prediksi</div>
                  <div class="metric-val metric-blue">${escapeHTML(pred.predicted)}</div>
                  <div style="font-size:12px;margin-top:4px">${pred.correct ? '<span class="chip chip-ok">✓ BENAR</span>' : '<span class="chip chip-fail">✗ SALAH</span>'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // 5. Prediksi Test Table
    html += this._renderPredictionsTable(r, r.predictions, 'Test', 5, pctHelper, fmtHelper);
    
    // 6. Prediksi Train Table
    html += this._renderPredictionsTable(r, r.trainPredictions, 'Training', 6, pctHelper, fmtHelper);

    // 7. Evaluasi Metrik
    html += `
      <div class="section">
        <div class="section-head"><div class="step-circle">7</div><div class="section-title">Evaluasi Metrik — Training vs Test</div></div>
        <div class="section-body">
          <div class="excel-block" style="margin-bottom:1rem">
            <div class="excel-label">Formula Evaluasi</div>
            <div class="exc-row"><span class="exc-cell">Accuracy</span><span class="exc-formula">= Benar / Total Data</span></div>
            <div class="exc-row"><span class="exc-cell">Precision</span><span class="exc-formula">= TP / (TP + FP)</span></div>
            <div class="exc-row"><span class="exc-cell">Recall</span><span class="exc-formula">= TP / (TP + FN)</span></div>
          </div>
          
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:1.25rem;">
            ${this._renderOneEvalBlock(r, r.trainMetrics, r.trainCM, 'Training', 'var(--yellow)', pctHelper, fmtHelper)}
            ${this._renderOneEvalBlock(r, r.metrics, r.cm, 'Test', 'var(--accent)', pctHelper, fmtHelper)}
          </div>

          <!-- Perbandingan ringkas -->
          <div style="margin-top:1.5rem">
            <div class="sub-title">TABEL PERBANDINGAN RINGKAS</div>
            <div class="tbl-wrap-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Metrik</th>
                    <th style="color:var(--yellow)">Training</th>
                    <th style="color:var(--accent)">Test</th>
                    <th>Gap (Train - Test)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Accuracy</td>
                    <td class="mono" style="color:var(--yellow)">${pctHelper(r.trainMetrics.accuracy)}</td>
                    <td class="mono" style="color:var(--accent)">${pctHelper(r.metrics.accuracy)}</td>
                    <td class="mono" style="color:${Math.abs(gap) > 0.15 ? 'var(--red)' : 'var(--green)'}">${pctHelper(gap)}</td>
                  </tr>
                  <tr>
                    <td>Macro Precision</td>
                    <td class="mono" style="color:var(--yellow)">${pctHelper(r.trainMetrics.macro.precision)}</td>
                    <td class="mono" style="color:var(--accent)">${pctHelper(r.metrics.macro.precision)}</td>
                    <td class="mono">${pctHelper(r.trainMetrics.macro.precision - r.metrics.macro.precision)}</td>
                  </tr>
                  <tr>
                    <td>Macro Recall</td>
                    <td class="mono" style="color:var(--yellow)">${pctHelper(r.trainMetrics.macro.recall)}</td>
                    <td class="mono" style="color:var(--accent)">${pctHelper(r.metrics.macro.recall)}</td>
                    <td class="mono">${pctHelper(r.trainMetrics.macro.recall - r.metrics.macro.recall)}</td>
                  </tr>
                  <tr>
                    <td>Macro F1-Score</td>
                    <td class="mono" style="color:var(--yellow)">${pctHelper(r.trainMetrics.macro.f1)}</td>
                    <td class="mono" style="color:var(--accent)">${pctHelper(r.metrics.macro.f1)}</td>
                    <td class="mono">${pctHelper(r.trainMetrics.macro.f1 - r.metrics.macro.f1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  /**
   * Helper: Render tabel prediksi untuk training/testing set
   */
  _renderPredictionsTable(r, preds, label, stepNum, pctHelper, fmtHelper) {
    const rows = preds.map((pred, i) => {
      const nbStr = pred.neighbors.map(n => `${escapeHTML(n.rawRow[r.classCol])}(${fmtHelper(n.dist, 2)})`).join(', ');
      return `<tr>
        <td class="mono" style="color:var(--text3)">${i + 1}</td>
        ${r.allNumericCols.map(c => `<td class="mono">${pred.queryRawRow[c]}</td>`).join('')}
        <td class="mono" style="font-size:11px;max-width:200px;white-space:normal">${nbStr}</td>
        <td class="mono">${escapeHTML(pred.actual)}</td>
        <td class="mono" style="color:${pred.correct ? 'var(--green)' : 'var(--red)'}">${escapeHTML(pred.predicted)}</td>
        <td>${pred.correct ? '<span class="chip chip-ok">✓</span>' : '<span class="chip chip-fail">✗</span>'}</td>
      </tr>`;
    }).join('');

    const color = label === 'Training' ? 'var(--yellow)' : 'var(--accent)';

    return `
      <div class="section" style="border-top:3px solid ${color}">
        <div class="section-head">
          <div class="step-circle">${stepNum}</div>
          <div class="section-title">Prediksi <span style="color:${color}">${label} Set</span> (${preds.length} data)</div>
        </div>
        <div class="section-body">
          <div class="tbl-wrap-scroll" style="max-height:280px">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  ${r.allNumericCols.map(c => `<th>${escapeHTML(c)}</th>`).join('')}
                  <th>K Tetangga Terdekat</th>
                  <th>Aktual</th>
                  <th>Prediksi</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Helper: Render satu panel evaluasi (train atau test)
   */
  _renderOneEvalBlock(r, metrics, cm, label, color, pctHelper, fmtHelper) {
    const cmHeader = `<tr><th style="background:var(--bg)"></th>${r.classes.map(c => `<th style="color:${color}">${escapeHTML(c)}</th>`).join('')}</tr>`;
    const cmRows = r.classes.map(actual => {
      const cells = r.classes.map(pred => {
        const v = cm[actual][pred] || 0;
        const isTP = actual === pred;
        return `<td class="mono" style="${isTP ? 'background:rgba(52,211,153,0.12);color:var(--green);font-weight:600' : v > 0 ? 'color:var(--red)' : 'color:var(--text3)'}">${v}</td>`;
      }).join('');
      return `<tr><th style="color:var(--text2)">${escapeHTML(actual)}</th>${cells}</tr>`;
    }).join('');

    const perClassRows = r.classes.map(cls => {
      const m = metrics.perClass[cls];
      return `<tr>
        <td class="mono">${escapeHTML(cls)}</td>
        <td class="mono">${m.tp}</td><td class="mono">${m.fp}</td><td class="mono">${m.fn}</td>
        <td class="mono">${pctHelper(m.precision)}</td>
        <td class="mono">${pctHelper(m.recall)}</td>
        <td class="mono">${pctHelper(m.f1)}</td>
      </tr>`;
    }).join('');

    return `
      <div style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
        <div style="background:var(--bg3);padding:.65rem 1rem;border-bottom:1px solid var(--border);font-weight:600;color:${color}">${label} Set</div>
        <div style="padding:1rem">
          <div style="margin-bottom:.75rem">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:4px">
              <span>Accuracy</span><span style="color:${color};font-weight:700">${pctHelper(metrics.accuracy)}</span>
            </div>
            <div style="height:6px;background:var(--bg4);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${pctHelper(metrics.accuracy)};background:${color}"></div>
            </div>
          </div>
          
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:6px;margin-bottom:1rem">
            <div class="metric-card" style="padding:.5rem .7rem"><div class="metric-label">Macro Prec</div><div style="font-size:14px;font-weight:600">${pctHelper(metrics.macro.precision)}</div></div>
            <div class="metric-card" style="padding:.5rem .7rem"><div class="metric-label">Macro Rec</div><div style="font-size:14px;font-weight:600">${pctHelper(metrics.macro.recall)}</div></div>
            <div class="metric-card" style="padding:.5rem .7rem"><div class="metric-label">Macro F1</div><div style="font-size:14px;font-weight:600">${pctHelper(metrics.macro.f1)}</div></div>
          </div>

          <div class="sub-title">CONFUSION MATRIX</div>
          <div class="tbl-wrap-scroll" style="margin-bottom:1rem; max-height:160px">
            <table>${cmHeader}${cmRows}</table>
          </div>

          <div class="sub-title">METRIK PER KELAS</div>
          <div class="tbl-wrap-scroll" style="max-height:160px">
            <table>
              <thead><tr><th>Kelas</th><th>TP</th><th>FP</th><th>FN</th><th>Prec</th><th>Rec</th><th>F1</th></tr></thead>
              <tbody>${perClassRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Ekspor data dan formula ke file Excel
   */
  exportExcel(r, mode) {
    const fm = (mode === 'formula');
    const _EX = {};

    const WB = newWB();

    // S1 - Dataset
    this._s1_dataset(WB, r, fm, _EX);
    // S2 - Stats
    this._s2_stats(WB, r, fm, _EX);
    // S3 - Norm
    this._s3_norm(WB, r, fm, _EX);
    // S4 - Jarak
    this._s4_jarak(WB, r, fm, _EX);
    // S5 - Pred Test
    this._s5_pred(WB, r, fm, 'test', _EX);
    // S6 - Pred Train
    this._s5_pred(WB, r, fm, 'train', _EX);
    // S7 - Evaluasi
    this._s7_evaluasi(WB, r, fm, _EX);

    return WB;
  }

  /* ---- S1_Dataset ---- */
  _s1_dataset(WB, r, fm, _EX) {
    const SN = '1_Dataset';
    const allFeat = r.featureCols;
    const classCol = r.classCol;
    const rows = [];

    rows.push(['ML Manual Calculator — K-NN']);
    rows.push(['K', r.k, 'Metrik', r.metric, 'Norm', r.normType]);
    rows.push(['Weighting', r.weighting, 'Seed', r.seed, 'Split', n8(r.splitRatio)]);
    rows.push(['Total Baris', r.totalRows, 'Train', r.trainRaw.length, 'Test', r.testRaw.length]);
    rows.push([]);

    const TRAIN_HEADER_ROW = rows.length;
    rows.push(['#', ...allFeat, classCol]);

    _EX.s1 = {
      sn: SN,
      trainHeaderRow: TRAIN_HEADER_ROW,
      trainDataStart: rows.length,
      featCols: {},
      klasCol: 0
    };
    allFeat.forEach((c, i) => { _EX.s1.featCols[c] = i + 1; });
    _EX.s1.klasCol = allFeat.length + 1;

    const s1CellVal = (row, c) => {
      if (r.numericCols.includes(c)) {
        return isNaN(parseFloat(row[c])) ? sanitizeFormula(row[c]) : n8(parseFloat(row[c]));
      }
      if (r.boolCols.includes(c)) {
        const s = String(row[c]).trim().toLowerCase();
        return (s === 'true' || s === '1') ? 1 : 0;
      }
      if (r.labelEncodings && r.labelEncodings[c] !== undefined) {
        const map = r.labelEncodings[c];
        return row[c] in map ? map[row[c]] : sanitizeFormula(row[c]);
      }
      return isNaN(parseFloat(row[c])) ? sanitizeFormula(row[c]) : n8(parseFloat(row[c]));
    };

    r.trainRaw.forEach((row, i) => {
      rows.push([
        i + 1,
        ...allFeat.map(c => s1CellVal(row, c)),
        sanitizeFormula(row[classCol])
      ]);
    });

    _EX.s1.trainDataEnd = rows.length - 1;
    rows.push([]);

    const TEST_HEADER_ROW = rows.length;
    rows.push(['#', ...allFeat, classCol]);
    _EX.s1.testHeaderRow = TEST_HEADER_ROW;
    _EX.s1.testDataStart = rows.length;

    r.testRaw.forEach((row, i) => {
      rows.push([
        i + 1,
        ...allFeat.map(c => s1CellVal(row, c)),
        sanitizeFormula(row[classCol])
      ]);
    });
    _EX.s1.testDataEnd = rows.length - 1;

    addWS(WB, aoaToWS(rows), SN);
  }

  /* ---- S2_Stats ---- */
  _s2_stats(WB, r, fm, _EX) {
    const SN = '2_Stats';
    const S1 = _EX.s1.sn;
    const trainStart = _EX.s1.trainDataStart + 1;
    const trainEnd = _EX.s1.trainDataEnd + 1;
    const rows = [];

    rows.push(['Statistik Normalisasi — dihitung dari Training Set saja']);
    rows.push(['(mencegah data leakage ke test set)']);
    rows.push([]);

    const hasBool = r.boolCols && r.boolCols.length > 0;
    const hasCat = r.catCols && r.catCols.length > 0;
    if (hasBool || hasCat) {
      rows.push(['Preprocessing sebelum normalisasi:']);
      if (hasBool) rows.push([`  Boolean Encoding: ${r.boolCols.join(', ')} → True=1, False=0`]);
      if (hasCat) rows.push([`  Label Encoding  : ${r.catCols.join(', ')} → angka alfabetis`]);
      rows.push([]);
    }

    const STAT_HEADER_ROW = rows.length;
    rows.push(['Fitur', 'Min', 'Max', 'Range (Max-Min)', 'Mean', 'StdDev', 'Metode Norm', 'Tipe Kolom']);
    
    _EX.s2 = {
      sn: SN,
      statHeaderRow: STAT_HEADER_ROW,
      statDataStart: rows.length,
      featRow: {}
    };

    const allCols = r.allNumericCols;

    const calcColStats = (col) => {
      const ns = r.normStats?.[col];
      if (!ns) return { min: 0, max: 0, range: 0, mean: 0, std: 0 };
      const min = ns.min ?? 0;
      const max = ns.max ?? 0;
      const range = max - min;
      let mean = ns.mean ?? 0;
      let std = ns.std ?? 0;

      if (r.normType === 'minmax' && mean === 0 && std === 0) {
        const vals = r.trainNorm.map(row => {
          const v = row[col];
          return typeof v === 'number' && !isNaN(v) ? v * range + min : null;
        }).filter(v => v !== null);

        if (vals.length > 0) {
          mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          const variance = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length;
          std = Math.sqrt(variance);
        }
      }
      return { min, max, range, mean, std };
    };

    allCols.forEach((c, fi) => {
      const s1Col = col2l(_EX.s1.featCols[c]);
      const s1Rng = `${xref(S1, s1Col + trainStart)}:${xref(S1, s1Col + trainEnd)}`;
      const rowIdx = rows.length;
      _EX.s2.featRow[c] = rowIdx;

      const exRow = rowIdx + 1;
      let minCell, maxCell, rangeFm, meanCell, stdCell;

      if (fm) {
        minCell = fc(`MIN(${s1Rng})`);
        maxCell = fc(`MAX(${s1Rng})`);
        rangeFm = fc(`C${exRow}-B${exRow}`);
        meanCell = fc(`AVERAGE(${s1Rng})`);
        stdCell = fc(`STDEV(${s1Rng})`);
      } else {
        const st = calcColStats(c);
        minCell = n8(st.min);
        maxCell = n8(st.max);
        rangeFm = n8(st.range);
        meanCell = n8(st.mean);
        stdCell = n8(st.std);
      }

      const tipeKolom = r.boolCols.includes(c)
        ? 'Boolean (True/False→1/0)'
        : r.catCols.includes(c)
          ? 'Kategoris (Label Encoded)'
          : 'Numerik';

      rows.push([c, minCell, maxCell, rangeFm, meanCell, stdCell, r.normType, tipeKolom]);
    });

    _EX.s2.statDataEnd = rows.length - 1;
    addWS(WB, aoaToWS(rows), SN);
  }

  /* ---- S3_Norm ---- */
  _s3_norm(WB, r, fm, _EX) {
    const SN = '3_Norm';
    const S1 = _EX.s1.sn;
    const S2 = _EX.s2.sn;
    const allFeat = r.featureCols;
    const normHeader = ['#', ...allFeat.map(c => `${c}_norm`), r.classCol];
    const rows = [];

    rows.push(['Normalisasi Fitur — metode: ' + r.normType]);
    rows.push([]);

    const normCell = (c, s1DataRow) => {
      if (r.normType === 'none') {
        const s1ColL = col2l(_EX.s1.featCols[c]);
        return fm ? fc(`${xref(S1, s1ColL + s1DataRow)}`) : null;
      }
      const s2Row = _EX.s2.featRow[c] + 1;
      const s1ColL = col2l(_EX.s1.featCols[c]);
      const xVal = xref(S1, s1ColL + s1DataRow);

      if (r.normType === 'minmax') {
        const minRef = xref(S2, `B${s2Row}`);
        const rangeRef = xref(S2, `D${s2Row}`);
        return fm ? fc(`IF(${rangeRef}=0,0,(${xVal}-${minRef})/${rangeRef})`) : null;
      } else {
        const meanRef = xref(S2, `E${s2Row}`);
        const stdRef = xref(S2, `F${s2Row}`);
        return fm ? fc(`IF(${stdRef}=0,0,(${xVal}-${meanRef})/${stdRef})`) : null;
      }
    };

    // Training set
    rows.push(['--- TRAINING SET (Ternormalisasi) ---']);
    const TRAIN_HEADER_ROW = rows.length;
    rows.push(normHeader);
    _EX.s3 = {
      sn: SN,
      trainHeaderRow: TRAIN_HEADER_ROW,
      trainDataStart: rows.length,
      featCols: {},
      klasCol: 0
    };
    allFeat.forEach((c, i) => { _EX.s3.featCols[c] = i + 1; });
    _EX.s3.klasCol = allFeat.length + 1;

    r.trainRaw.forEach((raw, i) => {
      const s1Row = _EX.s1.trainDataStart + 1 + i;
      const cells = allFeat.map(c => fm ? normCell(c, s1Row) : n8(r.trainNorm[i][c]));
      rows.push([i + 1, ...cells, sanitizeFormula(raw[r.classCol])]);
    });
    _EX.s3.trainDataEnd = rows.length - 1;
    rows.push([]);

    // Test set
    rows.push(['--- TEST SET (Ternormalisasi) ---']);
    const TEST_HEADER_ROW = rows.length;
    rows.push(normHeader);
    _EX.s3.testHeaderRow = TEST_HEADER_ROW;
    _EX.s3.testDataStart = rows.length;

    r.testRaw.forEach((raw, i) => {
      const s1Row = _EX.s1.testDataStart + 1 + i;
      const cells = allFeat.map(c => fm ? normCell(c, s1Row) : n8(r.testNorm[i][c]));
      rows.push([i + 1, ...cells, sanitizeFormula(raw[r.classCol])]);
    });
    _EX.s3.testDataEnd = rows.length - 1;

    addWS(WB, aoaToWS(rows), SN);
  }

  /* ---- S4_Jarak ---- */
  _s4_jarak(WB, r, fm, _EX) {
    const SN = '4_Jarak';
    const S3 = _EX.s3.sn;
    const nc = r.allNumericCols;
    const classCol = r.classCol;
    const rows = [];

    const jarakFormula = (testS3Row, trainS3Row) => {
      const terms = nc.map(c => {
        const col = col2l(_EX.s3.featCols[c]);
        const tRef = xref(S3, col + testS3Row);
        const nRef = xref(S3, col + trainS3Row);
        if (r.metric === 'euclidean') return `(${tRef}-${nRef})^2`;
        if (r.metric === 'manhattan') return `ABS(${tRef}-${nRef})`;
        return `ABS(${tRef}-${nRef})^${r.p}`;
      });
      const inner = terms.join('+');
      if (r.metric === 'euclidean') return `SQRT(${inner})`;
      if (r.metric === 'manhattan') return inner;
      return `(${inner})^(1/${r.p})`;
    };

    const metricStr = { euclidean: 'Euclidean √Σ(x-y)²', manhattan: 'Manhattan Σ|x-y|', minkowski: `Minkowski (Σ|x-y|^p)^(1/p) p=${r.p}` };
    rows.push([`Perhitungan Jarak — ${metricStr[r.metric]}`]);
    rows.push([`Normalisasi: ${r.normType} | Weighting: ${r.weighting} | K=${r.k}`]);
    rows.push([]);

    _EX.s4 = { sn: SN, testBlocks: [] };
    const trainCount = r.trainRaw.length;

    r.predictions.forEach((pred, ti) => {
      const testS3Row = _EX.s3.testDataStart + 1 + ti;
      const blockStart = rows.length;

      rows.push([
        `Test Row #${ti + 1}`,
        ...nc.map(c => `${escapeHTML(c)}=${n8(parseFloat(pred.queryRawRow[c]))}`),
        `Aktual: ${escapeHTML(pred.actual)}`
      ]);

      const subH = ['Rank', 'Train#', ...nc.map(c => `${c}_train_norm`), 'Jarak'];
      if (r.weighting === 'distance') subH.push('Weight(1/d)');
      subH.push('K-Tetangga?', 'Kelas_Train');
      rows.push(subH);

      const distRowStart = rows.length;

      pred.dists.forEach((dn, di) => {
        const trainS3Row = _EX.s3.trainDataStart + 1 + dn.idx;
        const isNeighbor = di < r.k;
        const distExRow = rows.length + 1;

        const trainNormCells = nc.map(c => {
          const col = col2l(_EX.s3.featCols[c]);
          return fm ? fc(xref(S3, col + trainS3Row)) : n8(dn.row[c]);
        });

        const jarakColIdx = 2 + nc.length;
        const jarakColL = col2l(jarakColIdx);
        const jarakCell = fm ? fc(jarakFormula(testS3Row, trainS3Row)) : n8(dn.dist);

        let weightCell = null;
        if (r.weighting === 'distance') {
          weightCell = fm
            ? fc(`IF(${jarakColL}${distExRow}=0,"Inf",1/${jarakColL}${distExRow})`)
            : (dn.dist === 0 ? 'Inf' : n8(1 / dn.dist));
        }

        const row = [di + 1, dn.idx + 1, ...trainNormCells, jarakCell];
        if (r.weighting === 'distance') row.push(weightCell);
        row.push(isNeighbor ? `K${di + 1} ✓` : '', sanitizeFormula(dn.rawRow[classCol]));
        rows.push(row);
      });

      const distRowEnd = rows.length;

      rows.push([]);
      rows.push(['Voting Tally:']);
      rows.push(['Kelas', r.weighting === 'distance' ? 'Skor (Σ1/d)' : 'Jumlah Suara']);
      Object.entries(pred.tally).sort(([a], [b]) => a.localeCompare(b)).forEach(([cls, score]) => {
        rows.push([sanitizeFormula(cls), typeof score === 'number' ? n8(score) : score]);
      });
      rows.push(['Prediksi:', sanitizeFormula(pred.predicted), 'Aktual:', sanitizeFormula(pred.actual), 'Status:', pred.correct ? 'BENAR ✓' : 'SALAH ✗']);
      rows.push([]);

      _EX.s4.testBlocks.push({
        testIdx: ti,
        distRowStart,
        distRowEnd,
        trainCount
      });
    });

    addWS(WB, aoaToWS(rows), SN);
  }

  /* ---- S5/S6_Pred ---- */
  _s5_pred(WB, r, fm, setType, _EX) {
    const isTest = (setType === 'test');
    const SN = isTest ? '5_Pred_Test' : '6_Pred_Train';
    const S3 = _EX.s3.sn;
    const S4 = _EX.s4.sn;
    const preds = isTest ? r.predictions : r.trainPredictions;
    const rawSet = isTest ? r.testRaw : r.trainRaw;
    const nc = r.allNumericCols;
    const allFeat = r.featureCols;
    const classCol = r.classCol;
    const rows = [];

    rows.push([`Prediksi ${isTest ? 'TEST' : 'TRAINING'} Set — K=${r.k} | ${r.metric} | ${r.normType}`]);
    rows.push([]);

    const header = [
      '#',
      ...allFeat.map(c => c + '_raw'),
      ...(r.normType !== 'none' ? allFeat.map(c => c + '_norm') : []),
      ...Array.from({ length: r.k }, (_, i) => `K${i + 1}_kelas`),
      ...Array.from({ length: r.k }, (_, i) => `K${i + 1}_jarak`),
      ...(r.weighting === 'distance' ? Array.from({ length: r.k }, (_, i) => `K${i + 1}_weight`) : []),
      'Aktual', 'Prediksi', 'Status'
    ];
    rows.push(header);

    const key = isTest ? 's5' : 's6';
    _EX[key] = { sn: SN, dataStart: rows.length };

    preds.forEach((pred, i) => {
      const raw = pred.queryRawRow;
      const norm = pred.queryNormRow;

      const rawVals = allFeat.map(c => isNaN(parseFloat(raw[c])) ? sanitizeFormula(raw[c]) : n8(parseFloat(raw[c])));

      let normVals = [];
      if (r.normType !== 'none') {
        if (fm) {
          const s3Row = (isTest ? _EX.s3.testDataStart : _EX.s3.trainDataStart) + 1 + i;
          normVals = allFeat.map(c => {
            const col = col2l(_EX.s3.featCols[c]);
            return fc(xref(S3, col + s3Row));
          });
        } else {
          normVals = allFeat.map(c => n8(norm[c]));
        }
      }

      const kClasses = pred.neighbors.map(n => sanitizeFormula(n.rawRow[classCol]));

      let kDists = [];
      if (fm && _EX.s4.testBlocks && isTest) {
        const block = _EX.s4.testBlocks[i];
        if (block) {
          kDists = pred.neighbors.map((n, ki) => {
            const rank = pred.dists.findIndex(d => d.idx === n.idx);
            const s4DataRow = block.distRowStart + 1 + rank;
            const jarakColL = col2l(2 + nc.length);
            return fc(xref(S4, jarakColL + s4DataRow));
          });
        } else {
          kDists = pred.neighbors.map(n => n8(n.dist));
        }
      } else {
        kDists = pred.neighbors.map(n => n8(n.dist));
      }

      let kWeights = [];
      if (r.weighting === 'distance') {
        const dataRowExcel = rows.length + 1;
        const jarakStartColIdx = 1 + allFeat.length + (r.normType !== 'none' ? allFeat.length : 0) + r.k;
        kWeights = Array.from({ length: r.k }, (_, ki) => {
          const jarakColL = col2l(jarakStartColIdx + ki);
          return fm
            ? fc(`IF(${jarakColL}${dataRowExcel}=0,"Inf",1/${jarakColL}${dataRowExcel})`)
            : (pred.neighbors[ki].dist === 0 ? 'Inf' : n8(1 / pred.neighbors[ki].dist));
        });
      }

      const aktualVal = sanitizeFormula(raw[classCol]);
      const predVal = sanitizeFormula(pred.predicted);

      let statusCell;
      if (fm) {
        const dataRowExcel = rows.length + 1;
        const totalCols = 1 + allFeat.length + (r.normType !== 'none' ? allFeat.length : 0) + r.k + r.k + (r.weighting === 'distance' ? r.k : 0);
        const aktColL = col2l(totalCols);
        const predColL = col2l(totalCols + 1);
        statusCell = fc(`IF(${predColL}${dataRowExcel}=${aktColL}${dataRowExcel},"BENAR","SALAH")`);
      } else {
        statusCell = pred.correct ? 'BENAR' : 'SALAH';
      }

      rows.push([
        i + 1,
        ...rawVals,
        ...normVals,
        ...kClasses,
        ...kDists,
        ...kWeights,
        aktualVal,
        predVal,
        statusCell
      ]);
    });

    const dataEnd = rows.length - 1;
    const totalCols = 1 + allFeat.length + (r.normType !== 'none' ? allFeat.length : 0) + r.k + r.k + (r.weighting === 'distance' ? r.k : 0);

    _EX[key] = {
      sn: SN,
      dataStart: _EX[key].dataStart,
      dataEnd,
      aktColL: col2l(totalCols),
      predColL: col2l(totalCols + 1),
      statColL: col2l(totalCols + 2)
    };

    addWS(WB, aoaToWS(rows), SN);
  }

  /* ---- S7_Evaluasi ---- */
  _s7_evaluasi(WB, r, fm, _EX) {
    const SN = '7_Evaluasi';
    const rows = [];

    rows.push(['Evaluasi Metrik — Training vs Test']);
    rows.push(['Formula: Precision=TP/(TP+FP) | Recall=TP/(TP+FN) | F1=2*P*R/(P+R) | Macro=AVERAGE(per kelas)']);
    rows.push([]);

    const evalBlock = (metrics, cm, setKey, label) => {
      const sx = _EX[setKey];
      const predSN = sx.sn;
      const dStart = sx.dataStart + 1;
      const dEnd = sx.dataEnd + 1;
      const aktL = sx.aktColL;
      const predL = sx.predColL;
      const statL = sx.statColL;
      const total = metrics.total;

      rows.push([`--- ${label} SET (${total} data) ---`]);
      rows.push([]);

      const accRowIdx = rows.length;
      let benarCell, accCell;
      if (fm) {
        benarCell = fc(`COUNTIF(${xref(predSN, statL + dStart + ':' + statL + dEnd)},"BENAR")`);
        accCell = fc(`B${accRowIdx + 1}/${total}`);
      } else {
        benarCell = metrics.correct;
        accCell = n8(metrics.accuracy);
      }
      rows.push(['Benar', benarCell, '(dari', total, 'data)']);
      rows.push(['Accuracy', accCell]);
      rows.push([]);

      rows.push(['Confusion Matrix (Baris=Aktual | Kolom=Prediksi)']);
      rows.push(['', ...r.classes.map(c => sanitizeFormula(c))]);
      r.classes.forEach(actual => {
        const cmRow = r.classes.map(pred => {
          if (fm) {
            return fc(`COUNTIFS(${xref(predSN, aktL + dStart + ':' + aktL + dEnd)},"${actual}",${xref(predSN, predL + dStart + ':' + predL + dEnd)},"${pred}")`);
          }
          return cm[actual][pred] || 0;
        });
        rows.push([sanitizeFormula(actual), ...cmRow]);
      });
      rows.push([]);

      rows.push(['Metrik Per Kelas:']);
      rows.push(['Kelas', 'TP', 'FP', 'FN', 'Precision', 'Recall', 'F1']);

      const pcDataStart = rows.length;
      const tpColL = col2l(1);
      const fpColL = col2l(2);
      const fnColL = col2l(3);
      const precColL = col2l(4);
      const recColL = col2l(5);
      const f1ColL = col2l(6);

      r.classes.forEach((cls, ci) => {
        const m = metrics.perClass[cls];
        const exRow = pcDataStart + 1 + ci;
        let tpCell, fpCell, fnCell, precCell, recCell, f1Cell;

        if (fm) {
          const aktRng = xref(predSN, `${aktL}${dStart}:${aktL}${dEnd}`);
          const predRng = xref(predSN, `${predL}${dStart}:${predL}${dEnd}`);
          tpCell = fc(`COUNTIFS(${aktRng},"${cls}",${predRng},"${cls}")`);
          fpCell = fc(`COUNTIF(${predRng},"${cls}")-${tpColL}${exRow}`);
          fnCell = fc(`COUNTIF(${aktRng},"${cls}")-${tpColL}${exRow}`);
          precCell = fc(`IF(${tpColL}${exRow}+${fpColL}${exRow}=0,0,${tpColL}${exRow}/(${tpColL}${exRow}+${fpColL}${exRow}))`);
          recCell = fc(`IF(${tpColL}${exRow}+${fnColL}${exRow}=0,0,${tpColL}${exRow}/(${tpColL}${exRow}+${fnColL}${exRow}))`);
          f1Cell = fc(`IF(${precColL}${exRow}+${recColL}${exRow}=0,0,2*${precColL}${exRow}*${recColL}${exRow}/(${precColL}${exRow}+${recColL}${exRow}))`);
        } else {
          tpCell = m.tp;
          fpCell = m.fp;
          fnCell = m.fn;
          precCell = n8(m.precision);
          recCell = n8(m.recall);
          f1Cell = n8(m.f1);
        }
        rows.push([sanitizeFormula(cls), tpCell, fpCell, fnCell, precCell, recCell, f1Cell]);
      });

      const pcDataEnd = rows.length - 1;
      rows.push([]);

      const macroRowIdx = rows.length;
      let macroPrecCell, macroRecCell, macroF1Cell;
      if (fm) {
        const precRange = `${precColL}${pcDataStart + 1}:${precColL}${pcDataEnd + 1}`;
        const recRange = `${recColL}${pcDataStart + 1}:${recColL}${pcDataEnd + 1}`;
        const f1Range = `${f1ColL}${pcDataStart + 1}:${f1ColL}${pcDataEnd + 1}`;
        macroPrecCell = fc(`AVERAGE(${precRange})`);
        macroRecCell = fc(`AVERAGE(${recRange})`);
        macroF1Cell = fc(`AVERAGE(${f1Range})`);
      } else {
        macroPrecCell = n8(metrics.macro.precision);
        macroRecCell = n8(metrics.macro.recall);
        macroF1Cell = n8(metrics.macro.f1);
      }
      rows.push(['Macro Average', '', '', '', macroPrecCell, macroRecCell, macroF1Cell]);
      rows.push([]);

      return {
        accRow: accRowIdx + 1 + 1,
        benarRow: accRowIdx + 1,
        macroRow: macroRowIdx + 1,
        precColL, recColL, f1ColL
      };
    };

    const trainRef = evalBlock(r.trainMetrics, r.trainCM, 's6', 'TRAINING');
    const testRef = evalBlock(r.metrics, r.cm, 's5', 'TEST');

    rows.push(['--- PERBANDINGAN TRAINING vs TEST ---']);
    rows.push(['Metrik', 'Training', 'Test', 'Gap (Train - Test)', 'Interpretasi']);

    const metrics4compare = [
      { label: 'Accuracy', trainFm: `B${trainRef.accRow}`, testFm: `B${testRef.accRow}` },
      { label: 'Macro Precision', trainFm: `E${trainRef.macroRow}`, testFm: `E${testRef.macroRow}` },
      { label: 'Macro Recall', trainFm: `F${trainRef.macroRow}`, testFm: `F${testRef.macroRow}` },
      { label: 'Macro F1', trainFm: `G${trainRef.macroRow}`, testFm: `G${testRef.macroRow}` },
    ];

    const trainVals = [r.trainMetrics.accuracy, r.trainMetrics.macro.precision, r.trainMetrics.macro.recall, r.trainMetrics.macro.f1];
    const testVals = [r.metrics.accuracy, r.metrics.macro.precision, r.metrics.macro.recall, r.metrics.macro.f1];

    metrics4compare.forEach(({ label, trainFm, testFm }, mi) => {
      let trainCell, testCell, gapCell;
      if (fm) {
        trainCell = fc(trainFm);
        testCell = fc(testFm);
        gapCell = fc(`${trainFm}-${testFm}`);
      } else {
        trainCell = n8(trainVals[mi]);
        testCell = n8(testVals[mi]);
        gapCell = n8(trainVals[mi] - testVals[mi]);
      }
      const gap = trainVals[mi] - testVals[mi];
      const interp = gap > 0.15 ? 'Kemungkinan Overfitting' : gap < -0.05 ? 'Periksa data' : 'Generalisasi baik';
      rows.push([label, trainCell, testCell, gapCell, interp]);
    });

    addWS(WB, aoaToWS(rows), SN);
  }

  /* ============================================================
     HELPER METHODS (MATHEMATICAL / ALGORITHMIC)
     ============================================================ */

  _detectNumeric(rows, cols) {
    return cols.filter(c => rows.every(r => r[c] === '' || r[c] == null || !isNaN(parseFloat(r[c]))));
  }

  _detectBoolean(rows, cols) {
    const boolVals = new Set(['true', 'false', 'True', 'False', 'TRUE', 'FALSE', '1', '0']);
    return cols.filter(c => {
      const isNum = rows.every(r => r[c] === '' || r[c] == null || !isNaN(parseFloat(r[c])));
      if (isNum) return false;
      return rows.every(r => r[c] === '' || r[c] == null || boolVals.has(String(r[c]).trim()));
    });
  }

  _detectCategorical(rows, cols) {
    const boolVals = new Set(['true', 'false', 'True', 'False', 'TRUE', 'FALSE', '1', '0']);
    return cols.filter(c => {
      const isNum = rows.every(r => r[c] === '' || r[c] == null || !isNaN(parseFloat(r[c])));
      const isBool = rows.every(r => r[c] === '' || r[c] == null || boolVals.has(String(r[c]).trim()));
      return !isNum && !isBool;
    });
  }

  _parseBool(v) {
    const s = String(v).trim().toLowerCase();
    return (s === 'true' || s === '1') ? 1 : 0;
  }

  _buildLabelEncodings(rows, catCols) {
    const encodings = {};
    catCols.forEach(c => {
      const uniqueVals = [...new Set(rows.map(r => r[c]))]
        .filter(v => v !== '' && v != null)
        .sort();
      const map = {};
      uniqueVals.forEach((v, i) => { map[v] = i; });
      encodings[c] = map;
    });
    return encodings;
  }

  _applyLabelEncoding(rows, encodings) {
    return rows.map(r => {
      const nr = { ...r };
      for (const [col, map] of Object.entries(encodings)) {
        const v = r[col];
        nr[col] = v in map ? map[v] : Object.keys(map).length;
      }
      return nr;
    });
  }

  _euclidean(a, b, cols) {
    let sum = 0;
    for (const c of cols) { const d = a[c] - b[c]; sum += d * d; }
    return Math.sqrt(sum);
  }

  _manhattan(a, b, cols) {
    let sum = 0;
    for (const c of cols) sum += Math.abs(a[c] - b[c]);
    return sum;
  }

  _minkowski(a, b, cols, p) {
    let sum = 0;
    for (const c of cols) sum += Math.pow(Math.abs(a[c] - b[c]), p);
    return Math.pow(sum, 1 / p);
  }

  _calcDist(a, b, cols, metric, p) {
    if (metric === 'euclidean') return this._euclidean(a, b, cols);
    if (metric === 'manhattan') return this._manhattan(a, b, cols);
    if (metric === 'minkowski') return this._minkowski(a, b, cols, p);
    return this._euclidean(a, b, cols);
  }

  _vote(neighbors, classCol, weighting) {
    const tally = {};
    for (const n of neighbors) {
      const cls = n.row[classCol];
      if (!tally[cls]) tally[cls] = 0;
      if (weighting === 'distance') {
        tally[cls] += n.dist === 0 ? 1e9 : 1 / n.dist;
      } else {
        tally[cls] += 1;
      }
    }
    let best = null, bestScore = -Infinity;
    for (const cls of Object.keys(tally).sort()) {
      if (tally[cls] > bestScore) {
        bestScore = tally[cls];
        best = cls;
      }
    }
    return { predicted: best, tally };
  }

  _buildConfusionMatrix(predictions, classes) {
    const cm = {};
    classes.forEach(a => { cm[a] = {}; classes.forEach(p => { cm[a][p] = 0; }); });
    predictions.forEach(({ actual, predicted }) => { if (cm[actual]) cm[actual][predicted]++; });
    return cm;
  }

  _calcMetrics(predictions, classes, cm) {
    const correct = predictions.filter(p => p.correct).length;
    const accuracy = predictions.length === 0 ? 0 : correct / predictions.length;
    const perClass = {};

    classes.forEach(cls => {
      const tp = cm[cls][cls] || 0;
      const fp = classes.reduce((s, a) => a !== cls ? s + (cm[a][cls] || 0) : s, 0);
      const fn = classes.reduce((s, p) => p !== cls ? s + (cm[cls][p] || 0) : s, 0);
      const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
      const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
      const f1 = precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall);
      perClass[cls] = { tp, fp, fn, precision, recall, f1 };
    });

    const macro = {
      precision: classes.reduce((s, c) => s + perClass[c].precision, 0) / classes.length,
      recall: classes.reduce((s, c) => s + perClass[c].recall, 0) / classes.length,
      f1: classes.reduce((s, c) => s + perClass[c].f1, 0) / classes.length
    };

    return { accuracy, correct, total: predictions.length, perClass, macro };
  }

  _predictRow(queryNorm, queryRaw, trainNormSet, trainRawSet, allFeatureCols, classCol, k, metric, p, weighting) {
    const dists = trainNormSet.map((tr, idx) => ({
      idx,
      row: tr,
      rawRow: trainRawSet[idx],
      dist: this._calcDist(queryNorm, tr, allFeatureCols, metric, p)
    }));
    dists.sort((a, b) => a.dist !== b.dist ? a.dist - b.dist : a.idx - b.idx);
    const neighbors = dists.slice(0, k);
    const { predicted, tally } = this._vote(neighbors, classCol, weighting);
    
    return {
      queryRawRow: queryRaw,
      queryNormRow: queryNorm,
      neighbors,
      dists: dists.slice(0, Math.min(k + 3, dists.length)),
      predicted,
      actual: queryRaw[classCol],
      correct: predicted === queryRaw[classCol],
      tally
    };
  }

  _predictSet(normSet, rawSet, trainNorm, trainRaw, allFeatureCols, classCol, k, metric, p, weighting, progressLabel, totalSteps, stepOffset, onProgress) {
    const results = [];
    const n = normSet.length;
    let lastPct = -1;

    for (let i = 0; i < n; i++) {
      results.push(this._predictRow(
        normSet[i], rawSet[i], trainNorm, trainRaw,
        allFeatureCols, classCol, k, metric, p, weighting
      ));

      const pct = Math.floor((stepOffset + (i + 1) / n) / totalSteps * 100);
      const totalPct = Math.floor(50 + (pct / 2)); // Mulai dari 50% setelah preprocessing
      if (totalPct !== lastPct) {
        lastPct = totalPct;
        onProgress(progressLabel, `${progressLabel}: ${i + 1} / ${n} baris`, totalPct);
      }
    }
    return results;
  }
}

// Registrasi plugin ke dalam registry
if (typeof registry !== 'undefined') {
  registry.register(new KNNPlugin());
}
