/* ================================================================
   CSV PARSE
================================================================ */
function parseCSV(text) {
  const lines = text.trim().split('\n').map(l => l.replace(/\r/g, ''));
  const hdrs  = lines[0].split(',').map(h => h.trim());
  const rows  = lines.slice(1).filter(l => l.trim()).map(l => l.split(',').map(c => c.trim()));
  return { hdrs, rows };
}

/* ================================================================
   DATA CLEANING — Smart Imputation + Delete
   Logika:
   - Baris dengan > 50% kolom kosong → HAPUS
   - Kolom numerik (≤2 kosong per baris) → isi MEDIAN (robust vs outlier)
   - Kolom kategorikal → isi MODUS
   Setelah imputasi → hapus duplikat
================================================================ */
let cleanReport = null;

const MISSING_VALS = new Set(['', '-', 'null', 'na', 'n/a', 'nan', '?', 'none', 'undefined']);

function isMissing(v) {
  return v === undefined || MISSING_VALS.has(String(v).trim().toLowerCase());
}

function isNumericCol(rows, colIdx) {
  // Kolom dianggap numerik jika >60% nilai non-missing bisa di-parseFloat
  let numCount = 0, totalNonMissing = 0;
  for (const r of rows) {
    const v = r[colIdx];
    if (!isMissing(v)) {
      totalNonMissing++;
      if (!isNaN(parseFloat(v)) && isFinite(v)) numCount++;
    }
  }
  return totalNonMissing > 0 && numCount / totalNonMissing > 0.6;
}

function calcMedian(values) {
  const nums = values.map(v => parseFloat(v)).filter(n => !isNaN(n)).sort((a,b) => a-b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 !== 0 ? nums[mid] : ((nums[mid-1] + nums[mid]) / 2);
}

function calcModus(values) {
  const freq = {};
  for (const v of values) { freq[v] = (freq[v] || 0) + 1; }
  return Object.entries(freq).sort((a,b) => b[1]-a[1])[0]?.[0] ?? '';
}

function cleanData(hdrs, rows) {
  const nCols = hdrs.length;
  let removedMissing   = 0;
  let removedDuplicate = 0;
  let imputedCells     = 0;
  const missingCols    = {};   // kol → jumlah cell missing awal
  const imputeDetail   = {};   // kol → { type, value, count }

  // ── Pass 0: catat missing per kolom ──
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < nCols; j++) {
      if (isMissing(rows[i][j])) {
        missingCols[hdrs[j]] = (missingCols[hdrs[j]] || 0) + 1;
      }
    }
  }

  // ── Tentukan tipe tiap kolom (numerik / kategorikal) ──
  const colTypes = hdrs.map((_, j) => isNumericCol(rows, j) ? 'numeric' : 'categorical');

  // ── Hitung nilai imputasi per kolom (dari seluruh data non-missing) ──
  const imputeVal = hdrs.map((h, j) => {
    const nonMissing = rows.map(r => r[j]).filter(v => !isMissing(v));
    if (!nonMissing.length) return null;
    if (colTypes[j] === 'numeric') {
      const med = calcMedian(nonMissing);
      imputeDetail[h] = { type: 'median', value: med };
      return String(med);
    } else {
      const mod = calcModus(nonMissing);
      imputeDetail[h] = { type: 'modus', value: mod };
      return mod;
    }
  });

  // ── Pass 1: proses setiap baris ──
  const afterMissing = [];
  for (let i = 0; i < rows.length; i++) {
    const r = [...rows[i]];  // clone agar tidak merusak asli

    // Hitung berapa banyak kolom kosong di baris ini
    let missingCount = 0;
    for (let j = 0; j < nCols; j++) {
      if (isMissing(r[j])) missingCount++;
    }

    // > 50% kolom kosong → hapus baris
    if (missingCount / nCols > 0.5) {
      removedMissing++;
      continue;
    }

    // ≤ 50% kolom kosong → impute cell yang kosong
    for (let j = 0; j < nCols; j++) {
      if (isMissing(r[j]) && imputeVal[j] !== null) {
        r[j] = imputeVal[j];
        imputedCells++;
        if (imputeDetail[hdrs[j]]) imputeDetail[hdrs[j]].count = (imputeDetail[hdrs[j]].count || 0) + 1;
      }
    }

    afterMissing.push(r);
  }

  // ── Pass 2: hapus duplikat ──
  const seen       = new Set();
  const afterDedup = [];
  for (const r of afterMissing) {
    const key = r.join('\x00');
    if (seen.has(key)) removedDuplicate++;
    else { seen.add(key); afterDedup.push(r); }
  }

  cleanReport = {
    original:     rows.length,
    missing:      removedMissing,
    duplicate:    removedDuplicate,
    imputed:      imputedCells,
    final:        afterDedup.length,
    missingCols,
    imputeDetail,
    colTypes,
    hdrs
  };

  return afterDedup;
}

/* ----------------------------------------------------------------
   Update slider — dipanggil setiap kali slider digeser
   Juga dipanggil dari renderColSelector() agar estimasi baris update
---------------------------------------------------------------- */
function updateSplitSlider(val) {
  val = parseInt(val);
  const testVal = 100 - val;
 
  // Label teks
  document.getElementById('split-label-train').textContent     = val + '%';
  document.getElementById('split-label-test').textContent      = testVal + '%';
  document.getElementById('split-label-train-bar').textContent = val + '%';
  document.getElementById('split-label-test-bar').textContent  = testVal + '%';
 
  // Bar visual
  document.getElementById('split-bar-train').style.width = val + '%';
  document.getElementById('split-bar-test').style.width  = testVal + '%';
 
  // Estimasi jumlah baris (jika csvData sudah ada)
  const estEl = document.getElementById('split-est-rows');
  if (estEl && typeof csvData !== 'undefined' && csvData.length) {
    const n      = csvData.length;
    const nTrain = Math.round(n * val / 100);
    const nTest  = n - nTrain;
    estEl.textContent = `≈ ${nTrain.toLocaleString()} baris train | ${nTest.toLocaleString()} baris test`;
  }
}
 
/* ----------------------------------------------------------------
   Getter — dipakai nb_core.js saat processNB() dipanggil
   Kembalikan rasio TEST (0.0 – 1.0)
---------------------------------------------------------------- */
function getSplitRatio() {
  const trainPct = parseInt(document.getElementById('split-slider').value);
  return (100 - trainPct) / 100;
}

/* ================================================================
   RENDER PREVIEW TABLE
================================================================ */
function renderPreview(hdrs, rows) {
  headers = hdrs; csvData = rows;

  const total    = rows.length;
  const PREVIEW  = 50;   // hanya render 50 baris ke DOM
  const showRows = rows.slice(0, PREVIEW);
  const isLarge  = total > PREVIEW;

  document.getElementById('preview-info').innerHTML =
    `<span class="chip chip-ok">&#10003; ${total.toLocaleString()} baris &nbsp;|&nbsp; ${hdrs.length} kolom dimuat</span>`
    + (isLarge ? ` <span class="chip" style="background:rgba(251,191,36,0.1);color:var(--yellow);border:1px solid rgba(251,191,36,0.3)">Menampilkan ${PREVIEW} baris pertama</span>` : '');

  const t = document.getElementById('preview-table');
  t.innerHTML =
    '<thead><tr>' + hdrs.map(h => `<th>${h}</th>`).join('') + '</tr></thead>' +
    '<tbody>' + showRows.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody>';

  const sel = document.getElementById('class-col-select');
  sel.innerHTML = hdrs.map((h, i) =>
    `<option value="${i}" ${i === hdrs.length - 1 ? 'selected' : ''}>${h}</option>`).join('');

  document.getElementById('preview-section').style.display = 'block';
  renderColSelector();

  // Tampilkan laporan pembersihan data
  let warnHtml = '';
  if (cleanReport) {
    const cr = cleanReport;
    const hasCleaned = cr.missing > 0 || cr.duplicate > 0 || cr.imputed > 0;

    if (hasCleaned) {
      // Detail imputation per kolom
      const imputeRows = Object.entries(cr.imputeDetail || {})
        .filter(([k, v]) => v.count > 0)
        .map(([k, v]) => {
          const typeLabel = v.type === 'median'
            ? `<span style="color:var(--accent)">Median</span>`
            : `<span style="color:var(--yellow)">Modus</span>`;
          return `<tr>
            <td style="padding:3px 10px;color:var(--text)">${k}</td>
            <td style="padding:3px 10px;color:var(--text2)">${v.count} sel</td>
            <td style="padding:3px 10px">${typeLabel}</td>
            <td style="padding:3px 10px;font-family:var(--mono);color:var(--green)">${v.value}</td>
          </tr>`;
        }).join('');

      const missCols = Object.entries(cr.missingCols)
        .map(([k,v]) => `<strong>${k}</strong>: ${v} sel`)
        .join(' &nbsp;·&nbsp; ');

      warnHtml = `
        <div style="margin-top:0.75rem;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.28);
          border-radius:var(--radius);padding:0.85rem 1rem;font-size:18px;color:var(--yellow)">
          <div style="font-weight:600;margin-bottom:6px">⚠ Pembersihan Data Otomatis</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px;font-size:17px">
            <span style="color:var(--text2)">Asli: <strong style="color:var(--text)">${cr.original.toLocaleString()}</strong></span>
            ${cr.missing>0 ? `<span style="color:var(--red)">✗ ${cr.missing} baris dihapus (>50% kolom kosong)</span>` : ''}
            ${cr.imputed>0 ? `<span style="color:var(--accent)">✎ ${cr.imputed} sel diimputasi</span>` : ''}
            ${cr.duplicate>0 ? `<span style="color:var(--red)">✗ ${cr.duplicate} duplikat dihapus</span>` : ''}
            <span style="color:var(--green)">✓ Bersih: <strong>${cr.final.toLocaleString()}</strong></span>
          </div>
          ${missCols ? `<div style="font-size:16px;color:var(--text3);margin-bottom:6px">Kolom dengan missing: ${missCols}</div>` : ''}
          ${imputeRows ? `
          <div style="font-size:16px;font-weight:600;color:var(--text2);margin-bottom:4px">Detail Imputasi:</div>
          <div style="overflow-x:auto">
            <table style="font-size:15px;border-collapse:collapse;min-width:340px">
              <thead>
                <tr style="border-bottom:1px solid rgba(251,191,36,0.2)">
                  <th style="padding:3px 10px;text-align:left;color:var(--text3);font-weight:500">Kolom</th>
                  <th style="padding:3px 10px;text-align:left;color:var(--text3);font-weight:500">Sel diisi</th>
                  <th style="padding:3px 10px;text-align:left;color:var(--text3);font-weight:500">Metode</th>
                  <th style="padding:3px 10px;text-align:left;color:var(--text3);font-weight:500">Nilai</th>
                </tr>
              </thead>
              <tbody>${imputeRows}</tbody>
            </table>
          </div>
          <div style="font-size:14px;color:var(--text3);margin-top:6px;border-top:1px solid rgba(251,191,36,0.15);padding-top:6px">
            Numerik → Median &nbsp;|&nbsp; Kategorikal → Modus &nbsp;|&nbsp; &gt;50% kolom kosong → Baris dihapus
          </div>` : ''}
        </div>`;
    } else {
      warnHtml = `<div style="margin-top:0.75rem">
        <span class="chip chip-ok">✓ Data bersih — tidak ada missing value atau duplikat</span>
      </div>`;
    }
  }
  document.getElementById('preview-warn').innerHTML = warnHtml;
}

/* ================================================================
   UPLOAD & DRAG-DROP
================================================================ */
document.getElementById('csv-input').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    const {hdrs,rows} = parseCSV(ev.target.result);
    const cleaned = cleanData(hdrs, rows);
    renderPreview(hdrs, cleaned);
  };
  r.readAsText(f);
});
const dz = document.getElementById('drop-zone');
dz.addEventListener('dragover',  e => { e.preventDefault(); dz.style.borderColor='var(--accent)'; });
dz.addEventListener('dragleave', ()  => { dz.style.borderColor=''; });
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.style.borderColor='';
  const f = e.dataTransfer.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    const {hdrs,rows} = parseCSV(ev.target.result);
    const cleaned = cleanData(hdrs, rows);
    renderPreview(hdrs, cleaned);
  };
  r.readAsText(f);
});
function loadSample(name) { const {hdrs,rows}=parseCSV(SAMPLES[name]); const cleaned=cleanData(hdrs,rows); renderPreview(hdrs,cleaned); }
function resetInput() {
  csvData=[]; headers=[];
  document.getElementById('preview-section').style.display='none';
  document.getElementById('csv-input').value='';
}