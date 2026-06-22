/* ============================================================
   knn_render.js — Tampilkan Hasil Lengkap
   Evaluasi: Training + Test ditampilkan berdampingan
   ============================================================ */

   function showResultPage() {
    document.getElementById('page-input').style.display = 'none';
    document.getElementById('page-result').style.display = '';
    window.scrollTo(0, 0);
  }
  function showInputPage() {
    document.getElementById('page-result').style.display = 'none';
    document.getElementById('page-input').style.display = '';
    window.scrollTo(0, 0);
  }
  
  function pct(v)      { return (v * 100).toFixed(2) + '%'; }
  function fmt(v, d=4) { return typeof v === 'number' ? v.toFixed(d) : v; }
  
  // ============================================================
  function renderKNN(r) {
    document.getElementById('result-content').innerHTML = `
      ${renderSummaryHeader(r)}
      ${renderDatasetSection(r)}
      ${renderEncodingSection(r)}
      ${renderNormSection(r)}
      ${renderDistanceSection(r)}
      ${renderPredictionsTable(r, r.predictions,      'Test',     4)}
      ${renderPredictionsTable(r, r.trainPredictions, 'Training', 5)}
      ${renderEvaluasiSection(r)}
      <div class="page-footer" style="margin-bottom:2rem">
        <button class="btn btn-green"    onclick="exportKNN('plain')">&#8659; Download Excel (Plain)</button>
        <button class="btn btn-green"    onclick="exportKNN('formula')" style="background:rgba(52,211,153,0.25)">&#8659; Download Excel (Formula)</button>
        <button class="btn btn-primary"  onclick="showInputPage()">&#8592; Kembali</button>
      </div>
    `;
  }
  
  // ---- 0. Summary header ----
  function renderSummaryHeader(r) {
    const metricLabel = { euclidean:'Euclidean', manhattan:'Manhattan', minkowski:'Minkowski' };
    const normLabel   = { none:'Tanpa Normalisasi', minmax:'Min-Max (0–1)', standard:'Z-Score' };
  
    // Gap indicator: train acc vs test acc
    const gap     = r.trainMetrics.accuracy - r.metrics.accuracy;
    const gapNote = gap > 0.15
      ? `<span style="color:var(--red);font-size:12px">&#9888; Potensi overfitting (gap ${pct(gap)})</span>`
      : gap < -0.05
      ? `<span style="color:var(--yellow);font-size:12px">&#9888; Test lebih tinggi dari train — periksa data</span>`
      : `<span style="color:var(--green);font-size:12px">&#10003; Generalisasi baik (gap ${pct(Math.abs(gap))})</span>`;
  
    return `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:1.5rem">
      <div>
        <h2 class="page-title">K-NN <strong>Results</strong></h2>
        <p class="page-subtitle">K=${r.k} &nbsp;|&nbsp; ${metricLabel[r.metric]} &nbsp;|&nbsp; ${normLabel[r.normType]} &nbsp;|&nbsp; ${r.weighting==='distance'?'Distance-Weighted':'Uniform Voting'}</p>
      </div>
    </div>
  
    <!-- Train vs Test comparison cards -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:1.5rem">
  
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem;border-top:3px solid var(--yellow)">
        <div style="font-size:11px;font-family:var(--mono);color:var(--yellow);letter-spacing:.08em;text-transform:uppercase;margin-bottom:.5rem">Training Set (${r.trainPredictions.length} data)</div>
        <div class="metrics-grid" style="grid-template-columns:repeat(2,1fr);gap:8px">
          <div class="metric-card"><div class="metric-label">Accuracy</div>
            <div class="metric-val" style="color:var(--yellow)">${pct(r.trainMetrics.accuracy)}</div></div>
          <div class="metric-card"><div class="metric-label">Macro F1</div>
            <div class="metric-val" style="color:var(--yellow)">${fmt(r.trainMetrics.macro.f1,4)}</div></div>
          <div class="metric-card"><div class="metric-label">Benar</div>
            <div class="metric-val metric-green">${r.trainMetrics.correct}</div></div>
          <div class="metric-card"><div class="metric-label">Salah</div>
            <div class="metric-val metric-red">${r.trainMetrics.total - r.trainMetrics.correct}</div></div>
        </div>
      </div>
  
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem;border-top:3px solid var(--accent)">
        <div style="font-size:11px;font-family:var(--mono);color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:.5rem">Test Set (${r.predictions.length} data)</div>
        <div class="metrics-grid" style="grid-template-columns:repeat(2,1fr);gap:8px">
          <div class="metric-card"><div class="metric-label">Accuracy</div>
            <div class="metric-val metric-${r.metrics.accuracy>=.7?'green':'red'}">${pct(r.metrics.accuracy)}</div></div>
          <div class="metric-card"><div class="metric-label">Macro F1</div>
            <div class="metric-val metric-blue">${fmt(r.metrics.macro.f1,4)}</div></div>
          <div class="metric-card"><div class="metric-label">Benar</div>
            <div class="metric-val metric-green">${r.metrics.correct}</div></div>
          <div class="metric-card"><div class="metric-label">Salah</div>
            <div class="metric-val metric-red">${r.metrics.total - r.metrics.correct}</div></div>
        </div>
      </div>
  
    </div>
    <div style="text-align:right;margin-top:-1rem;margin-bottom:1.5rem">${gapNote}</div>`;
  }
  
  // ---- 1. Dataset ----
  function renderDatasetSection(r) {
    const classDistHTML = r.classes.map(cls => {
      const n  = r.trainRaw.filter(row => row[classCol] === cls).length;
      const nt = r.testRaw.filter(row  => row[classCol] === cls).length;
      return `<tr><td class="mono">${cls}</td><td class="mono">${n}</td><td class="mono">${nt}</td><td class="mono">${n+nt}</td></tr>`;
    }).join('');
    return `
    <div class="section">
      <div class="section-head"><div class="step-circle">1</div><div class="section-title">Dataset &amp; Split Data</div></div>
      <div class="section-body">
        <div class="info-box">
          Total: <strong>${r.totalRows}</strong> baris &nbsp;|&nbsp;
          Train: <strong>${r.trainRaw.length}</strong> (${pct(r.trainRaw.length/r.totalRows)}) &nbsp;|&nbsp;
          Test: <strong>${r.testRaw.length}</strong> (${pct(r.testRaw.length/r.totalRows)}) &nbsp;|&nbsp;
          LCG Seed: <strong>${r.seed}</strong>
        </div>
        <div style="margin-bottom:.5rem;font-size:13px;color:var(--text2)">
          <strong>Fitur:</strong>
          ${r.featureCols.map(c=>`<span class="chip" style="background:var(--bg4);color:var(--text2);margin:2px">${c} <span style="font-size:11px;color:var(--text3)">${(r.allNumericCols||r.numericCols).includes(c)?'num':'cat'}</span></span>`).join('')}
          &nbsp;<strong>Label:</strong> <span class="chip chip-ok">${classCol}</span>
        </div>
        <div class="sub-title">DISTRIBUSI KELAS (Stratified Split)</div>
        <div class="tbl-wrap-scroll">
          <table>
            <thead><tr><th>Kelas</th><th>Train</th><th>Test</th><th>Total</th></tr></thead>
            <tbody>${classDistHTML}</tbody>
          </table>
        </div>
        <div class="excel-block" style="margin-top:1rem">
          <div class="excel-label">Formula Split</div>
          <div class="exc-row"><span class="exc-cell">n_test</span><span class="exc-formula">=MAX(1, ROUND(n_class × test_ratio, 0))</span><span class="exc-comment">// per kelas (stratified)</span></div>
          <div class="exc-row"><span class="exc-cell">LCG</span><span class="exc-formula">X_(n+1) = (1664525 × X_n + 1013904223) mod 2^32, seed=42</span></div>
        </div>
      </div>
    </div>`;
  }
  
  
  // ---- 2. Label Encoding (jika ada kolom kategoris) ----
  function renderEncodingSection(r) {
    if (!r.labelEncodings || Object.keys(r.labelEncodings).length === 0) {
      return ''; // tidak ada kolom kategoris, skip section ini
    }
  
    const encodings = r.labelEncodings;
    const colNames  = Object.keys(encodings);
  
    const tableRows = colNames.map(col => {
      const map     = encodings[col];
      const entries = Object.entries(map).sort((a, b) => a[1] - b[1]);
      const mapStr  = entries.map(([val, idx]) => `<span class="chip" style="background:var(--bg4);color:var(--text2);margin:2px;font-size:11px">${val} → ${idx}</span>`).join(' ');
      return `<tr>
        <td class="mono">${col}</td>
        <td style="font-size:12px">${mapStr}</td>
        <td class="mono" style="color:var(--text3)">${entries.length} nilai unik</td>
      </tr>`;
    }).join('');
  
    return `
    <div class="section">
      <div class="section-head"><div class="step-circle">2</div><div class="section-title">Label Encoding — Fitur Kategoris</div></div>
      <div class="section-body">
        <div class="info-box">
          <strong>${colNames.length} kolom kategoris</strong> dikonversi ke angka via Label Encoding sebelum perhitungan jarak.
          Encoding dibangun dari <strong>seluruh dataset</strong> (bukan hanya training) agar nilai di test set tidak unknown.
          Urutan: <strong>alfabetis</strong> → konsisten dengan sklearn LabelEncoder.
        </div>
        <div class="tbl-wrap-scroll">
          <table>
            <thead><tr><th>Kolom</th><th>Mapping (Nilai → Angka)</th><th>Info</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
        <div class="excel-block">
          <div class="excel-label">Metode Label Encoding</div>
          <div class="exc-row"><span class="exc-cell">Urutan</span><span class="exc-formula">Alfabetis → 0, 1, 2, ...</span><span class="exc-comment">// sama dengan sklearn LabelEncoder</span></div>
          <div class="exc-row"><span class="exc-cell">Scope</span><span class="exc-formula">Seluruh dataset</span><span class="exc-comment">// agar test set tidak punya nilai unknown</span></div>
          <div class="exc-row"><span class="exc-cell">Setelah encode</span><span class="exc-formula">Kolom kategoris diperlakukan sama seperti numerik</span></div>
        </div>
      </div>
    </div>`;
  }
  
  // ---- 3. Normalisasi ----
  function renderNormSection(r) {
    if (r.normType === 'none') return `
      <div class="section">
        <div class="section-head"><div class="step-circle">2</div><div class="section-title">Normalisasi Fitur</div></div>
        <div class="section-body"><div class="info-box">Normalisasi dinonaktifkan. Nilai fitur digunakan langsung.</div></div>
      </div>`;
  
    const isMinMax = r.normType === 'minmax';
    const _allNormCols = (r.allNumericCols||r.numericCols);
    const statsRows = _allNormCols.map(c => {
      const ns = r.normStats?.[c];
      if (!ns) return '';
      const tipeBadge = (r.boolCols||[]).includes(c)
        ? ' <span style="color:var(--yellow);font-size:10px;font-family:var(--mono)">[bool]</span>'
        : (r.catCols||[]).includes(c)
          ? ' <span style="color:var(--accent);font-size:10px;font-family:var(--mono)">[encoded]</span>'
          : ' <span style="color:var(--text3);font-size:10px;font-family:var(--mono)">[num]</span>';
      if (isMinMax) {
        const { min, max } = ns;
        return `<tr><td class="mono">${c}${tipeBadge}</td><td class="mono">${fmt(min)}</td><td class="mono">${fmt(max)}</td><td class="mono">${fmt(max-min)}</td></tr>`;
      } else {
        const { mean, std } = ns;
        return `<tr><td class="mono">${c}${tipeBadge}</td><td class="mono">${fmt(mean)}</td><td class="mono">${fmt(std)}</td><td></td></tr>`;
      }
    }).filter(Boolean).join('');
  
    return `
    <div class="section">
      <div class="section-head"><div class="step-circle">2</div><div class="section-title">Normalisasi Fitur — ${isMinMax?'Min-Max':'Z-Score'}</div></div>
      <div class="section-body">
        <div class="info-box">Statistik dihitung dari <strong>training set</strong> saja (mencegah data leakage), lalu diterapkan ke train &amp; test.</div>
        <div class="tbl-wrap-scroll">
          <table>
            <thead><tr><th>Kolom &amp; Tipe</th>${isMinMax?'<th>Min</th><th>Max</th><th>Range</th>':'<th>Mean</th><th>Std Dev</th><th></th>'}</tr></thead>
            <tbody>${statsRows}</tbody>
          </table>
        </div>
        <div class="excel-block">
          <div class="excel-label">Formula Normalisasi</div>
          ${isMinMax
            ? `<div class="exc-row"><span class="exc-cell">Min-Max</span><span class="exc-formula">=(x - MIN) / (MAX - MIN)</span><span class="exc-comment">// 0 ≤ x' ≤ 1</span></div>`
            : `<div class="exc-row"><span class="exc-cell">Z-Score</span><span class="exc-formula">=(x - MEAN) / STD</span><span class="exc-comment">// mean=0, std=1</span></div>`
          }
        </div>
        <div class="sub-title">CONTOH 3 BARIS TRAINING SETELAH NORMALISASI</div>
        <div class="tbl-wrap-scroll">
          <table>
            <thead><tr>${(r.allNumericCols||r.numericCols).map(c=>`<th>${c}<br><span style="font-size:11px;opacity:.5">raw/enc→norm</span></th>`).join('')}<th>${classCol}</th></tr></thead>
            <tbody>
              ${r.trainRaw.slice(0,3).map((raw,i)=>`
                <tr>
                  ${(r.allNumericCols||r.numericCols).map(c => {
                    // Nilai raw: untuk kategoris tampilkan teks asli, untuk numerik tampilkan angka
                    const rawDisp = (r.catCols||[]).includes(c)
                      ? raw[c]
                      : (r.boolCols||[]).includes(c)
                        ? raw[c]
                        : fmt(parseFloat(raw[c]),2);
                    return `<td class="mono" style="font-size:12px">${rawDisp} → <strong>${fmt(r.trainNorm[i][c],4)}</strong></td>`;
                  }).join('')}
                  <td class="mono">${raw[classCol]}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }
  
  // ---- 3. Contoh jarak (test row #1) ----
  function renderDistanceSection(r) {
    const pred = r.predictions[0];
    if (!pred) return '';
    const testRow = pred.queryRawRow;
    const metricFormula = {
      euclidean: 'd = √(Σ(xᵢ − yᵢ)²)',
      manhattan: 'd = Σ|xᵢ − yᵢ|',
      minkowski: `d = (Σ|xᵢ − yᵢ|ᵖ)^(1/p), p=${r.p}`
    };
  
    const distRows = pred.dists.map((dn, i) => {
      const isNeighbor = i < r.k;
      return `<tr ${isNeighbor?'class="row-hl"':''}>
        <td class="mono" style="color:var(--text3)">#${i+1}</td>
        <td class="mono">${dn.rawRow[classCol]}</td>
        ${(r.allNumericCols||r.numericCols).map(c => {
          const tv = r.normType!=='none' ? pred.queryNormRow[c] : parseFloat(testRow[c]);
          const nv = r.normType!=='none' ? dn.row[c]           : parseFloat(dn.rawRow[c]);
          return `<td class="mono" style="font-size:12px">${fmt(tv,3)} vs ${fmt(nv,3)}</td>`;
        }).join('')}
        <td class="mono" style="color:var(--accent)">${fmt(dn.dist,6)}</td>
        <td>${isNeighbor?`<span class="chip chip-ok">K${i+1}</span>`:''}</td>
      </tr>`;
    }).join('');
  
    const tallyHTML = Object.entries(pred.tally).sort(([a],[b])=>a.localeCompare(b))
      .map(([cls,score])=>`<tr><td class="mono">${cls}</td><td class="mono">${fmt(score,4)}</td></tr>`).join('');
  
    return `
    <div class="section">
      <div class="section-head"><div class="step-circle">3</div><div class="section-title">Perhitungan Jarak — Contoh Test Row #1</div></div>
      <div class="section-body">
        <div class="info-box">
          <strong>Test Row #1:</strong>
          ${(r.allNumericCols||r.numericCols).map(c=>`<span class="mono" style="margin-right:8px">${c}=${testRow[c]}</span>`).join('')}
          &nbsp;|&nbsp; Aktual: <span class="chip chip-ok">${pred.actual}</span>
        </div>
        <div class="excel-block">
          <div class="excel-label">Formula — ${r.metric}</div>
          <div class="exc-row"><span class="exc-formula">${metricFormula[r.metric]}</span></div>
          ${r.normType!=='none'?`<div class="exc-row"><span class="exc-cell">Catatan</span><span class="exc-comment">Jarak dihitung pada nilai yang sudah dinormalisasi</span></div>`:''}
          ${r.weighting==='distance'?`<div class="exc-row"><span class="exc-cell">Weight</span><span class="exc-formula">w = 1/d</span></div>`:''}
        </div>
        <div class="sub-title">JARAK KE TRAINING (${pred.dists.length} terdekat, ${r.k} dipilih)</div>
        <div class="tbl-wrap-scroll">
          <table>
            <thead><tr><th>Rank</th><th>Kelas</th>${(r.allNumericCols||r.numericCols).map(c=>`<th>${c}</th>`).join('')}<th>Jarak</th><th>Status</th></tr></thead>
            <tbody>${distRows}</tbody>
          </table>
        </div>
        <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:1rem">
          <div>
            <div class="sub-title">VOTING TALLY</div>
            <table>
              <thead><tr><th>Kelas</th><th>${r.weighting==='distance'?'Skor (Σ1/d)':'Jumlah Suara'}</th></tr></thead>
              <tbody>${tallyHTML}</tbody>
            </table>
          </div>
          <div style="display:flex;align-items:center">
            <div class="metric-card" style="min-width:160px">
              <div class="metric-label">Prediksi</div>
              <div class="metric-val metric-blue">${pred.predicted}</div>
              <div style="font-size:12px;margin-top:4px">${pred.correct?'<span class="chip chip-ok">✓ BENAR</span>':'<span class="chip chip-fail">✗ SALAH</span>'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }
  
  // ---- 4/5. Tabel Prediksi (dipakai untuk Train & Test) ----
  function renderPredictionsTable(r, preds, label, stepNum) {
    const rows = preds.map((pred, i) => {
      const nbStr = pred.neighbors.map(n=>`${n.rawRow[classCol]}(${fmt(n.dist,3)})`).join(', ');
      return `<tr>
        <td class="mono" style="color:var(--text3)">${i+1}</td>
        ${(r.allNumericCols||r.numericCols).map(c=>`<td class="mono">${fmt(parseFloat(pred.queryRawRow[c]),2)}</td>`).join('')}
        <td class="mono" style="font-size:12px;max-width:220px;white-space:normal">${nbStr}</td>
        <td class="mono">${pred.actual}</td>
        <td class="mono" style="color:${pred.correct?'var(--green)':'var(--red)'}">${pred.predicted}</td>
        <td>${pred.correct?'<span class="chip chip-ok">✓</span>':'<span class="chip chip-fail">✗</span>'}</td>
      </tr>`;
    }).join('');
  
    const borderColor = label === 'Training' ? 'var(--yellow)' : 'var(--accent)';
    const labelColor  = label === 'Training' ? 'var(--yellow)' : 'var(--accent)';
  
    return `
    <div class="section" style="border-top:3px solid ${borderColor}">
      <div class="section-head">
        <div class="step-circle">${stepNum}</div>
        <div class="section-title">
          Prediksi <span style="color:${labelColor}">${label} Set</span>
          <span style="font-size:12px;color:var(--text3);margin-left:8px">(${preds.length} data)</span>
        </div>
      </div>
      <div class="section-body">
        <div class="tbl-wrap-scroll" style="max-height:360px">
          <table>
            <thead><tr>
              <th>#</th>
              ${(r.allNumericCols||r.numericCols).map(c=>`<th>${c}</th>`).join('')}
              <th>K Tetangga</th>
              <th>Aktual</th><th>Prediksi</th><th>Status</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  }
  
  // ---- 6. Evaluasi — Training + Test berdampingan ----
  function renderEvaluasiSection(r) {
    return `
    <div class="section">
      <div class="section-head"><div class="step-circle">6</div><div class="section-title">Evaluasi Metrik — Training vs Test</div></div>
      <div class="section-body">
  
        ${renderEvalFormulas()}
  
        <!-- Baris: Training + Test berdampingan -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-top:1rem">
          ${renderOneEval(r, r.trainMetrics, r.trainCM, r.trainPredictions, 'Training', 'var(--yellow)')}
          ${renderOneEval(r, r.metrics,      r.cm,      r.predictions,      'Test',     'var(--accent)')}
        </div>
  
        <!-- Perbandingan ringkas -->
        ${renderComparisonTable(r)}
      </div>
    </div>`;
  }
  
  function renderOneEval(r, metrics, cm, preds, label, color) {
    const correct = metrics.correct;
    const total   = metrics.total;
    const wrong   = total - correct;
  
    const cmHeaderRow  = `<tr><th style="background:var(--bg)"></th>${r.classes.map(c=>`<th style="color:${color}">${c}</th>`).join('')}</tr>`;
    const cmBodyRows   = r.classes.map(actual => {
      const cells = r.classes.map(pred => {
        const v = cm[actual][pred] || 0;
        const isTP = actual === pred;
        return `<td class="mono" style="${isTP?`background:rgba(52,211,153,0.12);color:var(--green);font-weight:600`:v>0?'color:var(--red)':'color:var(--text3)'}">${v}</td>`;
      }).join('');
      return `<tr><th style="color:var(--text2)">${actual}</th>${cells}</tr>`;
    }).join('');
  
    const perClassRows = r.classes.map(cls => {
      const m = metrics.perClass[cls];
      return `<tr>
        <td class="mono">${cls}</td>
        <td class="mono">${m.tp}</td><td class="mono">${m.fp}</td><td class="mono">${m.fn}</td>
        <td class="mono" style="color:var(--accent)">${pct(m.precision)}</td>
        <td class="mono" style="color:var(--yellow)">${pct(m.recall)}</td>
        <td class="mono" style="color:var(--green)">${pct(m.f1)}</td>
      </tr>`;
    }).join('');
  
    return `
    <div style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
      <div style="background:var(--bg3);padding:.65rem 1rem;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
        <span style="width:10px;height:10px;border-radius:2px;background:${color};display:inline-block;flex-shrink:0"></span>
        <span style="font-weight:600;font-size:14px;color:${color}">${label} Set</span>
        <span style="font-size:12px;color:var(--text3);margin-left:4px">(${total} data)</span>
      </div>
      <div style="padding:.9rem 1rem">
  
        <!-- Accuracy bar -->
        <div style="margin-bottom:.75rem">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:4px">
            <span>Accuracy</span><span style="color:${color};font-weight:700">${pct(metrics.accuracy)}</span>
          </div>
          <div style="height:8px;border-radius:4px;background:var(--bg4);overflow:hidden">
            <div style="height:100%;width:${pct(metrics.accuracy)};background:${color};border-radius:4px;transition:width .4s"></div>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:3px">${correct} benar / ${wrong} salah</div>
        </div>
  
        <!-- Macro cards -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:.85rem">
          <div class="metric-card" style="padding:.5rem .7rem">
            <div class="metric-label" style="font-size:10px">Macro Prec</div>
            <div style="font-size:16px;font-weight:600;color:var(--accent)">${pct(metrics.macro.precision)}</div>
          </div>
          <div class="metric-card" style="padding:.5rem .7rem">
            <div class="metric-label" style="font-size:10px">Macro Recall</div>
            <div style="font-size:16px;font-weight:600;color:var(--yellow)">${pct(metrics.macro.recall)}</div>
          </div>
          <div class="metric-card" style="padding:.5rem .7rem">
            <div class="metric-label" style="font-size:10px">Macro F1</div>
            <div style="font-size:16px;font-weight:600;color:var(--green)">${pct(metrics.macro.f1)}</div>
          </div>
        </div>
  
        <!-- Confusion Matrix -->
        <div class="sub-title" style="margin-top:0">CONFUSION MATRIX</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:.4rem">Baris=Aktual, Kolom=Prediksi</div>
        <div class="tbl-wrap-scroll" style="margin-bottom:.85rem">
          <table>${cmHeaderRow}${cmBodyRows}</table>
        </div>
  
        <!-- Per-class -->
        <div class="sub-title">PER KELAS</div>
        <div class="tbl-wrap-scroll">
          <table>
            <thead><tr><th>Kelas</th><th>TP</th><th>FP</th><th>FN</th><th>Prec</th><th>Recall</th><th>F1</th></tr></thead>
            <tbody>${perClassRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  }
  
  function renderComparisonTable(r) {
    const trainAcc = r.trainMetrics.accuracy;
    const testAcc  = r.metrics.accuracy;
    const gap      = trainAcc - testAcc;
    const gapColor = Math.abs(gap) > 0.15 ? 'var(--red)' : Math.abs(gap) > 0.05 ? 'var(--yellow)' : 'var(--green)';
  
    const rows = [
      ['Accuracy',       pct(trainAcc),                         pct(testAcc),                         pct(gap)],
      ['Macro Precision',pct(r.trainMetrics.macro.precision),   pct(r.metrics.macro.precision),        pct(r.trainMetrics.macro.precision - r.metrics.macro.precision)],
      ['Macro Recall',   pct(r.trainMetrics.macro.recall),      pct(r.metrics.macro.recall),           pct(r.trainMetrics.macro.recall    - r.metrics.macro.recall)],
      ['Macro F1',       pct(r.trainMetrics.macro.f1),          pct(r.metrics.macro.f1),               pct(r.trainMetrics.macro.f1        - r.metrics.macro.f1)],
      ['Total Data',     String(r.trainMetrics.total),          String(r.metrics.total),               '—'],
      ['Benar',          String(r.trainMetrics.correct),        String(r.metrics.correct),             '—'],
    ].map(([m, tr, te, diff]) =>
      `<tr><td class="mono">${m}</td>
           <td class="mono" style="color:var(--yellow)">${tr}</td>
           <td class="mono" style="color:var(--accent)">${te}</td>
           <td class="mono" style="color:${gapColor}">${diff}</td>
      </tr>`).join('');
  
    return `
    <div style="margin-top:1.25rem">
      <div class="sub-title">PERBANDINGAN RINGKAS</div>
      <div class="tbl-wrap-scroll">
        <table>
          <thead><tr>
            <th>Metrik</th>
            <th style="color:var(--yellow)">Training</th>
            <th style="color:var(--accent)">Test</th>
            <th>Gap (Train−Test)</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="font-size:12px;color:var(--text3);margin-top:.5rem">
        Gap besar (>15%) → kemungkinan <strong>overfitting</strong>. 
        Gap kecil atau negatif → model <strong>generalisasi baik</strong>.
      </div>
    </div>`;
  }
  
  function renderEvalFormulas() {
    return `
    <div class="excel-block" style="margin-bottom:0">
      <div class="excel-label">Formula Metrik</div>
      <div class="exc-row"><span class="exc-cell">Accuracy</span>  <span class="exc-formula">= Total Benar / Total Data</span></div>
      <div class="exc-row"><span class="exc-cell">Precision</span> <span class="exc-formula">= TP / (TP + FP)</span></div>
      <div class="exc-row"><span class="exc-cell">Recall</span>    <span class="exc-formula">= TP / (TP + FN)</span></div>
      <div class="exc-row"><span class="exc-cell">F1</span>        <span class="exc-formula">= 2 × Precision × Recall / (Precision + Recall)</span></div>
      <div class="exc-row"><span class="exc-cell">Macro</span>     <span class="exc-formula">= rata-rata nilai per kelas (tanpa pembobotan)</span></div>
    </div>`;
  }