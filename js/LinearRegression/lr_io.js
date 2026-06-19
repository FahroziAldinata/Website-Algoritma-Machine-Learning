// ============================================================
//  js/LinearRegression/lr_io.js
//  Upload CSV, parse, konfigurasi kolom, train/test split
//
//  CHANGELOG:
//  [NEW-1] Tambah opsi metode split baru: "linear" (systematic
//          sampling, tanpa randomisasi) berdampingan dengan
//          "random" (LCG, perilaku lama / default).
//  [NEW-2] splitDispatch() sebagai titik masuk tunggal untuk
//          memilih strategi split berdasarkan LR_IO.splitMethod.
// ============================================================

/** State global IO */
const LR_IO = {
  rawRows: [],         // array of objects (semua baris)
  headers: [],         // array string nama kolom
  numericCols: [],     // kolom yang terdeteksi numerik
  targetCol: null,
  featureCols: [],
  trainRows: [],
  testRows: [],
  seed: 42,
  testRatio: 0.2,
  splitMethod: 'random', // [NEW-1] 'random' (LCG) | 'linear' (systematic)
  useManual: false,      // mode input manual
};

// ---- Parse CSV ----
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV minimal 2 baris (header + data)');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVLine(lines[i]);
    if (vals.length !== headers.length) continue;
    const row = {};
    headers.forEach((h, j) => { row[h] = vals[j]; });
    rows.push(row);
  }
  return { headers, rows };
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else { cur += c; }
  }
  result.push(cur.trim());
  return result;
}

/** Deteksi kolom numerik */
function detectNumericCols(headers, rows) {
  return headers.filter(h => {
    const vals = rows.map(r => r[h]).filter(v => v !== '' && v !== null && v !== undefined);
    return vals.length > 0 && vals.every(v => !isNaN(parseFloat(v)));
  });
}

/** Konversi nilai kolom ke float */
function toFloat(rows, cols) {
  return rows.map(r => {
    const out = Object.assign({}, r);
    cols.forEach(c => { out[c] = parseFloat(r[c]); });
    return out;
  });
}

// ============================================================
// ---- Train / Test Split — RANDOM (LCG)  [perilaku lama] ----
// ============================================================
/**
 * Split dengan LCG shuffle
 * n_test = max(1, round(n * testRatio))
 */
function trainTestSplit(rows, testRatio, seed) {
  const n = rows.length;
  const nTest = Math.max(1, Math.round(n * testRatio));
  const shuffled = lcgShuffle(rows.map((_, i) => i), seed);
  const testIdx  = new Set(shuffled.slice(0, nTest));
  const train = [], test = [];
  rows.forEach((r, i) => (testIdx.has(i) ? test : train).push(r));
  return { train, test, nTest, nTrain: n - nTest };
}

// ============================================================
// ---- Train / Test Split — LINEAR (Systematic Sampling) ----
// [NEW-1]
// ============================================================
/**
 * Linear (systematic) split — TANPA randomisasi.
 * Index test diambil berjarak rata (interval tetap) sepanjang
 * dataset, bukan diacak. Hasil 100% reproducible, seed diabaikan.
 *
 * Algoritma:
 *   step = n / nTest
 *   testIdx = round(0*step), round(1*step), round(2*step), ...
 *   (sebanyak nTest, dengan guard anti-duplikat untuk dataset kecil)
 *   sisanya -> train
 *
 * @param {object[]} rows
 * @param {number} testRatio
 * @returns {{train:object[], test:object[], nTest:number, nTrain:number}}
 */
function linearSplit(rows, testRatio) {
  const n     = rows.length;
  const nTest = Math.max(1, Math.round(n * testRatio));
  const step  = n / nTest;

  const testIdxSet = new Set();
  for (let i = 0; i < nTest; i++) {
    let idx = Math.round(i * step);
    if (idx >= n) idx = n - 1;
    // Hindari duplikat index akibat pembulatan pada dataset kecil
    while (testIdxSet.has(idx) && idx < n - 1) idx++;
    testIdxSet.add(idx);
  }

  const train = [], test = [];
  rows.forEach((r, i) => (testIdxSet.has(i) ? test : train).push(r));

  return { train, test, nTest: test.length, nTrain: train.length };
}

// ============================================================
// ---- Dispatcher: pilih strategi split sesuai method ----
// [NEW-2]
// ============================================================
/**
 * Titik masuk tunggal untuk split data. Dipanggil oleh lr_main.js
 * (atau lr_worker.js versi non-worker) tanpa perlu tahu detail
 * strategi yang dipakai.
 *
 * @param {object[]} rows
 * @param {number} testRatio
 * @param {number} seed          - diabaikan jika method === 'linear'
 * @param {'random'|'linear'} method
 */
function splitDispatch(rows, testRatio, seed, method) {
  if (method === 'linear') {
    return linearSplit(rows, testRatio);
  }
  return trainTestSplit(rows, testRatio, seed); // default: random LCG
}

// ---- Manual Input Builder ----
/**
 * Buat template manual rows dari header yang dipilih
 * @param {string[]} featureCols
 * @param {string} targetCol
 * @param {number} nRows
 * @returns {object[]}
 */
function buildManualRows(featureCols, targetCol, nRows) {
  return Array.from({ length: nRows }, () => {
    const r = {};
    featureCols.forEach(c => { r[c] = 0; });
    r[targetCol] = 0;
    return r;
  });
}

// ---- Populate UI dropdowns/checkboxes ----
function populateTargetSelect(numericCols, selectedTarget) {
  const sel = document.getElementById('target-col');
  sel.innerHTML = numericCols.map(c =>
    `<option value="${c}" ${c === selectedTarget ? 'selected' : ''}>${c}</option>`
  ).join('');
}

function populateFeatureCheckboxes(numericCols, targetCol, selectedFeatures) {
  const wrap = document.getElementById('feature-checkboxes');
  wrap.innerHTML = '';
  numericCols.forEach(c => {
    if (c === targetCol) return;
    const checked = selectedFeatures.includes(c);
    const pill = document.createElement('label');
    pill.className = 'col-pill' + (checked ? ' checked' : '');
    pill.innerHTML = `
      <input type="checkbox" value="${c}" ${checked ? 'checked' : ''}>
      <span class="pill-icon">◆</span>
      <span>${c}</span>
    `;
    pill.querySelector('input').addEventListener('change', e => {
      pill.classList.toggle('checked', e.target.checked);
      syncFeatureSelection();
      updateModeLabel();
    });
    wrap.appendChild(pill);
  });
}

function syncFeatureSelection() {
  LR_IO.featureCols = [...document.querySelectorAll('#feature-checkboxes input:checked')]
    .map(i => i.value);
}

function updateModeLabel() {
  const lbl = document.getElementById('mode-label');
  if (!lbl) return;
  const n = LR_IO.featureCols.length;
  if (n === 0) { lbl.textContent = '—'; lbl.className = 'chip'; }
  else if (n === 1) { lbl.textContent = 'Sederhana (1 fitur)'; lbl.className = 'chip chip-ok'; }
  else { lbl.textContent = `Berganda (${n} fitur)`; lbl.className = 'chip chip-ok'; }

  // Ridge/Lasso hint
  const regHint = document.getElementById('reg-hint');
  if (regHint) regHint.style.display = n >= 2 ? '' : 'none';
}

// ============================================================
// ---- Split Method UI Sync ----  [NEW-1]
// ============================================================
/**
 * Update LR_IO.splitMethod dari radio button terpilih, lalu
 * toggle disabled state pada input seed (tidak relevan untuk
 * metode linear karena tidak ada randomisasi).
 * Dipanggil via onchange pada radio name="split-method".
 */
function updateSplitMethod(method) {
  LR_IO.splitMethod = method === 'linear' ? 'linear' : 'random';

  const seedInput = document.getElementById('lcg-seed');
  const descEl    = document.getElementById('split-method-desc');

  if (seedInput) seedInput.disabled = (LR_IO.splitMethod === 'linear');

  if (descEl) {
    descEl.textContent = LR_IO.splitMethod === 'linear'
      ? 'Data diambil berjarak rata (systematic sampling) tanpa acak — hasil selalu sama, seed diabaikan.'
      : 'Data diacak secara deterministik (seed LCG) sebelum dibagi train/test.';
  }
}