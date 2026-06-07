/* ============================================================
   c45_io.js  —  Upload CSV, sample datasets, preview tabel,
                 kolom selector, missing value handling,
                 train/test split state & UI
   ============================================================ */

   const C45_IO = (() => {

    /* ============================================================
       STATE
       ============================================================ */
    let rawRows    = [];   // array of arrays (string), tanpa header
    let headers    = [];   // array string
    let colTypes   = [];   // 'num' | 'cat' per kolom
    let cleanRows  = [];   // setelah imputasi / drop
    let classCol   = -1;   // indeks kolom kelas
    let featCols   = [];   // array indeks fitur yang diceklis
    let mvStrategy = 'mode';
  
    // [NEW-IO1] Split state
    let splitMode = 'none';   // 'none' | 'holdout'
    let testRatio = 0.2;      // fraction for test set (e.g. 0.2 = 20%)
    let splitSeed = 42;       // LCG seed for stratifiedSplit
  
    /* ============================================================
       SAMPLE DATASETS
       ============================================================ */
    const SAMPLES = {
      cuaca: {
        headers: ['Cuaca','Suhu','Kelembaban','Angin','Main'],
        rows: [
          ['Cerah','Panas','Tinggi','Lemah','Tidak'],
          ['Cerah','Panas','Tinggi','Kencang','Tidak'],
          ['Mendung','Panas','Tinggi','Lemah','Ya'],
          ['Hujan','Sedang','Tinggi','Lemah','Ya'],
          ['Hujan','Dingin','Normal','Lemah','Ya'],
          ['Hujan','Dingin','Normal','Kencang','Tidak'],
          ['Mendung','Dingin','Normal','Kencang','Ya'],
          ['Cerah','Sedang','Tinggi','Lemah','Tidak'],
          ['Cerah','Dingin','Normal','Lemah','Ya'],
          ['Hujan','Sedang','Normal','Lemah','Ya'],
          ['Cerah','Sedang','Normal','Kencang','Ya'],
          ['Mendung','Sedang','Tinggi','Kencang','Ya'],
          ['Mendung','Panas','Normal','Lemah','Ya'],
          ['Hujan','Sedang','Tinggi','Kencang','Tidak'],
        ]
      },
      kredit: {
        headers: ['Usia','Pendapatan','Riwayat_Kredit','Aset','Disetujui'],
        rows: [
          ['Muda','Rendah','Buruk','Tidak','Tidak'],
          ['Muda','Rendah','Buruk','Ya','Tidak'],
          ['Paruh_Baya','Rendah','Buruk','Tidak','Ya'],
          ['Senior','Sedang','Buruk','Tidak','Ya'],
          ['Senior','Tinggi','Baik','Tidak','Ya'],
          ['Senior','Tinggi','Baik','Ya','Tidak'],
          ['Paruh_Baya','Tinggi','Baik','Ya','Ya'],
          ['Muda','Sedang','Buruk','Tidak','Tidak'],
          ['Muda','Tinggi','Baik','Tidak','Ya'],
          ['Senior','Sedang','Baik','Tidak','Ya'],
          ['Muda','Sedang','Baik','Ya','Ya'],
          ['Paruh_Baya','Sedang','Buruk','Ya','Ya'],
          ['Paruh_Baya','Tinggi','Buruk','Tidak','Ya'],
          ['Senior','Sedang','Buruk','Ya','Tidak'],
          ['Muda','Rendah','Baik','Ya','Tidak'],
        ]
      },
      penyakit: {
        headers: ['Demam','Batuk','Sakit_Kepala','Mual','Diagnosis'],
        rows: [
          ['Tinggi','Ya','Ya','Tidak','Flu'],
          ['Tinggi','Ya','Tidak','Ya','DBD'],
          ['Normal','Ya','Tidak','Tidak','Pilek'],
          ['Tinggi','Tidak','Ya','Ya','DBD'],
          ['Normal','Ya','Ya','Tidak','Pilek'],
          ['Tinggi','Ya','Ya','Ya','DBD'],
          ['Normal','Tidak','Tidak','Tidak','Sehat'],
          ['Normal','Ya','Tidak','Tidak','Pilek'],
          ['Tinggi','Ya','Tidak','Tidak','Flu'],
          ['Normal','Tidak','Ya','Tidak','Sehat'],
          ['Tinggi','Tidak','Ya','Ya','DBD'],
          ['Normal','Ya','Ya','Tidak','Pilek'],
        ]
      }
    };
  
    /* ============================================================
       PUBLIC: loadSample
       ============================================================ */
    function loadSample(name) {
      const s = SAMPLES[name];
      if (!s) return;
      headers  = [...s.headers];
      rawRows  = s.rows.map(r => [...r]);
      colTypes = C45_Utils.detectColTypes(headers, rawRows);
      classCol = -1;
      featCols = [];
      _afterLoad();
    }
  
    /* ============================================================
       PUBLIC: updateMVStrategy
       ============================================================ */
    function updateMVStrategy(val) {
      mvStrategy = val;
      _applyMV();
    }
  
    /* ============================================================
       [NEW-IO2] PUBLIC: split state updaters
       ============================================================ */
    function updateSplitMode(val) {
      splitMode = val;
      _updateSplitUI();
    }
  
    function updateTestRatio(val) {
      const n = parseFloat(val);
      if (!isNaN(n) && n > 0 && n < 1) testRatio = n;
    }
  
    function updateSplitSeed(val) {
      const n = parseInt(val);
      if (!isNaN(n) && n >= 0) splitSeed = n;
    }
  
    /* ============================================================
       PUBLIC: setAllFeatureCols
       ============================================================ */
    function setAllFeatureCols(state) {
      const checkboxes = document.querySelectorAll('#feat-col-checkboxes input[type=checkbox]');
      checkboxes.forEach(cb => {
        if (parseInt(cb.dataset.ci) === classCol) return;
        cb.checked = state;
        cb.closest('.col-pill').classList.toggle('checked', state);
      });
      _updateFeatCols();
      _tryShowConfig();
    }
  
    /* ============================================================
       PUBLIC: resetInput
       ============================================================ */
    function resetInput() {
      rawRows = []; headers = []; colTypes = []; cleanRows = [];
      classCol = -1; featCols = [];
      // [NEW-IO3] reset split state
      splitMode = 'none'; testRatio = 0.2; splitSeed = 42;
      document.getElementById('preview-section').style.display = 'none';
      document.getElementById('config-section').style.display  = 'none';
      document.getElementById('page-result').style.display     = 'none';
      document.getElementById('page-input').style.display      = 'block';
      document.getElementById('csv-input').value               = '';
      // reset split UI controls if they exist
      const smSel = document.getElementById('split-mode-select');
      if (smSel) smSel.value = 'none';
      const trInp = document.getElementById('test-ratio-input');
      if (trInp) trInp.value = '0.2';
      const ssInp = document.getElementById('split-seed-input');
      if (ssInp) ssInp.value = '42';
      _updateSplitUI();
    }
  
    /* ============================================================
       INTERNAL: setelah data dimuat
       ============================================================ */
    function _afterLoad() {
      _renderPreview();
      _renderClassSelector();
      _renderFeatCheckboxes();
      _checkMissing();
      _applyMV();
      document.getElementById('preview-section').style.display = 'block';
      document.getElementById('config-section').style.display  = 'none';
    }
  
    /* ============================================================
       Render preview table
       ============================================================ */
    function _renderPreview() {
      const tbl = document.getElementById('preview-table');
      let html = '<thead><tr>';
      headers.forEach((h, i) => {
        const badge = `<span style="font-size:12px;font-family:var(--mono);color:var(--text3);margin-left:4px">[${colTypes[i]}]</span>`;
        html += `<th>${h}${badge}</th>`;
      });
      html += '</tr></thead><tbody>';
      const shown = rawRows.slice(0, 8);
      shown.forEach(row => {
        html += '<tr>' + row.map(v => {
          const missing = (v === '' || v === null || v === undefined);
          return `<td>${missing ? '<span class="mv-badge">?</span>' : v}</td>`;
        }).join('') + '</tr>';
      });
      if (rawRows.length > 8) {
        html += `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--text3);font-size:17px">… ${rawRows.length - 8} baris lainnya</td></tr>`;
      }
      html += '</tbody>';
      tbl.innerHTML = html;
  
      document.getElementById('preview-info').innerHTML =
        `<div class="info-box" style="font-size:18px">
          Dataset dimuat: <strong style="color:var(--accent)">${rawRows.length} baris</strong> ×
          <strong style="color:var(--accent)">${headers.length} kolom</strong>
        </div>`;
    }
  
    /* ============================================================
       Render class column radio buttons
       ============================================================ */
    function _renderClassSelector() {
      const wrap = document.getElementById('class-col-radios');
      wrap.innerHTML = headers.map((h, i) => `
        <label class="class-radio-btn${classCol === i ? ' active' : ''}" onclick="C45_IO._selectClassCol(${i})">
          <input type="radio" name="class-col" value="${i}" ${classCol === i ? 'checked' : ''}>
          <span style="font-size:16px">${colTypes[i] === 'cat' ? '🏷' : '#'}</span>
          ${h}
        </label>
      `).join('');
    }
  
    /* ============================================================
       Render feature column checkboxes
       ============================================================ */
    function _renderFeatCheckboxes() {
      const wrap = document.getElementById('feat-col-checkboxes');
      wrap.innerHTML = headers.map((h, i) => {
        if (i === classCol) return '';
        const checked = featCols.includes(i);
        return `
          <label class="col-pill${checked ? ' checked' : ''}" onclick="C45_IO._toggleFeatCol(${i}, this)">
            <input type="checkbox" data-ci="${i}" ${checked ? 'checked' : ''}>
            <span class="pill-icon">${colTypes[i] === 'num' ? '#' : '🏷'}</span>
            ${h}
            <span class="pill-type">[${colTypes[i]}]</span>
          </label>`;
      }).join('');
    }
  
    /* ============================================================
       Select class column
       ============================================================ */
    function _selectClassCol(ci) {
      classCol = ci;
      // Auto-pilih semua kolom lain sebagai fitur
      featCols = headers.map((_, i) => i).filter(i => i !== ci);
      _renderClassSelector();
      _renderFeatCheckboxes();
      _tryShowConfig();
    }
  
    /* ============================================================
       Toggle feature column checkbox
       ============================================================ */
    function _toggleFeatCol(ci, pill) {
      const cb = pill.querySelector('input');
      cb.checked = !cb.checked;
      pill.classList.toggle('checked', cb.checked);
      _updateFeatCols();
      _tryShowConfig();
    }
  
    function _updateFeatCols() {
      featCols = [];
      document.querySelectorAll('#feat-col-checkboxes input[type=checkbox]').forEach(cb => {
        if (cb.checked) featCols.push(parseInt(cb.dataset.ci));
      });
    }
  
    /* ============================================================
       Check missing values
       ============================================================ */
    function _checkMissing() {
      const mvCounts = {};
      headers.forEach((h, i) => {
        const cnt = rawRows.filter(r => r[i] === '' || r[i] === null || r[i] === undefined).length;
        if (cnt > 0) mvCounts[h] = cnt;
      });
      const mvSec = document.getElementById('mv-section');
      if (Object.keys(mvCounts).length > 0) {
        mvSec.style.display = 'block';
        const lines = Object.entries(mvCounts).map(([h, c]) =>
          `<span class="mv-badge" style="margin-right:6px">${h}: ${c} missing</span>`).join('');
        document.getElementById('mv-detail').innerHTML = lines;
      } else {
        mvSec.style.display = 'none';
      }
    }
  
    /* ============================================================
       Apply missing value strategy → update cleanRows
       ============================================================ */
    function _applyMV() {
      const res  = C45_Utils.imputeMissing(rawRows, headers, mvStrategy, colTypes);
      cleanRows  = res.rows;
      const info = document.getElementById('mv-preview-info');
      if (info) {
        info.innerHTML = res.changed.length > 0
          ? `<div class="info-box" style="font-size:17px">
              ${res.changed.length} nilai diisi/dihapus. Dataset siap: <strong>${cleanRows.length} baris</strong>.
             </div>`
          : '';
      }
    }
  
    /* ============================================================
       Show config section if ready
       ============================================================ */
    function _tryShowConfig() {
      const warn = document.getElementById('feat-col-warn');
      if (classCol === -1) {
        warn.innerHTML = `<span style="color:var(--yellow);font-size:17px">⚠ Pilih kolom kelas terlebih dahulu.</span>`;
        document.getElementById('config-section').style.display = 'none';
        return;
      }
      if (featCols.length === 0) {
        warn.innerHTML = `<span style="color:var(--yellow);font-size:17px">⚠ Pilih minimal 1 kolom fitur.</span>`;
        document.getElementById('config-section').style.display = 'none';
        return;
      }
      warn.innerHTML = '';
      document.getElementById('config-section').style.display = 'block';
    }
  
    /* ============================================================
       CSV PARSER
       ============================================================ */
    function _parseCSV(text) {
      const lines = text.trim().split(/\r?\n/);
      const parsed = lines.map(l => {
        const cells = []; let cur = ''; let inQ = false;
        for (let ci = 0; ci < l.length; ci++) {
          const ch = l[ci];
          if (ch === '"') { inQ = !inQ; }
          else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
          else { cur += ch; }
        }
        cells.push(cur.trim());
        return cells;
      });
      return { headers: parsed[0], rows: parsed.slice(1) };
    }
  
    /* ============================================================
       INIT: file input listener
       ============================================================ */
    function init() {
      const inp = document.getElementById('csv-input');
      inp.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = evt => {
          const { headers: h, rows: r } = _parseCSV(evt.target.result);
          headers  = h;
          rawRows  = r;
          colTypes = C45_Utils.detectColTypes(headers, rawRows);
          classCol = -1;
          featCols = [];
          _afterLoad();
        };
        reader.readAsText(file);
      });
  
      // Drag & Drop
      const zone = document.getElementById('drop-zone');
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--accent)'; });
      zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
      zone.addEventListener('drop', e => {
        e.preventDefault(); zone.style.borderColor = '';
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = evt => {
          const { headers: h, rows: r } = _parseCSV(evt.target.result);
          headers  = h;
          rawRows  = r;
          colTypes = C45_Utils.detectColTypes(headers, rawRows);
          classCol = -1;
          featCols = [];
          _afterLoad();
        };
        reader.readAsText(file);
      });
    }
  
    /* ============================================================
       [NEW-IO4] INTERNAL: show/hide holdout options
       ============================================================ */
    function _updateSplitUI() {
      const holdoutOpts = document.getElementById('holdout-options');
      if (!holdoutOpts) return;
      holdoutOpts.style.display = (splitMode === 'holdout') ? 'flex' : 'none';
    }
  
    /* ============================================================
       GETTER (untuk dipakai modul lain)
       ============================================================ */
    function getState() {
      _applyMV(); // pastikan cleanRows selalu fresh
      // [NEW-IO5] sertakan split state agar c45_core bisa membaca langsung
      return { headers, rawRows, cleanRows, colTypes, classCol, featCols, mvStrategy,
               splitMode, testRatio, splitSeed };
    }
  
    document.addEventListener('DOMContentLoaded', init);
  
    return {
      loadSample, updateMVStrategy, setAllFeatureCols, resetInput,
      // [NEW-IO6] split state updaters
      updateSplitMode, updateTestRatio, updateSplitSeed,
      getState,
      // expose internal untuk onclick di HTML
      _selectClassCol, _toggleFeatCol
    };
  })();