// ============================================================
//  js/LinearRegression/lr_main.js
//  Controller utama — linear_regression.html
// ============================================================

// ── State ────────────────────────────────────────────────────
const LR_STATE = {
  rawRows    : [],
  headers    : [],
  numericCols: [],
  targetCol  : null,
  featureCols: [],
  trainRows  : [],
  testRows   : [],
  model      : null,
};

// ── Sample Datasets ──────────────────────────────────────────
const SAMPLES = {
  rumah: {
    name: 'Harga Rumah',
    csv: `Luas_m2,Kamar,Jarak_Pusat_km,Harga_Juta
45,2,12,320
60,3,8,450
72,3,5,520
85,4,4,610
90,4,3,680
55,2,10,390
100,5,2,750
48,2,15,290
78,3,6,540
95,4,2,720
63,3,9,470
110,5,1,810`
  },
  iklan: {
    name: 'Iklan vs Penjualan',
    csv: `TV_juta,Radio_juta,Koran_juta,Penjualan_unit
230,37,69,22
44,39,45,10
17,46,69,9
152,41,58,18
181,10,58,12
8,48,75,8
57,32,23,11
120,19,11,13
8,2,1,4
199,2,2,15
66,20,14,11
214,24,4,17`
  }
};

// ── Input Mode Toggle ────────────────────────────────────────
function setInputMode(mode) {
  document.getElementById('upload-panel').style.display  = mode === 'upload' ? '' : 'none';
  document.getElementById('manual-panel').style.display  = mode === 'manual' ? '' : 'none';
  document.getElementById('btn-mode-upload').className   = 'btn btn-sm' + (mode === 'upload' ? ' btn-primary' : '');
  document.getElementById('btn-mode-manual').className   = 'btn btn-sm' + (mode === 'manual' ? ' btn-primary' : '');
}

// ── File Upload ──────────────────────────────────────────────
document.getElementById('csv-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => handleCSV(ev.target.result, file.name);
  reader.readAsText(file);
});

const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent)'; });
dropZone.addEventListener('dragleave', ()  => { dropZone.style.borderColor = ''; });
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if (!file || !file.name.endsWith('.csv')) return;
  const reader = new FileReader();
  reader.onload = ev => handleCSV(ev.target.result, file.name);
  reader.readAsText(file);
});

function loadSample(key) {
  const s = SAMPLES[key];
  if (!s) return;
  handleCSV(s.csv, s.name + '.csv');
}

function handleCSV(text, filename) {
  try {
    const { headers, rows } = parseCSV(text);
    const numCols = detectNumericCols(headers, rows);
    if (numCols.length < 2) throw new Error('Minimal 2 kolom numerik diperlukan.');

    LR_STATE.rawRows     = rows;
    LR_STATE.headers     = headers;
    LR_STATE.numericCols = numCols;
    LR_STATE.targetCol   = numCols[numCols.length - 1];
    LR_STATE.featureCols = numCols.slice(0, -1);

    showPreview(rows, headers, filename, numCols.length);
    populateTargetSelect(numCols, LR_STATE.targetCol);
    renderFeaturePills();
    updateModeLabel();
    updateSplitEstimate();
    document.getElementById('preview-section').style.display = '';
    document.getElementById('preview-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    document.getElementById('preview-warn').innerHTML =
      `<div class="warn-box" style="margin-top:0.5rem">&#9888; ${err.message}</div>`;
  }
}

// ── Preview Table ────────────────────────────────────────────
function showPreview(rows, headers, filename, numericCount) {
  const info = document.getElementById('preview-info');
  info.innerHTML = `
    <div class="success-box">
      &#10003; <strong>${filename}</strong> dimuat &mdash;
      ${rows.length} baris, ${headers.length} kolom
      (${numericCount} numerik)
    </div>`;

  const maxRows = 8;
  const tbl = document.getElementById('preview-table');
  const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${
    rows.slice(0, maxRows).map(r =>
      `<tr>${headers.map(h => `<td class="mono">${r[h]}</td>`).join('')}</tr>`
    ).join('') +
    (rows.length > maxRows
      ? `<tr><td colspan="${headers.length}" style="color:var(--text3);text-align:center;font-size:13px">
           … ${rows.length - maxRows} baris lainnya tidak ditampilkan</td></tr>`
      : '')
  }</tbody>`;
  tbl.innerHTML = thead + tbody;
}

// ── Target Select ────────────────────────────────────────────
function populateTargetSelect(numericCols, selected) {
  const sel = document.getElementById('target-col');
  sel.innerHTML = numericCols.map(c =>
    `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`
  ).join('');
}

function onTargetChange() {
  LR_STATE.targetCol   = document.getElementById('target-col').value;
  LR_STATE.featureCols = LR_STATE.numericCols.filter(c => c !== LR_STATE.targetCol);
  renderFeaturePills();
  updateModeLabel();
}

// ── Feature Pills ────────────────────────────────────────────
function renderFeaturePills() {
  const wrap = document.getElementById('feature-checkboxes');
  wrap.innerHTML = '';
  LR_STATE.numericCols.forEach(c => {
    if (c === LR_STATE.targetCol) return;
    const checked = LR_STATE.featureCols.includes(c);
    const pill = document.createElement('label');
    pill.className = 'col-pill' + (checked ? ' checked' : '');
    pill.innerHTML = `
      <input type="checkbox" value="${c}" ${checked ? 'checked' : ''}>
      <span class="pill-icon">&#9670;</span>
      <span>${c}</span>
    `;
    pill.querySelector('input').addEventListener('change', e => {
      pill.classList.toggle('checked', e.target.checked);
      syncFeatures();
      updateModeLabel();
      checkFeatureWarn();
    });
    wrap.appendChild(pill);
  });
}

function syncFeatures() {
  LR_STATE.featureCols = [...document.querySelectorAll('#feature-checkboxes input:checked')]
    .map(i => i.value);
}

function setAllFeatures(state) {
  document.querySelectorAll('#feature-checkboxes input[type=checkbox]').forEach(cb => {
    cb.checked = state;
    cb.closest('.col-pill').classList.toggle('checked', state);
  });
  syncFeatures();
  updateModeLabel();
  checkFeatureWarn();
}

function checkFeatureWarn() {
  const el = document.getElementById('feature-warn');
  if (LR_STATE.featureCols.length === 0) {
    el.innerHTML = `<div class="warn-box" style="margin-top:0.5rem">&#9888; Pilih minimal 1 fitur.</div>`;
  } else {
    el.innerHTML = '';
  }
}

function updateModeLabel() {
  const lbl = document.getElementById('mode-label');
  if (!lbl) return;
  const n = LR_STATE.featureCols.length;
  if (n === 0) {
    lbl.textContent = '—'; lbl.className = 'chip';
  } else if (n === 1) {
    lbl.textContent = 'Sederhana (1 fitur)';
    lbl.className   = 'chip chip-ok';
  } else {
    lbl.textContent = `Berganda (${n} fitur)`;
    lbl.className   = 'chip';
    lbl.style.cssText = 'background:rgba(79,156,249,0.12);color:var(--accent);border:1px solid rgba(79,156,249,0.3)';
  }
  const hint = document.getElementById('reg-hint');
  if (hint) hint.style.display = n >= 2 ? '' : 'none';
}

// ── Regularisasi ──────────────────────────────────────────────
function onRegChange(radio) {
  document.querySelectorAll('.radio-label').forEach(l => l.classList.remove('selected'));
  radio.closest('.radio-label').classList.add('selected');
  const show = radio.value === 'ridge' || radio.value === 'lasso';
  document.getElementById('lambda-wrap').style.display = show ? 'flex' : 'none';
}

// ── Split Slider ─────────────────────────────────────────────
function updateSplitSlider(val) {
  const pct = parseInt(val);
  const testPct = 100 - pct;
  document.getElementById('split-bar-train').style.width      = pct + '%';
  document.getElementById('split-bar-test').style.width       = testPct + '%';
  document.getElementById('split-label-train-bar').textContent = pct + '%';
  document.getElementById('split-label-test-bar').textContent  = testPct + '%';
  document.getElementById('split-label-train').textContent     = pct + '%';
  document.getElementById('split-label-test').textContent      = testPct + '%';
  updateSplitEstimate();
}

function updateSplitEstimate() {
  const pct   = parseInt(document.getElementById('split-slider')?.value || 80);
  const n     = LR_STATE.rawRows.length;
  if (!n) return;
  const ratio  = (100 - pct) / 100;
  const nTest  = Math.max(1, Math.round(n * ratio));
  const nTrain = n - nTest;
  document.getElementById('split-est-rows').textContent =
    `≈ ${nTrain} train | ${nTest} test (total ${n})`;
}

// ── Manual Table ──────────────────────────────────────────────
function buildManualTable() {
  const nRows   = parseInt(document.getElementById('manual-nrows').value)  || 10;
  const nFeats  = parseInt(document.getElementById('manual-nfeats').value) || 1;
  const tgtName = document.getElementById('manual-target-name').value.trim() || 'Y';
  const feats   = Array.from({ length: nFeats }, (_, i) => `X${i + 1}`);
  const allCols = [...feats, tgtName];

  LR_STATE.headers     = allCols;
  LR_STATE.numericCols = allCols;
  LR_STATE.targetCol   = tgtName;
  LR_STATE.featureCols = feats;

  const head = `<table><thead><tr>${allCols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>`;
  const body = Array.from({ length: nRows }, (_, i) =>
    `<tr>${allCols.map(c =>
      `<td><input type="number" step="any" value="0"
        style="width:80px;background:var(--bg4);border:1px solid var(--border);border-radius:4px;
               color:var(--text);font-family:var(--mono);font-size:13px;padding:4px 6px;outline:none;
               text-align:center;"
        data-row="${i}" data-col="${c}">`
    ).join('')}</tr>`
  ).join('');

  document.getElementById('manual-table-wrap').innerHTML = head + body + '</tbody></table>';
  document.getElementById('btn-load-manual').style.display = '';
}

function loadManualData() {
  const inputs = document.querySelectorAll('#manual-table-wrap input');
  const nCols  = LR_STATE.headers.length;
  const nRows  = inputs.length / nCols;
  const rows   = [];

  for (let i = 0; i < nRows; i++) {
    const row = {};
    LR_STATE.headers.forEach((c, j) => {
      row[c] = parseFloat(inputs[i * nCols + j].value) || 0;
    });
    rows.push(row);
  }

  LR_STATE.rawRows = rows;
  showPreview(rows, LR_STATE.headers, 'Input Manual', LR_STATE.headers.length);
  updateSplitEstimate();
  document.getElementById('preview-section').style.display = '';
  populateTargetSelect(LR_STATE.numericCols, LR_STATE.targetCol);
  renderFeaturePills();
  updateModeLabel();
  document.getElementById('preview-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Overlay helpers ───────────────────────────────────────────
function showOverlay(message = 'Memproses...') {
  let ov = document.getElementById('lr-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'lr-overlay';
    ov.innerHTML = `
      <div class="lr-overlay-box">
        <div class="lr-overlay-spinner"></div>
        <div class="lr-overlay-label" id="lr-overlay-label">${message}</div>
        <div class="lr-overlay-bar-wrap">
          <div class="lr-overlay-bar" id="lr-overlay-bar" style="width:0%"></div>
        </div>
        <div class="lr-overlay-pct" id="lr-overlay-pct">0%</div>
      </div>
    `;
    document.body.appendChild(ov);
  }
  ov.style.display = 'flex';
  updateOverlay(0, message);
}
function updateOverlay(pct, message) {
  const bar   = document.getElementById('lr-overlay-bar');
  const label = document.getElementById('lr-overlay-label');
  const pctEl = document.getElementById('lr-overlay-pct');
  if (bar)   bar.style.width   = pct + '%';
  if (label) label.textContent = message;
  if (pctEl) pctEl.textContent = pct + '%';
}
function hideOverlay() {
  const ov = document.getElementById('lr-overlay');
  if (ov) ov.style.display = 'none';
}

// ── Process — pakai Web Worker ────────────────────────────────
function processLR() {
  syncFeatures();
  if (LR_STATE.featureCols.length === 0) {
    checkFeatureWarn(); return;
  }

  const trainPct  = parseInt(document.getElementById('split-slider').value) / 100;
  const testRatio = 1 - trainPct;
  const seed      = parseInt(document.getElementById('lcg-seed').value) || 42;
  const reg       = document.querySelector('input[name="reg"]:checked').value;
  const lambda    = parseFloat(document.getElementById('lambda-val').value) || 0.01;

  showOverlay('Mempersiapkan data...');

  // Buat worker dari file lr_worker.js
  // Path relatif mengikuti struktur project (sesuaikan jika perlu)
  const workerPath = '../js/LinearRegression/lr_worker.js';
  let worker;
  try {
    worker = new Worker(workerPath);
  } catch (e) {
    hideOverlay();
    alert('Gagal memuat worker: ' + e.message);
    return;
  }

  worker.onmessage = function (e) {
    const { type, pct, message, result } = e.data;

    if (type === 'PROGRESS') {
      updateOverlay(pct, message);
      return;
    }

    if (type === 'DONE') {
      updateOverlay(100, 'Selesai! Menampilkan hasil...');
      setTimeout(() => {
        hideOverlay();
        worker.terminate();

        // Simpan ke state
        LR_STATE.model     = result.model;
        LR_STATE.trainRows = result.trainRows;
        LR_STATE.testRows  = result.testRows;

        renderResultPage(result.model, result.trainRows, result.testRows, result.testMetrics);
      }, 300);
      return;
    }

    if (type === 'ERROR') {
      hideOverlay();
      worker.terminate();
      alert('Error: ' + message);
    }
  };

  worker.onerror = function (e) {
    hideOverlay();
    worker.terminate();
    alert('Worker error: ' + e.message);
  };

  // Kirim payload ke worker
  worker.postMessage({
    type: 'RUN',
    payload: {
      rawRows:     LR_STATE.rawRows,
      numericCols: LR_STATE.numericCols,
      featureCols: LR_STATE.featureCols,
      targetCol:   LR_STATE.targetCol,
      testRatio,
      seed,
      reg,
      lambda,
    }
  });
}

// ── Result Page Builder ───────────────────────────────────────
function renderResultPage(model, trainRows, testRows, testMetrics) {
  const rc = document.getElementById('result-content');

  // Jika testMetrics tidak dikirim (fallback), hitung di sini
  if (!testMetrics) {
    testMetrics = calcMetrics(
      testRows.map(r => r[model.target]),
      testRows.map(r => predictLR(model, r)),
      model.yMean
    );
  }

  rc.innerHTML = `
    <!-- Judul + back -->
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:1.5rem;">
      <div>
        <h2 class="page-title" style="font-size:28px;">Hasil <strong>Linear Regression</strong></h2>
        <p class="page-subtitle" style="margin-bottom:0;">${equationString(model)}</p>
      </div>
      <button class="btn btn-sm" onclick="resetInput()">&#8592; Kembali &amp; Reset</button>
    </div>

    <!-- SECTION 1: Persamaan -->
    <div class="section">
      <div class="section-head">
        <div class="step-circle">1</div>
        <div class="section-title">Persamaan Regresi</div>
      </div>
      <div class="section-body">
        <div id="r-equation"></div>
        <div id="r-coef-table" style="margin-top:0.75rem;"></div>
      </div>
    </div>

    <!-- SECTION 2: Perhitungan Manual -->
    <div class="section">
      <div class="section-head">
        <div class="step-circle">2</div>
        <div class="section-title">Perhitungan Manual</div>
      </div>
      <div class="section-body">

        <!-- FIX #1: Formula Excel yang bisa disalin -->
        <div class="excel-block">
          <div class="excel-label" style="display:flex;align-items:center;justify-content:space-between;">
            <span>Formula Excel</span>
            <button class="btn btn-sm" onclick="copyExcelFormulas()" style="font-size:11px;padding:3px 10px;">
              &#128203; Salin Semua Formula
            </button>
          </div>
          <div id="r-formula-block"></div>
        </div>

        <!-- FIX #3: Tab Train & Test — keduanya berisi tabel kalkulasi -->
        <div class="tab-bar" style="margin-top:1rem;">
          <button class="tab-btn active" onclick="switchTab('train', this)">
            &#128200; Data Train (${trainRows.length} baris)
          </button>
          <button class="tab-btn" onclick="switchTab('test', this)">
            &#128202; Data Test (${testRows.length} baris)
          </button>
        </div>
        <div id="tab-train" class="tab-pane active">
          <div id="r-calc-train"></div>
        </div>
        <div id="tab-test" class="tab-pane">
          <div id="r-calc-test"></div>
        </div>

      </div>
    </div>

    <!-- SECTION 3: Visualisasi -->
    <div class="section">
      <div class="section-head">
        <div class="step-circle">3</div>
        <div class="section-title" id="r-plot-title">Visualisasi</div>
      </div>
      <div class="section-body">
        <div id="r-scatter-plot"></div>
      </div>
    </div>

    <!-- SECTION 4: Evaluasi Metrik — FIX #5: Train + Test -->
    <div class="section">
      <div class="section-head">
        <div class="step-circle">4</div>
        <div class="section-title">Evaluasi Metrik</div>
      </div>
      <div class="section-body">

        <!-- Tab Train / Test untuk Metrik -->
        <div class="tab-bar">
          <button class="tab-btn active" id="metric-tab-train-btn"
                  onclick="switchMetricTab('train', this)">
            &#128200; Train (${trainRows.length} baris)
          </button>
          <button class="tab-btn" id="metric-tab-test-btn"
                  onclick="switchMetricTab('test', this)">
            &#128202; Test (${testRows.length} baris)
          </button>
        </div>

        <div id="metric-tab-train" class="tab-pane active">
          <div id="r-metrics-train"></div>
          <div class="excel-block" style="margin-top:0.75rem;">
            <div class="excel-label">Formula Metrik (Train)</div>
            <div id="r-metrics-formula-train"></div>
          </div>
        </div>
        <div id="metric-tab-test" class="tab-pane">
          <div id="r-metrics-test"></div>
          <div class="excel-block" style="margin-top:0.75rem;">
            <div class="excel-label">Formula Metrik (Test)</div>
            <div id="r-metrics-formula-test"></div>
          </div>
        </div>

      </div>
    </div>

    <!-- SECTION 5: Prediksi Nilai Baru -->
    <div class="section">
      <div class="section-head">
        <div class="step-circle">5</div>
        <div class="section-title">Prediksi Nilai Baru</div>
      </div>
      <div class="section-body">
        <div class="info-box" style="font-size:17px">
          Masukkan nilai fitur untuk mendapatkan prediksi &ycirc; dari model.
        </div>
        <div id="r-pred-inputs" class="pred-input-grid" style="margin-top:0.75rem;"></div>
        <button class="btn btn-primary btn-sm" style="margin-top:0.5rem" onclick="doManualPredict()">
          &#9654; Prediksi
        </button>
        <div id="r-pred-result"></div>
      </div>
    </div>

    <!-- Footer -->
    <div class="page-footer">
      <button class="btn" onclick="resetInput()">&#8592; Kembali &amp; Reset</button>
      <button class="btn btn-green" onclick="exportExcel(LR_STATE.model, LR_STATE.trainRows, LR_STATE.testRows)">
        &#8659; Export Excel
      </button>
    </div>
  `;

  // Switch page
  document.getElementById('page-input').style.display  = 'none';
  document.getElementById('page-result').style.display = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // ── Isi konten ────────────────────────────────────────────
  renderEquation(model);
  if (model.mode === 'multiple') renderCoefTable(model, 'r-coef-table');

  // Formula Excel
  renderFormulaBlock(model, 'r-formula-block', trainRows);

  // Isi KEDUA tab — train dan test (dengan pagination)
  LR_PAGINATION.trainPage = 1;
  LR_PAGINATION.testPage  = 1;
  renderCalcTablePaged('r-calc-train', 'train');
  renderCalcTablePaged('r-calc-test',  'test');

  // FIX #4: Plot lebih besar
  const plotTitle = model.mode === 'simple'
    ? `Scatter Plot: ${model.feats[0]} vs ${model.target}`
    : `Actual vs Predicted — ${model.target}`;
  document.getElementById('r-plot-title').textContent = plotTitle;
  renderScatterPlot(model, 'r-scatter-plot');

  // FIX #5: Metrik Train + Test
  renderMetrics(model.metrics, 'r-metrics-train');
  renderMetricsFormula(model.metrics, model.n, 'r-metrics-formula-train', 'Train');
  renderMetrics(testMetrics, 'r-metrics-test');
  renderMetricsFormula(testMetrics, testRows.length, 'r-metrics-formula-test', 'Test');

  buildPredInputs(model, 'r-pred-inputs');
}

// ── Formula Excel Block — FIX #1 ─────────────────────────────
// Menampilkan formula Excel lengkap per tahap, bisa disalin
function renderFormulaBlock(model, containerId, trainRows) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const n     = trainRows.length;
  const feat0 = model.feats[0];
  const tgt   = model.target;

  // Asumsi kolom Excel: A=no, B=x (atau fitur1), C=y (target)
  // Data mulai baris 2
  const dataStart = 2;
  const dataEnd   = dataStart + n - 1;
  const colX      = 'B';  // fitur pertama
  const colY      = model.mode === 'simple' ? 'C' : 'C';

  if (model.mode === 'simple') {
    // Kolom: A=#, B=x, C=y, D=x-xBar, E=y-yBar, F=(x-xBar)^2, G=(x-xBar)(y-yBar), H=yHat, I=resid, J=resid^2
    const xBarFormula  = `=AVERAGE(${colX}${dataStart}:${colX}${dataEnd})`;
    const yBarFormula  = `=AVERAGE(${colY}${dataStart}:${colY}${dataEnd})`;
    const sumXDevSq    = `=SUMPRODUCT(D${dataStart}:D${dataEnd},D${dataStart}:D${dataEnd})`;
    const sumCrossDevF = `=SUMPRODUCT(D${dataStart}:D${dataEnd},E${dataStart}:E${dataEnd})`;
    const slopeF       = `=G${dataEnd+3}/F${dataEnd+3}`;
    const interceptF   = `=C${dataEnd+2}-H${dataEnd+4}*B${dataEnd+2}`;
    const yHatF        = `=($intercept$+$slope$*${colX}2)`;  // template

    el.innerHTML = `
      <div class="exc-section-label">📋 Langkah 1 — Hitung Mean</div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" title="Klik untuk salin" onclick="copyText(this)">${xBarFormula}</span>
        <span class="exc-comment">// x̄ — mean ${feat0}. Letakkan di sel bebas.</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" title="Klik untuk salin" onclick="copyText(this)">${yBarFormula}</span>
        <span class="exc-comment">// ȳ — mean ${tgt}</span>
      </div>

      <div class="exc-section-label" style="margin-top:0.6rem;">📋 Langkah 2 — Kolom Deviasi (isi per baris, mulai D2)</div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=B2-AVERAGE($B$${dataStart}:$B$${dataEnd})</span>
        <span class="exc-comment">// Kolom D: x − x̄ (drag ke bawah)</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=C2-AVERAGE($C$${dataStart}:$C$${dataEnd})</span>
        <span class="exc-comment">// Kolom E: y − ȳ (drag ke bawah)</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=D2^2</span>
        <span class="exc-comment">// Kolom F: (x−x̄)² (drag ke bawah)</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=D2*E2</span>
        <span class="exc-comment">// Kolom G: (x−x̄)(y−ȳ) (drag ke bawah)</span>
      </div>

      <div class="exc-section-label" style="margin-top:0.6rem;">📋 Langkah 3 — Hitung Slope & Intercept</div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">${sumXDevSq}</span>
        <span class="exc-comment">// Σ(x−x̄)² = ${fmt(model.sxx, 6)}</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">${sumCrossDevF}</span>
        <span class="exc-comment">// Σ(x−x̄)(y−ȳ) = ${fmt(model.sxy, 6)}</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=SUMPRODUCT(D${dataStart}:D${dataEnd},E${dataStart}:E${dataEnd})/SUMPRODUCT(D${dataStart}:D${dataEnd},D${dataStart}:D${dataEnd})</span>
        <span class="exc-comment">// b (slope) = ${fmt(model.slope, 6)}</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=AVERAGE(C${dataStart}:C${dataEnd})-(slope_cell)*AVERAGE(B${dataStart}:B${dataEnd})</span>
        <span class="exc-comment">// a (intercept) = ${fmt(model.intercept, 6)}</span>
      </div>

      <div class="exc-section-label" style="margin-top:0.6rem;">📋 Langkah 4 — Kolom ŷ & Residual</div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=${fmt(model.intercept,6)}+${fmt(model.slope,6)}*B2</span>
        <span class="exc-comment">// Kolom H: ŷ — pakai nilai koefisien langsung (drag ke bawah)</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=C2-H2</span>
        <span class="exc-comment">// Kolom I: e = y − ŷ (drag ke bawah)</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=I2^2</span>
        <span class="exc-comment">// Kolom J: e² (drag ke bawah)</span>
      </div>

      <div class="exc-section-label" style="margin-top:0.6rem;">📋 Langkah 5 — Metrik Evaluasi</div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=1-SUMPRODUCT(I${dataStart}:I${dataEnd},I${dataStart}:I${dataEnd})/SUMPRODUCT((C${dataStart}:C${dataEnd}-AVERAGE(C${dataStart}:C${dataEnd}))^2)</span>
        <span class="exc-comment">// R² = ${fmt(model.metrics.r2, 6)}</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=SUMPRODUCT(I${dataStart}:I${dataEnd},I${dataStart}:I${dataEnd})/${n}</span>
        <span class="exc-comment">// MSE = ${fmt(model.metrics.mse, 6)}</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=SQRT(SUMPRODUCT(I${dataStart}:I${dataEnd},I${dataStart}:I${dataEnd})/${n})</span>
        <span class="exc-comment">// RMSE = ${fmt(model.metrics.rmse, 6)}</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=SUMPRODUCT(ABS(I${dataStart}:I${dataEnd}))/${n}</span>
        <span class="exc-comment">// MAE = ${fmt(model.metrics.mae, 6)}</span>
      </div>
      <div class="info-box" style="margin-top:0.5rem;font-size:12px;">
        💡 Klik tiap formula untuk menyalin, atau klik tombol <strong>Salin Semua Formula</strong> di atas.
      </div>
    `;
  } else {
    // Berganda: tampilkan koefisien + formula prediksi
    const featCols = model.feats.map((f, j) => String.fromCharCode(66 + j)); // B, C, D, ...
    const yCol     = String.fromCharCode(66 + model.feats.length);           // kolom setelah fitur terakhir

    const yHatParts = model.feats.map((f, j) =>
      `+${fmt(model.slopes[j],6)}*${featCols[j]}2`
    ).join('');

    el.innerHTML = `
      <div class="exc-section-label">📋 Langkah 1 — Koefisien (Normal Equation / β)</div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">${fmt(model.intercept, 6)}</span>
        <span class="exc-comment">// a (intercept)</span>
      </div>
      ${model.feats.map((f, j) => `
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">${fmt(model.slopes[j], 6)}</span>
        <span class="exc-comment">// b${j+1} — koefisien ${f}</span>
      </div>`).join('')}

      <div class="exc-section-label" style="margin-top:0.6rem;">📋 Langkah 2 — Kolom ŷ (prediksi)</div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=${fmt(model.intercept,6)}${yHatParts}</span>
        <span class="exc-comment">// ŷ — masukkan di kolom ŷ, drag ke bawah. ${model.feats.map((f,j)=>featCols[j]+'='+f).join(', ')}</span>
      </div>

      <div class="exc-section-label" style="margin-top:0.6rem;">📋 Langkah 3 — Residual</div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=${yCol}2-yhat_cell</span>
        <span class="exc-comment">// e = y − ŷ (ganti yhat_cell dengan sel ŷ-nya)</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=resid_cell^2</span>
        <span class="exc-comment">// e²</span>
      </div>

      <div class="exc-section-label" style="margin-top:0.6rem;">📋 Langkah 4 — Metrik Evaluasi</div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=1-SUMPRODUCT(resid_range,resid_range)/SUMPRODUCT((y_range-AVERAGE(y_range))^2)</span>
        <span class="exc-comment">// R² = ${fmt(model.metrics.r2, 6)}</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=SUMPRODUCT(resid_range,resid_range)/${n}</span>
        <span class="exc-comment">// MSE = ${fmt(model.metrics.mse, 6)}</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=SQRT(SUMPRODUCT(resid_range,resid_range)/${n})</span>
        <span class="exc-comment">// RMSE = ${fmt(model.metrics.rmse, 6)}</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell exc-copyable" onclick="copyText(this)">=SUMPRODUCT(ABS(resid_range))/${n}</span>
        <span class="exc-comment">// MAE = ${fmt(model.metrics.mae, 6)}</span>
      </div>
      <div class="info-box" style="margin-top:0.5rem;font-size:12px;">
        💡 Klik tiap formula untuk menyalin. Ganti <code>resid_range</code> dan <code>y_range</code> dengan range aktual di spreadsheet kamu.
      </div>
    `;
  }
}

// ── Copy helpers ──────────────────────────────────────────────
function copyText(el) {
  const text = el.textContent.trim();
  navigator.clipboard.writeText(text).then(() => {
    const orig = el.style.background;
    el.style.background = 'rgba(100,220,120,0.25)';
    setTimeout(() => { el.style.background = orig; }, 600);
  });
}

function copyExcelFormulas() {
  const cells = document.querySelectorAll('#r-formula-block .exc-copyable');
  const lines = [...cells].map(c => c.textContent.trim()).join('\n');
  navigator.clipboard.writeText(lines).then(() => {
    const btn = document.querySelector('[onclick="copyExcelFormulas()"]');
    if (btn) { btn.textContent = '✓ Tersalin!'; setTimeout(() => { btn.textContent = '📋 Salin Semua Formula'; }, 1800); }
  });
}

// ── Metrics Formula Block — FIX #5 ───────────────────────────
function renderMetricsFormula(metrics, n, containerId, label) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const m = metrics;
  el.innerHTML = `
    <div class="exc-row">
      <span class="exc-cell">R²</span>
      <span class="exc-formula">= 1 &minus; SS<sub>res</sub> / SS<sub>tot</sub>
        = 1 &minus; ${fmt(m.ssRes, 4)} / ${fmt(m.ssTot, 4)} = <strong>${fmt(m.r2, 6)}</strong>
        <span class="exc-comment"> // ${label}</span>
      </span>
    </div>
    <div class="exc-row">
      <span class="exc-cell">MSE</span>
      <span class="exc-formula">= (1/${n}) &Sigma;(y&minus;ŷ)&sup2; = <strong>${fmt(m.mse, 6)}</strong></span>
    </div>
    <div class="exc-row">
      <span class="exc-cell">RMSE</span>
      <span class="exc-formula">= &radic;MSE = <strong>${fmt(m.rmse, 6)}</strong></span>
    </div>
    <div class="exc-row">
      <span class="exc-cell">MAE</span>
      <span class="exc-formula">= (1/${n}) &Sigma;|y&minus;ŷ| = <strong>${fmt(m.mae, 6)}</strong></span>
    </div>
  `;
}

// ── Tab Switching ─────────────────────────────────────────────
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('tab-train').classList.toggle('active', tab === 'train');
  document.getElementById('tab-test').classList.toggle('active',  tab === 'test');
}

// Tab khusus metrik (agar tidak bentrok dengan tab kalkulasi)
function switchMetricTab(tab, btn) {
  document.querySelectorAll('#metric-tab-train-btn, #metric-tab-test-btn')
    .forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('metric-tab-train').classList.toggle('active', tab === 'train');
  document.getElementById('metric-tab-test').classList.toggle('active',  tab === 'test');
}

// ── Prediksi Nilai Baru ───────────────────────────────────────
function buildPredInputs(model, containerId) {
  const area = document.getElementById(containerId);
  if (!area) return;
  area.innerHTML = model.feats.map(f => `
    <div class="pred-input-item">
      <label>${f}</label>
      <input type="number" step="any" id="pi-${f.replace(/\s/g,'_')}" value="0" placeholder="0">
    </div>
  `).join('');
}

function doManualPredict() {
  const model = LR_STATE.model;
  if (!model) return;
  const inputObj = {};
  let valid = true;
  model.feats.forEach(f => {
    const el = document.getElementById('pi-' + f.replace(/\s/g, '_'));
    const v  = parseFloat(el?.value);
    if (isNaN(v)) { valid = false; return; }
    inputObj[f] = v;
  });
  if (!valid) { alert('Isi semua nilai fitur!'); return; }

  const yHat   = predictLR(model, inputObj);
  const inputs = model.feats.map(f => `${f} = ${inputObj[f]}`).join(', ');

  document.getElementById('r-pred-result').innerHTML = `
    <div class="pred-result-banner">
      <div class="pred-val">${fmt(yHat, 6)}</div>
      <div class="pred-desc">&ycirc; (${model.target}) untuk: ${inputs}</div>
      <div class="pred-desc" style="margin-top:4px;font-size:12px;">${equationString(model)}</div>
    </div>
  `;
}

// ── Pagination untuk tabel kalkulasi besar ────────────────────
const LR_PAGINATION = {
  trainPage: 1,
  testPage:  1,
  pageSize:  50,   // baris per halaman
};

function renderCalcTablePaged(containerId, tabKey) {
  const model = LR_STATE.model;
  if (!model) return;
  const rows = tabKey === 'train' ? LR_STATE.trainRows : LR_STATE.testRows;
  const page = tabKey === 'train' ? LR_PAGINATION.trainPage : LR_PAGINATION.testPage;
  const size = LR_PAGINATION.pageSize;

  if (model.mode === 'simple') {
    renderCalcTableSimple(model, rows, containerId, page, size);
  } else {
    renderCalcTableMultiple(model, rows, containerId, page, size);
  }
}

function goCalcPage(tabKey, page) {
  if (tabKey === 'train') LR_PAGINATION.trainPage = page;
  else                    LR_PAGINATION.testPage  = page;
  const containerId = tabKey === 'train' ? 'r-calc-train' : 'r-calc-test';
  renderCalcTablePaged(containerId, tabKey);
}

// ── Reset ─────────────────────────────────────────────────────
function resetInput() {
  Object.assign(LR_STATE, { rawRows:[], headers:[], numericCols:[], targetCol:null,
    featureCols:[], trainRows:[], testRows:[], model:null });

  document.getElementById('page-input').style.display  = '';
  document.getElementById('page-result').style.display = 'none';
  document.getElementById('preview-section').style.display = 'none';
  document.getElementById('preview-info').innerHTML    = '';
  document.getElementById('preview-table').innerHTML   = '';
  document.getElementById('preview-warn').innerHTML    = '';
  document.getElementById('feature-checkboxes').innerHTML = '';
  document.getElementById('manual-table-wrap').innerHTML  = '';
  document.getElementById('btn-load-manual').style.display = 'none';
  document.getElementById('csv-input').value = '';
  setInputMode('upload');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}