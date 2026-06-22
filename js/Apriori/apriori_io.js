/* =====================================================
   apriori_io.js
   File upload, sample datasets, config state
   ===================================================== */

/* ---- Global State ---- */
window.APR = {
  rawRows: [],          // [{TID, items:[]}]
  transactions: [],     // string[][] (items per transaction)
  tids: [],             // transaction IDs
  allItems: [],         // sorted unique items
  minSupport: 0.10,
  minConfidence: 0.60,
  maxItemsetSize: 3,
  lcgSeed: 42,
};

/* ---- Sample Datasets ---- */
const SAMPLE_DATASETS = {
  supermarket: {
    name: 'Supermarket (10 transaksi)',
    rows: [
      { TID: 'T001', items: ['Roti', 'Susu', 'Mentega'] },
      { TID: 'T002', items: ['Roti', 'Susu'] },
      { TID: 'T003', items: ['Susu', 'Popok', 'Bir', 'Telur'] },
      { TID: 'T004', items: ['Roti', 'Mentega', 'Bir'] },
      { TID: 'T005', items: ['Roti', 'Susu', 'Popok', 'Bir'] },
      { TID: 'T006', items: ['Roti', 'Susu', 'Mentega', 'Bir'] },
      { TID: 'T007', items: ['Susu', 'Popok', 'Bir'] },
      { TID: 'T008', items: ['Roti', 'Susu', 'Popok'] },
      { TID: 'T009', items: ['Roti', 'Mentega'] },
      { TID: 'T010', items: ['Susu', 'Popok', 'Telur'] },
    ]
  },
  toko: {
    name: 'Toko Kelontong (15 transaksi)',
    rows: [
      { TID: 'T01', items: ['Indomie', 'Telur', 'Kecap'] },
      { TID: 'T02', items: ['Indomie', 'Telur', 'Minyak'] },
      { TID: 'T03', items: ['Telur', 'Gula', 'Kopi'] },
      { TID: 'T04', items: ['Indomie', 'Kecap', 'Gula'] },
      { TID: 'T05', items: ['Indomie', 'Telur', 'Kecap', 'Gula'] },
      { TID: 'T06', items: ['Minyak', 'Gula', 'Kopi'] },
      { TID: 'T07', items: ['Indomie', 'Minyak', 'Kecap'] },
      { TID: 'T08', items: ['Telur', 'Kecap', 'Kopi'] },
      { TID: 'T09', items: ['Indomie', 'Telur', 'Minyak', 'Kecap'] },
      { TID: 'T10', items: ['Gula', 'Kopi', 'Minyak'] },
      { TID: 'T11', items: ['Indomie', 'Gula', 'Kopi'] },
      { TID: 'T12', items: ['Telur', 'Minyak', 'Gula'] },
      { TID: 'T13', items: ['Indomie', 'Telur', 'Kecap'] },
      { TID: 'T14', items: ['Kecap', 'Gula', 'Kopi'] },
      { TID: 'T15', items: ['Indomie', 'Telur', 'Minyak', 'Gula'] },
    ]
  }
};

/* ---- Load Sample ---- */
function loadSample(key) {
  const ds = SAMPLE_DATASETS[key];
  if (!ds) return;
  APR.rawRows = ds.rows.map(r => ({ TID: r.TID, items: [...r.items] }));
  afterLoad();
}

/* ---- CSV Parse ---- */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return alert('CSV kosong atau hanya header.');

  // Detect separator
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));

  // Find TID column (first col named TID/No/ID/TransactionID, case-insensitive)
  const tidColIdx = headers.findIndex(h => /^(tid|no|id|transaction.?id)$/i.test(h));

  APR.rawRows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.every(c => c === '')) continue;

    const tid = tidColIdx >= 0 ? (cols[tidColIdx] || `T${i}`) : `T${i}`;
    // Items = all non-empty, non-TID columns
    const items = cols
      .filter((_, idx) => idx !== tidColIdx)
      .filter(v => v !== '' && v !== '-' && v !== 'null')
      .map(v => v.trim());

    if (items.length > 0) {
      APR.rawRows.push({ TID: tid, items });
    }
  }
  if (APR.rawRows.length === 0) return alert('Tidak ada transaksi valid di CSV.');
  afterLoad();
}

/* ---- After Load ---- */
function afterLoad() {
  // Derive transactions & allItems
  APR.transactions = APR.rawRows.map(r => [...r.items]);
  APR.tids = APR.rawRows.map(r => r.TID);

  const itemSet = new Set();
  APR.transactions.forEach(t => t.forEach(it => itemSet.add(it)));
  APR.allItems = [...itemSet].sort();

  renderPreview();
  document.getElementById('preview-section').style.display = '';
  document.getElementById('config-section').style.display = '';
  document.getElementById('page-result').style.display = 'none';
  document.getElementById('result-content').innerHTML = '';

  // Render item chips di preview
  const itemsEl = document.getElementById('items-display');
  if (itemsEl) {
    itemsEl.innerHTML = APR.allItems.map(it =>
      `<span class="item-chip" style="font-size:16px">${it}</span>`
    ).join('');
  }

  // Update support hint sesuai jumlah transaksi
  updateSupportHint();
}

/* ---- Support Count Hint ---- */
function updateSupportHint() {
  const el = document.getElementById('support-count-hint');
  if (el && APR.transactions.length > 0) {
    const needed = Math.ceil(APR.minSupport * APR.transactions.length);
    el.textContent = `${needed} dari ${APR.transactions.length}`;
  }
}

/* ---- File Input ---- */
function initIO() {
  const inp = document.getElementById('csv-input');
  const dz  = document.getElementById('drop-zone');

  inp.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => parseCSV(ev.target.result);
    reader.readAsText(f);
  });

  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => parseCSV(ev.target.result);
    reader.readAsText(f);
  });
}

/* ---- Render Preview Table ---- */
function renderPreview() {
  const rows = APR.rawRows;
  const tbl = document.getElementById('preview-table');
  let html = '<thead><tr><th>TID</th><th>Items</th><th># Items</th></tr></thead><tbody>';
  const show = Math.min(rows.length, 20);
  for (let i = 0; i < show; i++) {
    const r = rows[i];
    html += `<tr>
      <td class="mono">${r.TID}</td>
      <td>${r.items.map(it => `<span class="item-chip">${it}</span>`).join(' ')}</td>
      <td class="mono">${r.items.length}</td>
    </tr>`;
  }
  if (rows.length > 20) {
    html += `<tr><td colspan="3" style="color:var(--text3);text-align:center;font-size:18px">... ${rows.length - 20} baris lagi tidak ditampilkan</td></tr>`;
  }
  html += '</tbody>';
  tbl.innerHTML = html;

  document.getElementById('preview-info').innerHTML =
    `<div class="success-box" style="font-size:20px">
      ✓ <strong>${rows.length}</strong> transaksi dimuat &nbsp;·&nbsp;
      <strong>${APR.allItems.length}</strong> item unik &nbsp;·&nbsp;
      Rata-rata <strong>${(APR.transactions.reduce((s,t)=>s+t.length,0)/rows.length).toFixed(1)}</strong> item/transaksi
    </div>`;
}

/* ---- Update Sliders ---- */
function updateSupportSlider(v) {
  APR.minSupport = parseFloat(v);
  document.getElementById('support-display').textContent = (APR.minSupport * 100).toFixed(0) + '%';
  updateSupportBar();
  updateSupportHint();
}
function updateConfSlider(v) {
  APR.minConfidence = parseFloat(v);
  document.getElementById('conf-display').textContent = (APR.minConfidence * 100).toFixed(0) + '%';
  const confHint = document.getElementById('conf-hint');
  if (confHint) confHint.textContent = (APR.minConfidence * 100).toFixed(0) + '%';
}
function updateSupportBar() {
  const pct = ((APR.minSupport - 0.01) / (1.0 - 0.01) * 100).toFixed(1);
  document.getElementById('support-bar-fill').style.width = pct + '%';
}
function updateMaxItemset(v) {
  APR.maxItemsetSize = parseInt(v);
}
function updateLCGSeed(v) {
  APR.lcgSeed = parseInt(v) || 42;
}

/* ---- Reset ---- */
function resetInput() {
  APR.rawRows = []; APR.transactions = []; APR.tids = []; APR.allItems = [];
  document.getElementById('preview-section').style.display = 'none';
  document.getElementById('config-section').style.display = 'none';
  document.getElementById('page-result').style.display = 'none';
  document.getElementById('result-content').innerHTML = '';
  document.getElementById('csv-input').value = '';
}

document.addEventListener('DOMContentLoaded', initIO);