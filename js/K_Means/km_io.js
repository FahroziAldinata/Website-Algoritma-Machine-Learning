/**
 * km_io.js — Input / Output handling for K-Means Calculator
 * Handles: CSV upload, drag-drop, sample data, column selector,
 *          missing-value UI, K selector, init method selector,
 *          reset, and utility helpers
 */

'use strict';

/* ============================================================
   STATE
   ============================================================ */
const KM_STATE = {
  rawHeaders:    [],   // all column names from CSV
  rawRows:       [],   // string[][] — all rows raw
  selectedCols:  [],   // boolean[] — which columns are selected as features
  numericMatrix: [],   // (number|null)[][] — parsed numeric, null = missing
  cleanMatrix:   [],   // number[][] — after MV handling
  featureNames:  [],   // selected feature column names
  mvStrategy:    'mean',
  mvMissing:     [],   // [{rowIdx, colIdx, colName, rawVal}]
  selectedK:     3,
  initMethod:    'first',
  distMetric:    'euclidean',
  maxIter:       10,
};

/* ============================================================
   SAMPLE DATASETS
   ============================================================ */
const SAMPLE_DATASETS = {
  pelanggan: {
    name: 'Dataset Pelanggan',
    csv: `ID,Usia,Pendapatan_Juta,Skor_Belanja,Frekuensi_Beli
1,25,4.5,72,8
2,31,7.2,55,5
3,22,3.1,88,12
4,45,12.0,42,3
5,28,5.8,67,9
6,52,18.5,30,2
7,35,9.1,61,6
8,27,4.2,79,11
9,48,15.3,38,3
10,23,3.7,85,13
11,41,11.0,48,4
12,30,6.5,70,8
13,55,20.0,25,1
14,26,4.8,81,10
15,38,8.7,58,6`
  },
  nilai: {
    name: 'Dataset Nilai Siswa',
    csv: `Nama,Matematika,Fisika,Kimia,Biologi,Bahasa_Inggris
Andi,85,78,90,72,88
Budi,60,55,58,62,65
Cici,92,95,88,91,94
Doni,45,50,48,55,52
Eka,78,82,75,80,79
Fani,95,90,97,93,96
Gita,55,60,52,58,63
Hadi,72,68,70,75,71
Irma,88,85,91,84,89
Joko,42,48,44,50,46
Kevin,80,76,83,78,82
Lina,65,70,68,66,69`
  },
  belanja: {
    name: 'Dataset Belanja Online',
    csv: `CustomerID,Jumlah_Transaksi,Total_Belanja_Ribu,Rata_Rating,Jarak_Gudang_KM,Hari_Sejak_Terakhir
C001,15,2500,4.2,12,5
C002,3,450,3.1,25,42
C003,28,8900,4.8,8,2
C004,7,1200,3.8,18,15
C005,22,5600,4.5,10,3
C006,2,320,2.9,35,60
C007,19,4100,4.3,9,7
C008,5,780,3.5,22,28
C009,31,12000,4.9,5,1
C010,9,1800,4.0,15,12
C011,1,150,2.5,40,90
C012,25,7200,4.6,7,4
C013,11,2100,4.1,13,9
C014,4,600,3.3,28,35
C015,18,3800,4.4,11,6
C016,6,950,3.7,20,20
C017,33,15000,5.0,4,1
C018,8,1500,3.9,16,14
C019,2,280,2.8,38,75
C020,20,4500,4.4,9,5`
  }
};

/* ============================================================
   CSV PARSING
   ============================================================ */

/**
 * Parse CSV text into { headers, rows }
 * Handles quoted fields and various newline conventions
 */
function parseCSV(text) {
  // Normalize newlines
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    .filter(l => l.trim() !== '');

  const parseLine = (line) => {
    const result = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        result.push(cur.trim()); cur = '';
      } else cur += ch;
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows    = lines.slice(1).map(parseLine);
  return { headers, rows };
}

/* ============================================================
   FILE UPLOAD & DRAG-DROP
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // File input
  const csvInput = document.getElementById('csv-input');
  if (csvInput) csvInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => handleCSVLoad(ev.target.result, file.name);
    reader.readAsText(file);
  });

  // Drag & drop
  const dropZone = document.getElementById('drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--accent)';
      dropZone.style.background  = 'rgba(79,156,249,0.06)';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '';
      dropZone.style.background  = '';
    });
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      dropZone.style.background  = '';
      const file = e.dataTransfer.files[0];
      if (!file || !file.name.endsWith('.csv')) {
        alert('Hanya file .csv yang didukung.');
        return;
      }
      const reader = new FileReader();
      reader.onload = ev => handleCSVLoad(ev.target.result, file.name);
      reader.readAsText(file);
    });
  }

  // Build K selector buttons
  buildKSelector();
});

/* ============================================================
   LOAD SAMPLE DATA
   ============================================================ */
function loadSample(key) {
  const ds = SAMPLE_DATASETS[key];
  if (!ds) return;
  handleCSVLoad(ds.csv, ds.name + '.csv');
}

/* ============================================================
   HANDLE LOADED CSV
   ============================================================ */
function handleCSVLoad(text, filename) {
  const { headers, rows } = parseCSV(text);
  if (headers.length < 2 || rows.length < 2) {
    alert('CSV tidak valid atau terlalu sedikit data.');
    return;
  }

  KM_STATE.rawHeaders = headers;
  KM_STATE.rawRows    = rows;

  // Auto-detect numeric columns
  KM_STATE.selectedCols = headers.map((_, ci) => {
    // Check if majority of non-empty rows are numeric
    const vals = rows.map(r => r[ci]).filter(v => v && v.trim() !== '');
    const numCount = vals.filter(v => !isNaN(Number(v))).length;
    return numCount / vals.length > 0.7;
  });

  renderPreview(headers, rows, filename);
  renderColSelector();
  parseMissingValues();
  show('preview-section');
  show('config-section');

  // Show K hint
  updateKDesc();
}

/* ============================================================
   PREVIEW TABLE
   ============================================================ */
function renderPreview(headers, rows, filename) {
  const maxRows = 8;
  const shown   = rows.slice(0, maxRows);

  const thead = '<thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead>';
  const tbody = '<tbody>' + shown.map((row, ri) =>
    `<tr>${row.map(cell => `<td>${cell === '' ? '<span style="color:var(--red);font-family:var(--mono);font-size:14px">∅</span>' : cell}</td>`).join('')}</tr>`
  ).join('') +
    (rows.length > maxRows ? `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--text3);font-size:16px">... dan ${rows.length - maxRows} baris lainnya</td></tr>` : '') +
  '</tbody>';

  document.getElementById('preview-table').innerHTML = thead + tbody;

  document.getElementById('preview-info').innerHTML =
    `<div class="success-box" style="font-size:19px">
      <strong>&#10003; ${filename}</strong> — ${rows.length} baris, ${headers.length} kolom berhasil dibaca.
    </div>`;
}

/* ============================================================
   COLUMN SELECTOR
   ============================================================ */
function renderColSelector() {
  const container = document.getElementById('col-checkboxes');
  if (!container) return;
  const { rawHeaders, selectedCols, rawRows } = KM_STATE;

  container.innerHTML = '';

  rawHeaders.forEach((col, ci) => {
    const isChecked = !!selectedCols[ci];

    // Detect col type hint
    const vals = rawRows.map(r => r[ci]).filter(v => v && v.trim() !== '');
    const numCount = vals.filter(v => !isNaN(Number(v))).length;
    const typeLabel = numCount === vals.length ? 'NUM' : numCount > 0 ? 'MIX' : 'TXT';
    const typeColor = typeLabel === 'NUM' ? 'var(--accent)' : typeLabel === 'MIX' ? 'var(--yellow)' : 'var(--text3)';

    const pill = document.createElement('label');
    pill.className = 'col-pill' + (isChecked ? ' checked' : '');
    pill.id = `pill-${ci}`;
    // PENTING: handler di onchange <input>, BUKAN onclick <label>
    // Pola dari knn_io.js — mencegah double-fire yang menyebabkan
    // toggle balik ke nilai semula.
    pill.innerHTML = `
      <input type="checkbox" value="${ci}" ${isChecked ? 'checked' : ''} onchange="onColToggle(this)">
      <span class="pill-icon">${isChecked ? '✓' : '○'}</span>
      ${col}
      <span class="pill-type" style="color:${typeColor}">${typeLabel}</span>`;
    container.appendChild(pill);
  });

  // Sync state dari DOM yang baru dirender
  _syncColsFromDOM();
  validateColSelection();
}

/**
 * Handler toggle per-kolom — hanya update visual & state,
 * TIDAK rebuild seluruh DOM (pola dari knn_io.js).
 * Dipanggil via onchange pada <input type="checkbox">.
 */
function onColToggle(cb) {
  const ci   = parseInt(cb.value);
  const pill = document.getElementById(`pill-${ci}`);

  // Update visual pill (tidak perlu rebuild DOM)
  if (cb.checked) {
    pill.classList.add('checked');
    pill.querySelector('.pill-icon').textContent = '✓';
  } else {
    pill.classList.remove('checked');
    pill.querySelector('.pill-icon').textContent = '○';
  }

  // Sync state dari DOM
  _syncColsFromDOM();
  parseMissingValues();
  validateColSelection();
}

/**
 * Sinkronisasi KM_STATE.selectedCols dari checkbox DOM.
 * DOM adalah sumber kebenaran setelah render.
 */
function _syncColsFromDOM() {
  const cbs = document.querySelectorAll('#col-checkboxes input[type=checkbox]');
  cbs.forEach(cb => {
    const ci = parseInt(cb.value);
    KM_STATE.selectedCols[ci] = cb.checked;
  });
}

function setAllFeatureCols(val) {
  // Update state dulu
  KM_STATE.selectedCols = KM_STATE.selectedCols.map(() => val);
  // Rebuild DOM dengan state baru (setAllCols boleh rebuild karena aksi massal)
  renderColSelector();
  parseMissingValues();
}

function validateColSelection() {
  const count = KM_STATE.selectedCols.filter(Boolean).length;
  const warn  = document.getElementById('col-selector-warn');
  if (!warn) return;
  if (count < 2) {
    warn.innerHTML = `<div class="warn-box" style="font-size:17px;margin-top:0.4rem">⚠ Pilih minimal <strong>2 kolom fitur</strong> untuk clustering.</div>`;
  } else {
    warn.innerHTML = `<div class="success-box" style="font-size:17px;margin-top:0.4rem">✓ ${count} kolom dipilih sebagai fitur.</div>`;
  }
}

/* ============================================================
   PARSE NUMERIC MATRIX & DETECT MISSING VALUES
   ============================================================ */
function parseMissingValues() {
  const { rawHeaders, rawRows, selectedCols } = KM_STATE;
  const activeCols = rawHeaders.map((_, i) => i).filter(i => selectedCols[i]);

  // Build numeric matrix (null for missing)
  KM_STATE.numericMatrix = rawRows.map(row =>
    activeCols.map(ci => {
      const v = row[ci] === undefined ? '' : String(row[ci]).trim();
      if (v === '' || ['null','na','nan','n/a'].includes(v.toLowerCase()) || isNaN(Number(v))) return null;
      return Number(v);
    })
  );

  // Detect missing
  KM_STATE.mvMissing = detectMissingValues(rawRows, activeCols, rawHeaders);
  KM_STATE.featureNames = activeCols.map(i => rawHeaders[i]);

  renderMVSection();
  updateMVPreview();
}

/* ============================================================
   MISSING VALUE UI
   ============================================================ */
function renderMVSection() {
  const mvSection = document.getElementById('mv-section');
  const mvDetail  = document.getElementById('mv-detail');
  if (!mvSection || !mvDetail) return;

  const { mvMissing, rawRows } = KM_STATE;

  if (mvMissing.length === 0) {
    mvSection.style.display = 'none';
    // Apply clean = raw numeric
    KM_STATE.cleanMatrix = KM_STATE.numericMatrix.map(r => r.map(v => v === null ? 0 : v));
    return;
  }

  mvSection.style.display = '';

  // Group by column
  const byCol = {};
  mvMissing.forEach(m => {
    if (!byCol[m.colName]) byCol[m.colName] = [];
    byCol[m.colName].push(m.rowIdx + 1);
  });

  const colBadges = Object.entries(byCol).map(([col, rows]) =>
    `<div style="margin:3px 0;font-size:18px">
      <span class="mv-badge">${col}</span>
      <span style="color:var(--text3);font-size:16px;margin-left:6px">${rows.length} nilai hilang — baris: ${rows.slice(0, 8).join(', ')}${rows.length > 8 ? '...' : ''}</span>
    </div>`
  ).join('');

  mvDetail.innerHTML = `
    <div class="warn-box" style="font-size:18px;margin-bottom:0.75rem">
      ⚠ Ditemukan <strong>${mvMissing.length} nilai hilang</strong> pada ${Object.keys(byCol).length} kolom dari ${rawRows.length} baris.
    </div>
    ${colBadges}`;

  updateMVPreview();
}

function updateMVStrategy(val) {
  KM_STATE.mvStrategy = val;
  updateMVPreview();
}

function updateMVPreview() {
  const { numericMatrix, mvMissing, mvStrategy } = KM_STATE;
  if (!numericMatrix.length) return;

  const { cleaned, droppedCount, fillValues, log } = handleMissingValues(numericMatrix, mvStrategy);
  KM_STATE.cleanMatrix = cleaned;

  const info = document.getElementById('mv-preview-info');
  if (!info) return;

  if (mvMissing.length === 0) return;

  let html = '';
  if (mvStrategy === 'drop') {
    html = `<div class="info-box" style="font-size:17px;margin-top:0.5rem;margin-bottom:0">
      Akan menghapus <strong>${droppedCount} baris</strong>. Tersisa <strong>${cleaned.length} baris</strong> untuk clustering.
    </div>`;
  } else {
    const fills = KM_STATE.featureNames.map((f, i) =>
      fillValues[i] !== undefined
        ? `<span style="font-family:var(--mono);color:var(--accent)">${f}</span>: ${fmt(fillValues[i])}`
        : null
    ).filter(Boolean);
    html = `<div class="info-box" style="font-size:17px;margin-top:0.5rem;margin-bottom:0">
      Nilai pengisi (${mvStrategy}): ${fills.join(' &nbsp;|&nbsp; ')}
    </div>`;
  }
  info.innerHTML = html;
}

/* ============================================================
   K SELECTOR
   ============================================================ */
function buildKSelector() {
  const container = document.getElementById('k-selector');
  if (!container) return;
  container.innerHTML = [2, 3, 4, 5, 6, 7, 8].map(k =>
    `<button class="k-btn ${k === KM_STATE.selectedK ? 'active' : ''}" onclick="selectK(${k})" id="kbtn-${k}">${k}</button>`
  ).join('');
}

function selectK(k) {
  KM_STATE.selectedK = k;
  document.querySelectorAll('.k-btn').forEach(btn => btn.classList.remove('active'));
  const btn = document.getElementById(`kbtn-${k}`);
  if (btn) btn.classList.add('active');
  updateKDesc();
  // Update manual centroid input placeholder
  const inp = document.getElementById('manual-centroid-input');
  if (inp) inp.placeholder = `Contoh: ${Array.from({length: k}, (_, i) => i * 3).join(', ')}`;
}

function updateKDesc() {
  const desc = document.getElementById('k-desc');
  if (!desc) return;
  const n = KM_STATE.cleanMatrix.length || KM_STATE.rawRows.length;
  const k = KM_STATE.selectedK;
  const ratio = n > 0 ? (n / k).toFixed(1) : '?';
  desc.textContent = `K = ${k} cluster  |  ~${ratio} data per cluster (estimasi)`;
}

/* ============================================================
   INIT METHOD SELECTOR
   ============================================================ */
function selectInit(method) {
  KM_STATE.initMethod = method;
  ['first', 'random', 'manual'].forEach(m => {
    const el = document.getElementById(`init-opt-${m}`);
    if (el) el.classList.toggle('selected', m === method);
  });
  const manualInput = document.getElementById('manual-init-input');
  if (manualInput) manualInput.style.display = method === 'manual' ? '' : 'none';
}

/* ============================================================
   RESET
   ============================================================ */
function resetInput() {
  // Clear state
  Object.assign(KM_STATE, {
    rawHeaders: [], rawRows: [], selectedCols: [],
    numericMatrix: [], cleanMatrix: [], featureNames: [],
    mvStrategy: 'mean', mvMissing: [],
    selectedK: 3, initMethod: 'first', distMetric: 'euclidean', maxIter: 10,
  });

  // Reset UI
  hide('preview-section');
  hide('config-section');
  hide('page-result');
  show('page-input');

  const csvInput = document.getElementById('csv-input');
  if (csvInput) csvInput.value = '';

  const previewTable = document.getElementById('preview-table');
  if (previewTable) previewTable.innerHTML = '';

  const previewInfo = document.getElementById('preview-info');
  if (previewInfo) previewInfo.innerHTML = '';

  // Reset K selector
  KM_STATE.selectedK = 3;
  buildKSelector();
  selectInit('first');

  const maxSlider = document.getElementById('max-iter-slider');
  if (maxSlider) {
    maxSlider.value = 10;
    // Reset display + sembunyikan manual input via handler
    if (typeof onIterSliderChange === 'function') onIterSliderChange(10);
  }
}

/* ============================================================
   READ CONFIG & VALIDATE BEFORE PROCESSING
   ============================================================ */
function readConfig() {
  // Distance metric
  const distRadio = document.querySelector('input[name="dist-metric"]:checked');
  KM_STATE.distMetric = distRadio ? distRadio.value : 'euclidean';

  // Max iter
  // getMaxIter() didefinisikan di k_means.html — baca slider atau input manual
  KM_STATE.maxIter = typeof getMaxIter === 'function' ? getMaxIter() : 10;

  // Apply final MV handling
  if (KM_STATE.numericMatrix.length) {
    const { cleaned } = handleMissingValues(KM_STATE.numericMatrix, KM_STATE.mvStrategy);
    KM_STATE.cleanMatrix = cleaned;
  }
}

function validateConfig() {
  const featCount = KM_STATE.selectedCols.filter(Boolean).length;
  if (featCount < 2) {
    alert('Pilih minimal 2 kolom fitur numerik.');
    return false;
  }
  if (KM_STATE.cleanMatrix.length < KM_STATE.selectedK * 2) {
    alert(`Dataset terlalu kecil untuk K = ${KM_STATE.selectedK}. Perlu minimal ${KM_STATE.selectedK * 2} baris.`);
    return false;
  }

  // Manual centroid validation
  if (KM_STATE.initMethod === 'manual') {
    const inp = document.getElementById('manual-centroid-input').value.trim();
    const idxs = inp.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    if (idxs.length !== KM_STATE.selectedK) {
      document.getElementById('manual-init-warn').textContent =
        `Harus memasukkan tepat ${KM_STATE.selectedK} indeks baris.`;
      return false;
    }
    const n = KM_STATE.cleanMatrix.length;
    const outOfRange = idxs.filter(i => i < 0 || i >= n);
    if (outOfRange.length) {
      document.getElementById('manual-init-warn').textContent =
        `Indeks di luar range: ${outOfRange.join(', ')}. Range valid: 0 – ${n - 1}.`;
      return false;
    }
    KM_STATE._manualIndices = idxs;
  }

  return true;
}