/* ============================================
   SPK WEB APP — input.js
   UI Controller multi-step input page.
   Hanya menangani:
   - State management
   - Step navigation
   - Event listeners
   - initStep 1–4

   Logika yang sudah dipindah ke:
   - js/core/spk-*.js         (algoritma SPK)
   - js/core/calculation-engine.js (buildDecisionMatrix, runSPK)
   - js/modules/file-handler.js    (parseCSV, parseExcel)
   - js/modules/table-renderer.js  (renderPreviewTable, buildManualInputTable)
   - js/modules/weighting-entropy.js (calcEntropyWeights, normalizeWeights)
   - js/modules/weighting-critic.js  (calcCriticWeights)
   - js/modules/weight-input.js      (buildWeightSliders, updateWeightTotalBar)
   ============================================ */

   'use strict';

   /* ──────────────────────────────────────────
      STATE
   ────────────────────────────────────────── */
   const State = {
     rawData:       null,
     headers:       [],
     labelCol:      null,
     selectedCols:  [],
     criteriaTypes: {},
     method:        'saw',
     lambda:        0.5,
     weightMethod:  'manual',
     weights:       {},
     dataSource:    '',
     fileName:      '',
   };
   
   /* ──────────────────────────────────────────
      SAMPLE DATA
   ────────────────────────────────────────── */
   const SAMPLES = {
     laptop: {
       headers: ['Laptop', 'Harga (juta)', 'RAM (GB)', 'Storage (GB)', 'Layar (inch)', 'Baterai (jam)'],
       rows: [
         ['Laptop A', 8.5, 8, 512, 14, 8],
         ['Laptop B', 12.0, 16, 512, 15.6, 6],
         ['Laptop C', 6.5, 8, 256, 13.3, 10],
         ['Laptop D', 15.0, 16, 1024, 15.6, 7],
         ['Laptop E', 9.9, 12, 512, 14, 9],
       ],
     },
     supplier: {
       headers: ['Supplier', 'Harga', 'Kualitas', 'Pengiriman (hari)', 'Layanan'],
       rows: [
         ['PT Abadi', 85, 90, 3, 88],
         ['CV Maju', 78, 85, 5, 80],
         ['PT Sejahtera', 92, 78, 2, 75],
         ['CV Berkah', 70, 88, 4, 92],
         ['PT Unggul', 88, 92, 3, 85],
         ['CV Prima', 75, 80, 6, 78],
       ],
     },
     karyawan: {
       headers: ['Karyawan', 'Kinerja', 'Kedisiplinan', 'Komunikasi', 'Inovasi', 'Team Work', 'Loyalitas'],
       rows: [
         ['Andi', 85, 90, 80, 75, 88, 92],
         ['Budi', 78, 85, 88, 80, 82, 86],
         ['Citra', 92, 78, 85, 90, 78, 80],
         ['Dian', 70, 88, 75, 85, 90, 78],
         ['Eko', 88, 82, 90, 78, 85, 84],
         ['Fitri', 75, 76, 82, 88, 80, 88],
         ['Gilang', 82, 90, 78, 82, 86, 82],
         ['Hani', 90, 84, 86, 80, 88, 76],
       ],
     },
     lokasi: {
       headers: ['Lokasi', 'Biaya Sewa (jt)', 'Akses Jalan', 'Luas (m2)', 'Keamanan', 'Parkir'],
       rows: [
         ['Lokasi A', 15, 85, 500, 90, 80],
         ['Lokasi B', 12, 78, 350, 80, 90],
         ['Lokasi C', 18, 92, 600, 85, 75],
         ['Lokasi D', 10, 70, 280, 75, 85],
       ],
     },
   };
   
   /* ──────────────────────────────────────────
      WEIGHT METHOD DESCRIPTIONS
   ────────────────────────────────────────── */
   const WEIGHT_DESCS = {
     manual:  { icon: '✏️', text: 'Masukkan bobot secara manual sesuai preferensi atau kebijakan Anda.' },
     entropy: { icon: '📊', text: 'Bobot dihitung otomatis dari variasi data menggunakan teori informasi Shannon.' },
     critic:  { icon: '🔬', text: 'CRITIC mempertimbangkan standar deviasi dan korelasi antar kriteria secara bersamaan.' },
     equal:   { icon: '⚖️', text: 'Semua kriteria mendapat bobot yang sama rata.' },
   };
   
   /* ──────────────────────────────────────────
      STEP NAVIGATION
   ────────────────────────────────────────── */
   let currentStep = 1;
   
   function goToStep(n) {
     document.querySelectorAll('.step-panel').forEach(p => p.style.display = 'none');
   
     const target = document.getElementById(`step${n}`);
     if (target) target.style.display = 'block';
   
     document.querySelectorAll('.step-indicator-item').forEach(item => {
       const s = parseInt(item.dataset.step);
       item.classList.remove('active', 'done');
       if (s === n) item.classList.add('active');
       if (s < n)  item.classList.add('done');
     });
   
     currentStep = n;
   
     if (n === 2) initStep2();
     if (n === 3) initStep3();
     if (n === 4) initStep4();
   
     window.scrollTo({ top: 0, behavior: 'smooth' });
   }
   
   /* ──────────────────────────────────────────
      URL PARAM — pre-select method
   ────────────────────────────────────────── */
   (function readUrlParams() {
     const params = new URLSearchParams(location.search);
     const method = params.get('method');
     const weight = params.get('weight');
   
     if (method && ['saw','topsis','waspas','moora','edas'].includes(method)) {
       State.method = method;
       const badge = document.getElementById('methodBadge');
       const name  = document.getElementById('methodBadgeName');
       if (badge && name) {
         name.textContent   = method.toUpperCase();
         badge.style.display = 'inline-flex';
       }
     }
   
     if (weight && ['manual','entropy','critic','equal'].includes(weight)) {
       State.weightMethod = weight;
     }
   
     const changeBtn = document.getElementById('methodBadgeChange');
     if (changeBtn) changeBtn.addEventListener('click', () => goToStep(3));
   })();
   
   /* ──────────────────────────────────────────
      STEP 1 — UPLOAD & PREVIEW
   ────────────────────────────────────────── */
   
   // ── Tab switching ──
   document.querySelectorAll('.upload-tab').forEach(tab => {
     tab.addEventListener('click', () => {
       document.querySelectorAll('.upload-tab').forEach(t => t.classList.remove('active'));
       document.querySelectorAll('.upload-tab-content').forEach(c => c.classList.remove('active'));
       tab.classList.add('active');
       const target = document.getElementById('tab' + cap(tab.dataset.tab));
       if (target) target.classList.add('active');
     });
   });
   
   // ── Dropzone ──
   const dropzone  = document.getElementById('dropzone');
   const fileInput = document.getElementById('fileInput');
   
   if (dropzone) {
     dropzone.addEventListener('click', () => fileInput && fileInput.click());
     dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
     dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
     dropzone.addEventListener('drop', e => {
       e.preventDefault();
       dropzone.classList.remove('drag-over');
       const file = e.dataTransfer.files[0];
       if (file) processFile(file);
     });
   }
   
   if (fileInput) {
     fileInput.addEventListener('change', () => {
       if (fileInput.files[0]) processFile(fileInput.files[0]);
     });
   }
   
   // ── Proses file via file-handler.js ──
   function processFile(file) {
     const ext          = file.name.split('.').pop().toLowerCase();
     const csvDelimiter = document.getElementById('csvDelimiter');
     const csvHeader    = document.getElementById('csvHeader');
     const csvOptions   = document.getElementById('csvOptions');
   
     State.fileName   = file.name;
     State.dataSource = 'file';
   
     if (csvOptions) csvOptions.style.display = ext === 'csv' ? 'block' : 'none';
   
     handleFile(
       file,
       (data) => {
         loadData(data);
         showFilePreview(file);
       },
       (msg) => showToast(msg, 'error'),
       {
         delimiter: csvDelimiter ? csvDelimiter.value : 'auto',
         hasHeader: csvHeader   ? csvHeader.checked  : true,
       }
     );
   }
   
   function loadData(data) {
     const csvHeader = document.getElementById('csvHeader');
     const useHeader = !csvHeader || csvHeader.checked;
   
     let rows;
     if (useHeader) {
       State.headers = data[0].map(h => String(h).trim());
       rows = data.slice(1);
     } else {
       State.headers = data[0].map((_, i) => `Kolom ${i + 1}`);
       rows = data;
     }
   
     rows = rows.filter(r => r.some(c => c !== '' && c !== null && c !== undefined));
     State.rawData = [State.headers, ...rows];
   
     // ── renderPreviewTable dari table-renderer.js ──
     renderPreviewTable(State.rawData, 'previewThead', 'previewTbody', 10);
     updateDataInfo(rows.length, State.headers.length);
   
     document.getElementById('previewEmpty').style.display      = 'none';
     document.getElementById('previewTableWrap').style.display  = 'block';
     document.getElementById('manualTableWrap').style.display   = 'none';
     document.getElementById('previewActions').style.display    = 'flex';
   
     enableStep1Next();
   }
   
   function showFilePreview(file) {
     const wrap = document.getElementById('filePreviewWrap');
     if (!wrap) return;
     const kb = (file.size / 1024).toFixed(1);
     wrap.innerHTML = `
       <div class="file-preview">
         <div class="file-preview-icon">📄</div>
         <div class="file-preview-info">
           <div class="file-preview-name">${escHtml(file.name)}</div>
           <div class="file-preview-meta">${kb} KB</div>
         </div>
         <button class="file-preview-remove" id="btnRemoveFile" title="Hapus">✕</button>
       </div>`;
     wrap.style.display = 'block';
     document.getElementById('btnRemoveFile').addEventListener('click', clearData);
   }
   
   function updateDataInfo(rows, cols) {
     const card = document.getElementById('dataInfoCard');
     if (card) {
       card.style.display = 'block';
       document.getElementById('infoRows').textContent = rows;
       document.getElementById('infoCols').textContent = cols;
     }
   }
   
   // ── Manual input ──
   document.getElementById('btnGenerateManual') &&
     document.getElementById('btnGenerateManual').addEventListener('click', generateManualTable);
   
   function generateManualTable() {
     const rows = parseInt(document.getElementById('manualRows').value) || 4;
     const cols = parseInt(document.getElementById('manualCols').value) || 4;
   
     if (rows < 2 || rows > 100) { showToast('Jumlah baris harus antara 2–100', 'error'); return; }
     if (cols < 2 || cols > 30)  { showToast('Jumlah kolom harus antara 2–30', 'error'); return; }
   
     State.dataSource = 'manual';
   
     const headers = ['Alternatif'];
     for (let c = 1; c <= cols; c++) headers.push(`K${c}`);
     State.headers = headers;
   
     const data = [headers];
     for (let r = 1; r <= rows; r++) {
       const row = [`A${r}`];
       for (let c = 0; c < cols; c++) row.push('');
       data.push(row);
     }
     State.rawData = data;
   
     // ── buildManualInputTable dari table-renderer.js ──
     buildManualInputTable(
       data,
       'manualThead', 'manualTbody',
       (ci, val) => {
         State.rawData[0][ci]  = val || `K${ci}`;
         State.headers[ci]     = val || `K${ci}`;
       },
       (ri, ci, val) => {
         if (State.rawData[ri + 1]) State.rawData[ri + 1][ci] = val;
       }
     );
   
     document.getElementById('previewEmpty').style.display     = 'none';
     document.getElementById('previewTableWrap').style.display = 'none';
     document.getElementById('manualTableWrap').style.display  = 'block';
     document.getElementById('previewActions').style.display   = 'flex';
     document.getElementById('dataInfoCard').style.display     = 'block';
     document.getElementById('infoRows').textContent           = rows;
     document.getElementById('infoCols').textContent           = cols;
   
     enableStep1Next();
   }
   
   // ── Sample data ──
   document.querySelectorAll('.sample-item').forEach(btn => {
     btn.addEventListener('click', () => {
       const key    = btn.dataset.sample;
       const sample = SAMPLES[key];
       if (!sample) return;
   
       State.dataSource = 'sample';
       State.fileName   = key;
   
       const data = [sample.headers, ...sample.rows];
       loadData(data);
       showToast(`Data contoh "${btn.querySelector('.sample-title').textContent}" dimuat.`);
     });
   });
   
   // ── Clear data ──
   document.getElementById('btnClearData') &&
     document.getElementById('btnClearData').addEventListener('click', clearData);
   
   function clearData() {
     State.rawData       = null;
     State.headers       = [];
     State.selectedCols  = [];
     State.criteriaTypes = {};
     State.weights       = {};
   
     document.getElementById('previewEmpty').style.display     = 'block';
     document.getElementById('previewTableWrap').style.display = 'none';
     document.getElementById('manualTableWrap').style.display  = 'none';
     document.getElementById('previewActions').style.display   = 'none';
     document.getElementById('dataInfoCard').style.display     = 'none';
     document.getElementById('filePreviewWrap').style.display  = 'none';
     document.getElementById('csvOptions').style.display       = 'none';
   
     if (fileInput) fileInput.value = '';
     disableStep1Next();
   }
   
   function enableStep1Next()  { const b = document.getElementById('btnStep1Next'); if (b) b.disabled = false; }
   function disableStep1Next() { const b = document.getElementById('btnStep1Next'); if (b) b.disabled = true;  }
   
   document.getElementById('btnStep1Next') &&
     document.getElementById('btnStep1Next').addEventListener('click', () => {
       if (State.dataSource === 'manual') syncManualData();
       if (!State.rawData || State.rawData.length < 3) {
         showToast('Data minimal 2 baris.', 'error');
         return;
       }
       goToStep(2);
     });
   
   function syncManualData() {
     const tbody = document.getElementById('manualTbody');
     const thead = document.getElementById('manualThead');
     if (!tbody) return;
   
     tbody.querySelectorAll('tr').forEach((tr, ri) => {
       tr.querySelectorAll('input').forEach((inp, ci) => {
         if (State.rawData[ri + 1]) {
           State.rawData[ri + 1][ci] = ci === 0 ? inp.value : (parseFloat(inp.value) || 0);
         }
       });
     });
   
     if (thead) {
       thead.querySelectorAll('input').forEach(inp => {
         const ci = parseInt(inp.dataset.col);
         State.rawData[0][ci] = inp.value || `K${ci}`;
       });
       State.headers = State.rawData[0];
     }
   }
   
   /* ──────────────────────────────────────────
      STEP 2 — PILIH KOLOM
   ────────────────────────────────────────── */
   function initStep2() {
     if (!State.rawData) return;
   
     const headers = State.rawData[0];
     const rows    = State.rawData.slice(1);
   
     const isNumeric = headers.map((h, ci) => {
       if (ci === 0) return false;
       return rows.every(row => {
         const v = row[ci];
         return v !== '' && v !== null && v !== undefined && !isNaN(parseFloat(v));
       });
     });
   
     // ── Label column select ──
     const labelSel = document.getElementById('labelColSelect');
     if (labelSel) {
       labelSel.innerHTML = '<option value="">— Pilih kolom —</option>';
       headers.forEach((h, i) => {
         const opt      = document.createElement('option');
         opt.value      = h;
         opt.textContent = h;
         if (i === 0) opt.selected = true;
         labelSel.appendChild(opt);
       });
       State.labelCol = headers[0];
   
       labelSel.addEventListener('change', () => {
         State.labelCol = labelSel.value;
         document.getElementById('labelColHint').textContent =
           State.labelCol ? `Kolom "${State.labelCol}" akan dipakai sebagai nama alternatif.` : '';
         updateMatrixPreview();
       });
     }
   
     // ── Column selector grid ──
     const grid = document.getElementById('colSelectorGrid');
     if (grid) {
       grid.innerHTML = '';
       headers.forEach((h, i) => {
         const numeric = isNumeric[i];
         const label   = document.createElement('label');
         label.className = 'col-checkbox-label' + (numeric ? '' : ' disabled');
   
         const cb        = document.createElement('input');
         cb.type         = 'checkbox';
         cb.value        = h;
         cb.disabled     = !numeric;
   
         const alreadySelected = State.selectedCols.includes(h);
         const autoSelect      = numeric && State.selectedCols.length === 0;
         cb.checked = alreadySelected || autoSelect;
   
         const typeSpan       = document.createElement('span');
         typeSpan.className   = 'col-type-badge ' + (numeric ? 'num' : 'txt');
         typeSpan.textContent = numeric ? 'NUM' : 'TXT';
   
         label.append(cb, document.createTextNode(h), typeSpan);
         if (numeric) label.classList.toggle('selected', cb.checked);
   
         cb.addEventListener('change', () => {
           label.classList.toggle('selected', cb.checked);
           updateSelectedCols();
         });
   
         grid.appendChild(label);
       });
   
       updateSelectedCols();
     }
   
     // ── Select all / deselect all ──
     document.getElementById('btnSelectAll') &&
       document.getElementById('btnSelectAll').addEventListener('click', () => {
         grid.querySelectorAll('input:not(:disabled)').forEach(cb => {
           cb.checked = true;
           cb.closest('label').classList.add('selected');
         });
         updateSelectedCols();
       });
   
     document.getElementById('btnDeselectAll') &&
       document.getElementById('btnDeselectAll').addEventListener('click', () => {
         grid.querySelectorAll('input').forEach(cb => {
           cb.checked = false;
           cb.closest('label').classList.remove('selected');
         });
         updateSelectedCols();
       });
   }
   
   function updateSelectedCols() {
     const grid = document.getElementById('colSelectorGrid');
     if (!grid) return;
   
     State.selectedCols = [];
     grid.querySelectorAll('input:checked').forEach(cb => State.selectedCols.push(cb.value));
   
     const countEl = document.getElementById('colSelectCount');
     if (countEl) countEl.textContent = `${State.selectedCols.length} kolom dipilih`;
   
     updateCriteriaTypePanel();
   
     const btn = document.getElementById('btnStep2Next');
     if (btn) btn.disabled = State.selectedCols.length < 2;
   
     updateMatrixPreview();
   }
   
   function updateCriteriaTypePanel() {
     const panel = document.getElementById('criteriaTypePanel');
     const list  = document.getElementById('criteriaTypeList');
     if (!panel || !list) return;
   
     if (State.selectedCols.length === 0) { panel.style.display = 'none'; return; }
     panel.style.display = 'block';
     list.innerHTML = '';
   
     State.selectedCols.forEach(col => {
       if (!State.criteriaTypes[col]) State.criteriaTypes[col] = 'benefit';
   
       const row = document.createElement('div');
       row.className = 'criteria-type-row';
       row.innerHTML = `
         <span class="criteria-type-name" title="${escHtml(col)}">${escHtml(col)}</span>
         <div class="criteria-type-toggle">
           <button class="type-btn ${State.criteriaTypes[col] === 'benefit' ? 'active-benefit' : ''}"
             data-col="${escHtml(col)}" data-type="benefit">+ Benefit</button>
           <button class="type-btn ${State.criteriaTypes[col] === 'cost' ? 'active-cost' : ''}"
             data-col="${escHtml(col)}" data-type="cost">– Cost</button>
         </div>`;
   
       row.querySelectorAll('.type-btn').forEach(btn => {
         btn.addEventListener('click', () => {
           const t = btn.dataset.type;
           State.criteriaTypes[btn.dataset.col] = t;
           row.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active-benefit', 'active-cost'));
           btn.classList.add(t === 'benefit' ? 'active-benefit' : 'active-cost');
         });
       });
   
       list.appendChild(row);
     });
   }
   
   function updateMatrixPreview() {
     const wrap     = document.getElementById('matrixPreviewWrap');
     const subtitle = document.getElementById('matrixPreviewSubtitle');
   
     if (!State.rawData || State.selectedCols.length === 0) {
       if (wrap) wrap.style.display = 'none';
       if (subtitle) subtitle.textContent = 'Pilih kolom di atas untuk melihat matriks keputusan.';
       return;
     }
   
     const labelCol   = State.labelCol || State.rawData[0][0];
     const colsToShow = State.selectedCols.slice(0, 8);
     const headers    = State.rawData[0];
     const rows       = State.rawData.slice(1);
     const labelIdx   = headers.indexOf(labelCol);
     const colIdxs    = colsToShow.map(c => headers.indexOf(c)).filter(i => i >= 0);
   
     const previewData = [
       [labelCol, ...colsToShow],
       ...rows.slice(0, 8).map(row => [
         labelIdx >= 0 ? row[labelIdx] : '—',
         ...colIdxs.map(ci => row[ci] ?? '—'),
       ]),
     ];
   
     // ── renderPreviewTable dari table-renderer.js ──
     renderPreviewTable(previewData, 'matrixPreviewThead', 'matrixPreviewTbody', 8);
   
     if (wrap) wrap.style.display = 'block';
     if (subtitle) subtitle.textContent =
       `Menampilkan ${Math.min(rows.length, 8)} dari ${rows.length} alternatif.`;
   }
   
   document.getElementById('btnStep2Back') &&
     document.getElementById('btnStep2Back').addEventListener('click', () => goToStep(1));
   
   document.getElementById('btnStep2Next') &&
     document.getElementById('btnStep2Next').addEventListener('click', () => {
       if (State.selectedCols.length < 2) { showToast('Pilih minimal 2 kolom kriteria numerik.', 'error'); return; }
       if (!State.labelCol)               { showToast('Pilih kolom label alternatif terlebih dahulu.', 'error'); return; }
       goToStep(3);
     });
   
   /* ──────────────────────────────────────────
      STEP 3 — METODE & BOBOT
   ────────────────────────────────────────── */
   function initStep3() {
     initMethodSelector();
     initWeightSection();
   }
   
   function initMethodSelector() {
     const radios = document.querySelectorAll('input[name="spkMethod"]');
     radios.forEach(r => { r.checked = r.value === State.method; });
   
     radios.forEach(r => {
       r.addEventListener('change', () => {
         if (r.checked) {
           State.method = r.value;
           const lambdaPanel = document.getElementById('waspasPanelLambda');
           if (lambdaPanel) lambdaPanel.style.display = r.value === 'waspas' ? 'block' : 'none';
           checkStep3Valid();
         }
       });
     });
   
     const lambdaPanel = document.getElementById('waspasPanelLambda');
     if (lambdaPanel) lambdaPanel.style.display = State.method === 'waspas' ? 'block' : 'none';
   
     const lambdaSlider = document.getElementById('lambdaSlider');
     const lambdaInput  = document.getElementById('lambdaInput');
     if (lambdaSlider && lambdaInput) {
       lambdaSlider.value = State.lambda;
       lambdaInput.value  = State.lambda;
   
       lambdaSlider.addEventListener('input', () => {
         State.lambda      = parseFloat(lambdaSlider.value);
         lambdaInput.value = State.lambda;
       });
       lambdaInput.addEventListener('input', () => {
         let v = parseFloat(lambdaInput.value);
         if (isNaN(v)) v = 0.5;
         v = Math.max(0, Math.min(1, v));
         State.lambda       = v;
         lambdaSlider.value = v;
       });
       checkStep3Valid();
     }
   }
   
   function initWeightSection() {
     document.querySelectorAll('.weight-method-tab').forEach(tab => {
       tab.classList.toggle('active', tab.dataset.wmethod === State.weightMethod);
       tab.addEventListener('click', () => {
         document.querySelectorAll('.weight-method-tab').forEach(t => t.classList.remove('active'));
         tab.classList.add('active');
         State.weightMethod = tab.dataset.wmethod;
         updateWeightMethodDesc();
         buildWeightSection();
       });
     });
   
     updateWeightMethodDesc();
     buildWeightSection();
   }
   
   function updateWeightMethodDesc() {
     const d      = WEIGHT_DESCS[State.weightMethod] || WEIGHT_DESCS.manual;
     const iconEl = document.querySelector('.weight-method-desc-icon');
     const textEl = document.getElementById('weightMethodDescText');
     if (iconEl) iconEl.textContent = d.icon;
     if (textEl) textEl.textContent = d.text;
   }
   
   function buildWeightSection() {
     if (State.weightMethod === 'equal') {
       const w = 1 / State.selectedCols.length;
       State.selectedCols.forEach(c => State.weights[c] = parseFloat(w.toFixed(4)));
       renderWeightSliders(true);
       checkStep3Valid();
       return;
     }
   
     if (State.weightMethod === 'entropy' || State.weightMethod === 'critic') {
       runAutoWeights(State.weightMethod);
       return;
     }
   
     renderWeightSliders(false);
   }
   
   // ── Render slider via weight-input.js ──
   function renderWeightSliders(readOnly) {
     const n = State.selectedCols.length;
     const defaultW = parseFloat((1 / n).toFixed(4));
   
     State.selectedCols.forEach(c => {
       if (!State.weights[c] || State.weights[c] === 0) State.weights[c] = defaultW;
     });
   
     buildWeightSliders(
       'weightInputsWrap',
       State.selectedCols,
       State.weights,
       State.criteriaTypes,
       readOnly,
       (col, val) => {
         State.weights[col] = val;
         updateWeightTotalBar(
           'weightTotalFill', 'weightTotalLabel', 'weightTotalStatus',
           State.selectedCols, State.weights
         );
         checkStep3Valid();
       }
     );
   
     updateWeightTotalBar(
       'weightTotalFill', 'weightTotalLabel', 'weightTotalStatus',
       State.selectedCols, State.weights
     );
     checkStep3Valid();
   }
   
   async function runAutoWeights(method) {
     const loading = document.getElementById('autoWeightLoading');
     const wrap    = document.getElementById('weightInputsWrap');
   
     if (loading) loading.style.display = 'flex';
     if (wrap)    wrap.innerHTML = '';
   
     await delay(300);
   
     try {
       // ── calcEntropyWeights / calcCriticWeights dari modules ──
       const weights = method === 'entropy'
         ? calcEntropyWeights(State.selectedCols, State.rawData.slice(1), State.rawData[0])
         : calcCriticWeights(State.selectedCols, State.rawData.slice(1), State.rawData[0]);
   
       State.weights = weights;
       renderWeightSliders(true);
       checkStep3Valid();
     } catch (err) {
       showToast('Gagal menghitung bobot otomatis: ' + err.message, 'error');
       State.weightMethod = 'manual';
       document.querySelectorAll('.weight-method-tab').forEach(t => {
         t.classList.toggle('active', t.dataset.wmethod === 'manual');
       });
       renderWeightSliders(false);
     } finally {
       if (loading) loading.style.display = 'none';
     }
   }
   
   function checkStep3Valid() {
     const total   = State.selectedCols.reduce((s, c) => s + (State.weights[c] || 0), 0);
     const weightOk = Math.abs(total - 1) < 0.01;
     const btn      = document.getElementById('btnStep3Next');
     if (btn) btn.disabled = !(State.method && weightOk);
   }
   
   document.getElementById('btnStep3Back') &&
     document.getElementById('btnStep3Back').addEventListener('click', () => goToStep(2));
   
   document.getElementById('btnStep3Next') &&
     document.getElementById('btnStep3Next').addEventListener('click', () => {
       if (!isWeightValid(State.selectedCols, State.weights)) {
         const total = State.selectedCols.reduce((s, c) => s + (State.weights[c] || 0), 0);
         showToast(`Total bobot harus 1.000. Sekarang: ${total.toFixed(3)}`, 'error');
         return;
       }
       goToStep(4);
     });
   
   /* ──────────────────────────────────────────
      STEP 4 — KONFIRMASI & PROSES
   ────────────────────────────────────────── */
   function initStep4() {
     const rows = State.rawData.slice(1);
   
     const srcLabel = State.dataSource === 'file'   ? State.fileName
                    : State.dataSource === 'sample' ? `Contoh (${State.fileName})`
                    : 'Input Manual';
   
     setEl('confirmDataValue',   srcLabel);
     setEl('confirmDataDetail',  `${rows.length} alternatif, ${State.selectedCols.length} kriteria`);
   
     const colsText  = State.selectedCols.slice(0, 3).join(', ') + (State.selectedCols.length > 3 ? '…' : '');
     const typesText = State.selectedCols.map(c => State.criteriaTypes[c] === 'cost' ? '↓' : '↑').join(' ');
     setEl('confirmColsValue',  `${State.selectedCols.length} Kolom`);
     setEl('confirmColsDetail', colsText + ' · ' + typesText);
   
     const METHOD_LABELS = { saw:'SAW', topsis:'TOPSIS', waspas:'WASPAS', moora:'MOORA', edas:'EDAS' };
     setEl('confirmMethodValue',  METHOD_LABELS[State.method] || State.method.toUpperCase());
     setEl('confirmMethodDetail', State.method === 'waspas' ? `λ = ${State.lambda}` : '—');
   
     const wTotal = State.selectedCols.reduce((s, c) => s + (State.weights[c] || 0), 0);
     setEl('confirmWeightValue',  cap(State.weightMethod));
     setEl('confirmWeightDetail', `Total: ${wTotal.toFixed(3)} · ${State.selectedCols.length} kriteria`);
   
     buildConfirmDetailTable();
   
     document.querySelectorAll('.confirm-card-edit').forEach(btn => {
       btn.addEventListener('click', () => {
         const step = parseInt(btn.dataset.goto);
         if (step) goToStep(step);
       });
     });
   }
   
   function buildConfirmDetailTable() {
     const tbody   = document.getElementById('confirmDetailTbody');
     if (!tbody || !State.rawData) return;
   
     const headers = State.rawData[0];
     const rows    = State.rawData.slice(1);
     let html      = '';
   
     State.selectedCols.forEach(col => {
       const ci   = headers.indexOf(col);
       const vals = rows.map(r => parseFloat(r[ci])).filter(v => !isNaN(v));
       const min  = vals.length ? Math.min(...vals) : '—';
       const max  = vals.length ? Math.max(...vals) : '—';
       const avg  = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : '—';
       const type = State.criteriaTypes[col] || 'benefit';
       const w    = State.weights[col] || 0;
   
       html += `<tr>
         <td style="font-weight:500;color:var(--text-primary)">${escHtml(col)}</td>
         <td><span class="weight-input-type ${type}"
           style="font-size:0.72rem;padding:2px 8px;border-radius:999px;font-weight:600;">
           ${type === 'benefit' ? '+ Benefit' : '– Cost'}
         </span></td>
         <td style="font-family:'Syne',sans-serif;font-weight:700">${(w * 100).toFixed(1)}%</td>
         <td>${typeof min === 'number' ? min.toFixed(2) : min}</td>
         <td>${typeof max === 'number' ? max.toFixed(2) : max}</td>
         <td>${typeof avg === 'number' ? avg.toFixed(2) : avg}</td>
       </tr>`;
     });
   
     tbody.innerHTML = html;
   }
   
   document.getElementById('btnStep4Back') &&
     document.getElementById('btnStep4Back').addEventListener('click', () => goToStep(3));
   
   document.getElementById('btnProcess') &&
     document.getElementById('btnProcess').addEventListener('click', runProcess);
   
   async function runProcess() {
     const btnProcess = document.getElementById('btnProcess');
     const statusDiv  = document.getElementById('processStatus');
     const fillEl     = document.getElementById('processProgressFill');
     const labelEl    = document.getElementById('processProgressLabel');
   
     if (btnProcess) btnProcess.disabled = true;
     if (statusDiv)  statusDiv.style.display = 'block';
   
     function setProgress(pct, text) {
       if (fillEl)  fillEl.style.width    = pct + '%';
       if (labelEl) labelEl.textContent   = text;
     }
   
     try {
       setProgress(10, 'Mempersiapkan data…');
       await delay(200);
   
       setProgress(25, 'Membangun matriks keputusan…');
       // ── buildDecisionMatrix dari calculation-engine.js ──
       const dm = buildDecisionMatrix(State);
       await delay(200);
   
       setProgress(50, `Menjalankan metode ${State.method.toUpperCase()}…`);
       // ── runSPK dari calculation-engine.js ──
       const result = runSPK(dm, State.method, State.weights, State.criteriaTypes, State.lambda);
       await delay(300);
   
       setProgress(80, 'Menyusun hasil ranking…');
       await delay(200);
   
       const payload = {
         method:        State.method,
         lambda:        State.lambda,
         weightMethod:  State.weightMethod,
         labelCol:      State.labelCol,
         selectedCols:  State.selectedCols,
         criteriaTypes: State.criteriaTypes,
         weights:       State.weights,
         dataSource:    State.dataSource,
         fileName:      State.fileName,
         rawData:       State.rawData,
         result:        result,
         showSteps:     document.getElementById('chkShowSteps')?.checked ?? true,
         compareAll:    document.getElementById('chkCompareAll')?.checked ?? false,
       };
   
       sessionStorage.setItem('spk_result', JSON.stringify(payload));
   
       setProgress(100, 'Selesai! Mengarahkan ke halaman hasil…');
       await delay(400);
   
       window.location.href = 'result.html';
   
     } catch (err) {
       showToast('Gagal memproses: ' + err.message, 'error');
       if (btnProcess) btnProcess.disabled = false;
       if (statusDiv)  statusDiv.style.display = 'none';
       console.error(err);
     }
   }
   

   /* ──────────────────────────────────────────
      INIT
   ────────────────────────────────────────── */
   (function init() {
     goToStep(1);
   
     try {
       const saved = sessionStorage.getItem('spk_input_state');
       if (saved) {
         const prev = JSON.parse(saved);
         if (prev.method) State.method = prev.method;
       }
     } catch (e) { /* ignore */ }
   })();