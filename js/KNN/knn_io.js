/* ============================================================
   knn_io.js — Upload CSV, Preview, Konfigurasi awal
   Fix: checkbox toggle tidak menyebabkan DOM rebuild
   ============================================================ */

let rawRows = [];
let headers = [];
// selectedFeatureCols: array of { col, checked }
// diinisialisasi saat renderColSelector pertama kali
let selectedFeatureCols = [];
let classCol = '';
let splitRatio = 0.8;

// ---- Sample datasets ----
const SAMPLES = {
  iris: {
    name: 'Iris (150 baris)',
    csv: `sepal_length,sepal_width,petal_length,petal_width,species
5.1,3.5,1.4,0.2,Iris-setosa
4.9,3.0,1.4,0.2,Iris-setosa
4.7,3.2,1.3,0.2,Iris-setosa
4.6,3.1,1.5,0.2,Iris-setosa
5.0,3.6,1.4,0.2,Iris-setosa
5.4,3.9,1.7,0.4,Iris-setosa
4.6,3.4,1.4,0.3,Iris-setosa
5.0,3.4,1.5,0.2,Iris-setosa
4.4,2.9,1.4,0.2,Iris-setosa
4.9,3.1,1.5,0.1,Iris-setosa
5.4,3.7,1.5,0.2,Iris-setosa
4.8,3.4,1.6,0.2,Iris-setosa
4.8,3.0,1.4,0.1,Iris-setosa
4.3,3.0,1.1,0.1,Iris-setosa
5.8,4.0,1.2,0.2,Iris-setosa
5.7,4.4,1.5,0.4,Iris-setosa
5.4,3.9,1.3,0.4,Iris-setosa
5.1,3.5,1.4,0.3,Iris-setosa
5.7,3.8,1.7,0.3,Iris-setosa
5.1,3.8,1.5,0.3,Iris-setosa
5.4,3.4,1.7,0.2,Iris-setosa
5.1,3.7,1.5,0.4,Iris-setosa
4.6,3.6,1.0,0.2,Iris-setosa
5.1,3.3,1.7,0.5,Iris-setosa
4.8,3.4,1.9,0.2,Iris-setosa
5.0,3.0,1.6,0.2,Iris-setosa
5.0,3.4,1.6,0.4,Iris-setosa
5.2,3.5,1.5,0.2,Iris-setosa
5.2,3.4,1.4,0.2,Iris-setosa
4.7,3.2,1.6,0.2,Iris-setosa
4.8,3.1,1.6,0.2,Iris-setosa
5.4,3.4,1.5,0.4,Iris-setosa
5.2,4.1,1.5,0.1,Iris-setosa
5.5,4.2,1.4,0.2,Iris-setosa
4.9,3.1,1.5,0.2,Iris-setosa
5.0,3.2,1.2,0.2,Iris-setosa
5.5,3.5,1.3,0.2,Iris-setosa
4.9,3.6,1.4,0.1,Iris-setosa
4.4,3.0,1.3,0.2,Iris-setosa
5.1,3.4,1.5,0.2,Iris-setosa
5.0,3.5,1.3,0.3,Iris-setosa
4.5,2.3,1.3,0.3,Iris-setosa
4.4,3.2,1.3,0.2,Iris-setosa
5.0,3.5,1.6,0.6,Iris-setosa
5.1,3.8,1.9,0.4,Iris-setosa
4.8,3.0,1.4,0.3,Iris-setosa
5.1,3.8,1.6,0.2,Iris-setosa
4.6,3.2,1.4,0.2,Iris-setosa
5.3,3.7,1.5,0.2,Iris-setosa
5.0,3.3,1.4,0.2,Iris-setosa
7.0,3.2,4.7,1.4,Iris-versicolor
6.4,3.2,4.5,1.5,Iris-versicolor
6.9,3.1,4.9,1.5,Iris-versicolor
5.5,2.3,4.0,1.3,Iris-versicolor
6.5,2.8,4.6,1.5,Iris-versicolor
5.7,2.8,4.5,1.3,Iris-versicolor
6.3,3.3,4.7,1.6,Iris-versicolor
4.9,2.4,3.3,1.0,Iris-versicolor
6.6,2.9,4.6,1.3,Iris-versicolor
5.2,2.7,3.9,1.4,Iris-versicolor
5.0,2.0,3.5,1.0,Iris-versicolor
5.9,3.0,4.2,1.5,Iris-versicolor
6.0,2.2,4.0,1.0,Iris-versicolor
6.1,2.9,4.7,1.4,Iris-versicolor
5.6,2.9,3.6,1.3,Iris-versicolor
6.7,3.1,4.4,1.4,Iris-versicolor
5.6,3.0,4.5,1.5,Iris-versicolor
5.8,2.7,4.1,1.0,Iris-versicolor
6.2,2.2,4.5,1.5,Iris-versicolor
5.6,2.5,3.9,1.1,Iris-versicolor
5.9,3.2,4.8,1.8,Iris-versicolor
6.1,2.8,4.0,1.3,Iris-versicolor
6.3,2.5,4.9,1.5,Iris-versicolor
6.1,2.8,4.7,1.2,Iris-versicolor
6.4,2.9,4.3,1.3,Iris-versicolor
6.6,3.0,4.4,1.4,Iris-versicolor
6.8,2.8,4.8,1.4,Iris-versicolor
6.7,3.0,5.0,1.7,Iris-versicolor
6.0,2.9,4.5,1.5,Iris-versicolor
5.7,2.6,3.5,1.0,Iris-versicolor
5.5,2.4,3.8,1.1,Iris-versicolor
5.5,2.4,3.7,1.0,Iris-versicolor
5.8,2.7,3.9,1.2,Iris-versicolor
6.0,2.7,5.1,1.6,Iris-versicolor
5.4,3.0,4.5,1.5,Iris-versicolor
6.0,3.4,4.5,1.6,Iris-versicolor
6.7,3.1,4.7,1.5,Iris-versicolor
6.3,2.3,4.4,1.3,Iris-versicolor
5.6,3.0,4.1,1.3,Iris-versicolor
5.5,2.5,4.0,1.3,Iris-versicolor
5.5,2.6,4.4,1.2,Iris-versicolor
6.1,3.0,4.6,1.4,Iris-versicolor
5.8,2.6,4.0,1.2,Iris-versicolor
5.0,2.3,3.3,1.0,Iris-versicolor
5.6,2.7,4.2,1.3,Iris-versicolor
5.7,3.0,4.2,1.2,Iris-versicolor
5.7,2.9,4.2,1.3,Iris-versicolor
6.2,2.9,4.3,1.3,Iris-versicolor
5.1,2.5,3.0,1.1,Iris-versicolor
5.7,2.8,4.1,1.3,Iris-versicolor
6.3,3.3,6.0,2.5,Iris-virginica
5.8,2.7,5.1,1.9,Iris-virginica
7.1,3.0,5.9,2.1,Iris-virginica
6.3,2.9,5.6,1.8,Iris-virginica
6.5,3.0,5.8,2.2,Iris-virginica
7.6,3.0,6.6,2.1,Iris-virginica
4.9,2.5,4.5,1.7,Iris-virginica
7.3,2.9,6.3,1.8,Iris-virginica
6.7,2.5,5.8,1.8,Iris-virginica
7.2,3.6,6.1,2.5,Iris-virginica
6.5,3.2,5.1,2.0,Iris-virginica
6.4,2.7,5.3,1.9,Iris-virginica
6.8,3.0,5.5,2.1,Iris-virginica
5.7,2.5,5.0,2.0,Iris-virginica
5.8,2.8,5.1,2.4,Iris-virginica
6.4,3.2,5.3,2.3,Iris-virginica
6.5,3.0,5.5,1.8,Iris-virginica
7.7,3.8,6.7,2.2,Iris-virginica
7.7,2.6,6.9,2.3,Iris-virginica
6.0,2.2,5.0,1.5,Iris-virginica
6.9,3.2,5.7,2.3,Iris-virginica
5.6,2.8,4.9,2.0,Iris-virginica
7.7,2.8,6.7,2.0,Iris-virginica
6.3,2.7,4.9,1.8,Iris-virginica
6.7,3.3,5.7,2.1,Iris-virginica
7.2,3.2,6.0,1.8,Iris-virginica
6.2,2.8,4.8,1.8,Iris-virginica
6.1,3.0,4.9,1.8,Iris-virginica
6.4,2.8,5.6,2.1,Iris-virginica
7.2,3.0,5.8,1.6,Iris-virginica
7.4,2.8,6.1,1.9,Iris-virginica
7.9,3.8,6.4,2.0,Iris-virginica
6.4,2.8,5.6,2.2,Iris-virginica
6.3,2.8,5.1,1.5,Iris-virginica
6.1,2.6,5.6,1.4,Iris-virginica
7.7,3.0,6.1,2.3,Iris-virginica
6.3,3.4,5.6,2.4,Iris-virginica
6.4,3.1,5.5,1.8,Iris-virginica
6.0,3.0,4.8,1.8,Iris-virginica
6.9,3.1,5.4,2.1,Iris-virginica
6.7,3.1,5.6,2.4,Iris-virginica
6.9,3.1,5.1,2.3,Iris-virginica
5.8,2.7,5.1,1.9,Iris-virginica
6.8,3.2,5.9,2.3,Iris-virginica
6.7,3.3,5.7,2.5,Iris-virginica
6.7,3.0,5.2,2.3,Iris-virginica
6.3,2.5,5.0,1.9,Iris-virginica
6.5,3.0,5.2,2.0,Iris-virginica
6.2,3.4,5.4,2.3,Iris-virginica
5.9,3.0,5.1,1.8,Iris-virginica`
  },
  buah: {
    name: 'Buah (12 baris)',
    csv: `Berat,Manis,Renyah,Jenis
150,9,4,Apel
180,8,5,Apel
160,7,4,Apel
130,9,3,Apel
200,6,5,Jeruk
220,7,4,Jeruk
190,8,3,Jeruk
210,6,5,Jeruk
80,8,2,Anggur
90,9,2,Anggur
75,7,3,Anggur
85,8,2,Anggur`
  }
};

function loadSample(key) {
  const s = SAMPLES[key];
  if (!s) return;
  parseCSV(s.csv);
}

// ---- CSV Parsing ----
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return alert('CSV kosong atau hanya header.');
  headers = lines[0].split(',').map(h => h.trim());
  rawRows = lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
    return obj;
  });
  classCol = headers[headers.length - 1];
  // Reset state kolom saat dataset baru diload
  selectedFeatureCols = [];
  renderPreview();
}

// ---- Preview Table ----
function renderPreview() {
  const section = document.getElementById('preview-section');
  section.style.display = '';
  const info = document.getElementById('preview-info');
  info.innerHTML = `<span class="chip chip-ok">&#10003; ${rawRows.length} baris, ${headers.length} kolom</span>`;

  const tbl = document.getElementById('preview-table');
  const maxRows = 8;
  let html = '<thead><tr>';
  headers.forEach(h => { html += `<th>${h}</th>`; });
  html += '</tr></thead><tbody>';
  rawRows.slice(0, maxRows).forEach(r => {
    html += '<tr>';
    headers.forEach(h => { html += `<td>${r[h]}</td>`; });
    html += '</tr>';
  });
  if (rawRows.length > maxRows) {
    html += `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--text3);font-size:13px">... ${rawRows.length - maxRows} baris lainnya</td></tr>`;
  }
  html += '</tbody>';
  tbl.innerHTML = html;

  const sel = document.getElementById('class-col-select');
  sel.innerHTML = headers.map(h => `<option value="${h}" ${h === classCol ? 'selected' : ''}>${h}</option>`).join('');

  renderColSelector();
  updateSplitEst();
}

// ---- renderColSelector: rebuild DOM kolom ----
// Dipanggil HANYA saat: dataset baru, class col berubah, setAllCols
// TIDAK dipanggil dari onColToggle (itu yang jadi bug sebelumnya)
function renderColSelector() {
  classCol = document.getElementById('class-col-select').value;
  document.getElementById('class-col-label-hint').textContent = classCol;

  const container = document.getElementById('col-checkboxes');
  container.innerHTML = '';

  headers.forEach(h => {
    if (h === classCol) {
      const pill = document.createElement('label');
      pill.className = 'col-pill is-class';
      pill.innerHTML = `<span class="pill-icon">&#9650;</span> ${h} <span class="pill-type">kelas</span>`;
      container.appendChild(pill);
      return;
    }

    const isNumeric = rawRows.every(r => r[h] === '' || !isNaN(parseFloat(r[h])));

    // Tentukan state checked:
    // - Jika selectedFeatureCols kosong (pertama kali) → semua checked
    // - Jika sudah ada state → pakai state yang tersimpan
    const savedState = selectedFeatureCols.find(s => s.col === h);
    const checked = savedState ? savedState.checked : true;

    const pill = document.createElement('label');
    pill.className = 'col-pill' + (checked ? ' checked' : '');
    pill.innerHTML = `
      <input type="checkbox" value="${h}" ${checked ? 'checked' : ''} onchange="onColToggle(this)">
      <span class="pill-icon">${isNumeric ? '&#9632;' : '&#9670;'}</span>
      ${h}
      <span class="pill-type">${isNumeric ? 'num' : 'cat'}</span>
    `;
    container.appendChild(pill);
  });

  // Sync selectedFeatureCols dari DOM yang baru dirender
  // sehingga state konsisten
  _syncSelectedFromDOM();
  _updateColWarning();
}

// ---- onColToggle: hanya update state & visual, TIDAK rebuild DOM ----
function onColToggle(cb) {
  // Update visual pill
  const pill = cb.closest('.col-pill');
  if (cb.checked) pill.classList.add('checked');
  else pill.classList.remove('checked');

  // Update selectedFeatureCols state
  _syncSelectedFromDOM();
  _updateColWarning();
}

// ---- Sync state selectedFeatureCols dari checkbox DOM yang aktif ----
function _syncSelectedFromDOM() {
  const cbs = document.querySelectorAll('#col-checkboxes input[type=checkbox]');
  selectedFeatureCols = Array.from(cbs).map(cb => ({
    col: cb.value,
    checked: cb.checked
  }));
}

// ---- Update warning tanpa rebuild DOM ----
function _updateColWarning() {
  const warn = document.getElementById('col-selector-warn');
  if (!warn) return;

  const hasNumericSelected = selectedFeatureCols.some(s => {
    if (!s.checked) return false;
    return rawRows.every(r => r[s.col] === '' || !isNaN(parseFloat(r[s.col])));
  });

  warn.innerHTML = hasNumericSelected
    ? ''
    : '<div class="warn-box">&#9888; Tidak ada kolom numerik yang dipilih. KNN membutuhkan setidaknya 1 fitur numerik.</div>';
}

// ---- setAllCols: rebuild DOM dengan state baru ----
function setAllCols(state) {
  // Set semua state dulu
  selectedFeatureCols = headers
    .filter(h => h !== classCol)
    .map(col => ({ col, checked: state }));

  // Rebuild DOM dengan state baru
  renderColSelector();
}

// ---- getSelectedFeatureCols: ambil kolom yang dicentang ----
function getSelectedFeatureCols() {
  // Baca langsung dari DOM sebagai sumber kebenaran
  const cbs = document.querySelectorAll('#col-checkboxes input[type=checkbox]:checked');
  return Array.from(cbs).map(cb => cb.value);
}

// ---- Split Slider ----
function updateSplitSlider(val) {
  const pTrain = parseInt(val);
  const pTest = 100 - pTrain;
  document.getElementById('split-label-train').textContent = pTrain + '%';
  document.getElementById('split-label-test').textContent = pTest + '%';
  document.getElementById('split-label-train-bar').textContent = pTrain + '%';
  document.getElementById('split-label-test-bar').textContent = pTest + '%';
  document.getElementById('split-bar-train').style.width = pTrain + '%';
  document.getElementById('split-bar-test').style.width = pTest + '%';
  splitRatio = pTrain / 100;
  updateSplitEst();
}

function updateSplitEst() {
  const el = document.getElementById('split-est-rows');
  if (!el) return;
  const n = rawRows.length;
  const pTrain = parseInt(document.getElementById('split-slider').value);
  const pTest = 100 - pTrain;
  const nTest = Math.max(1, Math.round(n * pTest / 100));
  const nTrain = n - nTest;
  el.textContent = `≈ ${nTrain} train / ${nTest} test`;
}

// ---- Drag & Drop ----
function initDropZone() {
  const zone = document.getElementById('drop-zone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--accent)'; });
  zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  });
  document.getElementById('csv-input').addEventListener('change', e => {
    if (e.target.files[0]) readFile(e.target.files[0]);
  });
}

function readFile(file) {
  const reader = new FileReader();
  reader.onload = e => parseCSV(e.target.result);
  reader.readAsText(file);
}

function resetInput() {
  rawRows = []; headers = []; selectedFeatureCols = []; classCol = '';
  document.getElementById('preview-section').style.display = 'none';
  document.getElementById('csv-input').value = '';
}

document.addEventListener('DOMContentLoaded', () => {
  initDropZone();
  updateSplitSlider(80);
});