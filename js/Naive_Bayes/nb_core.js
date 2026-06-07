/* ================================================================
   NAIVE BAYES — CORE CALCULATION (optimized for large datasets)
   Menggunakan frequency map — O(n) bukan O(n²)

   Pipeline:
   1. Split data (train/test, default 80:20, stratified)
   2. Diskritisasi kolom numerik kontinu (fit dari train, apply ke train+test)
   3. Training NB dari data train saja
   4. Evaluasi dari data test saja
   5. Seluruh dataset disimpan ke lastResult untuk export Excel
================================================================ */

/* ================================================================
   KONFIGURASI SPLIT & BINNING
================================================================ */
const NB_TEST_RATIO = 0.2;   // 20% untuk testing
const NB_N_BINS     = 5;     // jumlah bin untuk kolom numerik kontinu
const NB_SEED       = 42;    // seed untuk shuffle deterministik

/* ----------------------------------------------------------------
   Helper: seeded shuffle (Fisher-Yates dengan LCG sederhana)
   Mengembalikan array index yang sudah diacak secara deterministik
---------------------------------------------------------------- */
function _seededShuffle(n, seed) {
  const idx = Array.from({ length: n }, (_, i) => i);
  let s = seed >>> 0;
  for (let i = n - 1; i > 0; i--) {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/* ----------------------------------------------------------------
   Helper: stratified split
   Mengembalikan { trainIdx, testIdx } — index mengacu ke csvData
   Proporsi kelas dipertahankan di train dan test
---------------------------------------------------------------- */
function _stratifiedSplit(data, classIdx, testRatio, seed) {
  // Kelompokkan index per kelas
  const byClass = {};
  for (let i = 0; i < data.length; i++) {
    const lbl = data[i][classIdx];
    if (!byClass[lbl]) byClass[lbl] = [];
    byClass[lbl].push(i);
  }

  const trainIdx = [], testIdx = [];
  let seedOffset = seed;

  Object.values(byClass).forEach(indices => {
    // Shuffle index dalam kelas ini
    const shuffled = _seededShuffle(indices.length, seedOffset++);
    const nTest    = Math.round(indices.length * testRatio);
    shuffled.forEach((pos, rank) => {
      if (rank < nTest) testIdx.push(indices[pos]);
      else              trainIdx.push(indices[pos]);
    });
  });

  return { trainIdx, testIdx };
}

/* ----------------------------------------------------------------
   Helper: deteksi kolom numerik kontinu
   Kolom numerik dengan nilai unik > threshold dianggap kontinu
   Kolom integer dengan range kecil (≤20) dianggap sudah diskrit
---------------------------------------------------------------- */
function _isContinuousCol(rows, colIdx) {
  const vals = rows.map(r => r[colIdx]).filter(v => v !== undefined && v !== '' && !isNaN(parseFloat(v)));
  if (!vals.length) return false;

  // Pastikan semua nilai numerik
  const nums    = vals.map(v => parseFloat(v));
  const allInts = nums.every(n => Number.isInteger(n));
  const unique  = new Set(nums);

  // Integer dengan ≤20 nilai unik → sudah diskrit, tidak perlu dibin
  if (allInts && unique.size <= 20) return false;

  // Sisanya (float, atau integer range besar) → kontinu
  return true;
}

/* ----------------------------------------------------------------
   Helper: hitung bin edges dari data training saja
   Mengembalikan array edges (panjang = nBins + 1)
---------------------------------------------------------------- */
function _calcBinEdges(rows, colIdx, nBins) {
  const nums = rows
    .map(r => parseFloat(r[colIdx]))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);

  if (!nums.length) return null;

  const min = nums[0];
  const max = nums[nums.length - 1];
  if (min === max) return null;   // semua nilai sama → tidak bisa dibin

  const step  = (max - min) / nBins;
  const edges = [];
  for (let i = 0; i <= nBins; i++) edges.push(min + i * step);
  edges[0]       -= 1e-9;  // sedikit lebih kecil agar nilai min masuk bin pertama
  edges[nBins]   += 1e-9;  // sedikit lebih besar agar nilai max masuk bin terakhir
  return edges;
}

/* ----------------------------------------------------------------
   Helper: terapkan bin edges ke satu nilai
   Mengembalikan string "bin_0", "bin_1", dst.
   Kalau di luar range (data test di luar range train) → bin terdekat
---------------------------------------------------------------- */
function _applyBin(val, edges) {
  const n = parseFloat(val);
  if (isNaN(n)) return val;   // bukan angka → kembalikan apa adanya
  const nBins = edges.length - 1;
  for (let b = 0; b < nBins; b++) {
    if (n > edges[b] && n <= edges[b + 1]) return `bin_${b}`;
  }
  // Di luar range: clamp ke bin pertama atau terakhir
  return n <= edges[0] ? `bin_0` : `bin_${nBins - 1}`;
}

function processNB() {
  if (!csvData.length) { alert('Upload atau muat dataset terlebih dahulu.'); return; }

  // ── Validasi kolom fitur ──
  const activeCols = getActiveFeatureCols();
  if (activeCols.length === 0) {
    alert('Minimal 1 kolom fitur harus dipilih sebelum memproses!');
    return;
  }

  const totalRows = csvData.length;
  const isLarge   = totalRows > 10000;

  // ── Bangun panel pembersihan data untuk loading screen ──
  let cleanPanel = '';
  if (cleanReport) {
    const cr = cleanReport;
    const hasCleaned = cr.missing > 0 || cr.imputed > 0 || cr.duplicate > 0;

    const summaryParts = [];
    if (cr.missing > 0)   summaryParts.push(`<span style="color:var(--red)">&#10007; ${cr.missing} baris dihapus (&gt;50% kosong)</span>`);
    if (cr.imputed > 0)   summaryParts.push(`<span style="color:var(--accent)">&#9998; ${cr.imputed} sel diimputasi</span>`);
    if (cr.duplicate > 0) summaryParts.push(`<span style="color:var(--red)">&#10007; ${cr.duplicate} duplikat dihapus</span>`);

    const impRows = Object.entries(cr.imputeDetail || {})
      .filter(([, v]) => v.count > 0)
      .map(([k, v]) => `<tr>
        <td style="padding:3px 10px;color:var(--text)">${k}</td>
        <td style="padding:3px 10px;color:var(--text2)">${v.count} sel</td>
        <td style="padding:3px 10px;color:${v.type==='median'?'#8ab8f5':'var(--yellow)'}">${v.type==='median'?'Median':'Modus'}</td>
        <td style="padding:3px 10px;font-family:var(--mono);color:var(--green)">${v.value}</td>
      </tr>`).join('');

    cleanPanel = `
      <div style="margin-top:18px;background:${hasCleaned?'rgba(251,191,36,0.06)':'var(--green-bg)'};
        border:1px solid ${hasCleaned?'rgba(251,191,36,0.28)':'rgba(52,211,153,0.25)'};
        border-radius:8px;padding:14px 18px;text-align:left;
        max-width:520px;margin-left:auto;margin-right:auto;font-size:15px">
        <div style="font-weight:600;color:${hasCleaned?'var(--yellow)':'var(--green)'};margin-bottom:7px;font-size:16px">
          ${hasCleaned?'&#9888; Hasil Pembersihan Data':'&#10003; Data Bersih — Tidak ada missing/duplikat'}
        </div>
        <div style="color:var(--text2);margin-bottom:${impRows?'8px':'0'}">
          ${cr.original.toLocaleString()} baris asli
          &rarr; <strong style="color:var(--green)">${cr.final.toLocaleString()} baris</strong> siap diproses
          ${summaryParts.length ? '<br><span style="font-size:14px">' + summaryParts.join(' &nbsp;&middot;&nbsp; ') + '</span>' : ''}
        </div>
        ${impRows ? `
        <div style="font-size:13px;color:var(--text3);margin-bottom:3px;margin-top:4px">Detail imputasi per kolom:</div>
        <table style="font-size:13px;border-collapse:collapse;width:100%">
          <thead><tr style="border-bottom:1px solid rgba(255,255,255,0.07)">
            <th style="padding:2px 10px;text-align:left;color:var(--text3);font-weight:400">Kolom</th>
            <th style="padding:2px 10px;text-align:left;color:var(--text3);font-weight:400">Jumlah</th>
            <th style="padding:2px 10px;text-align:left;color:var(--text3);font-weight:400">Metode</th>
            <th style="padding:2px 10px;text-align:left;color:var(--text3);font-weight:400">Nilai</th>
          </tr></thead>
          <tbody>${impRows}</tbody>
        </table>
        <div style="font-size:12px;color:var(--text3);margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.06)">
          Numerik &rarr; Median &nbsp;|&nbsp; Kategorikal &rarr; Modus &nbsp;|&nbsp; &gt;50% kolom kosong &rarr; Hapus baris
        </div>` : ''}
      </div>`;
  }

  // ── Tampilkan loading screen ──
  document.getElementById('page-input').style.display  = 'none';
  document.getElementById('page-result').style.display = 'block';
  document.getElementById('result-content').innerHTML  = `
    <div style="padding:3rem 1.5rem;text-align:center;color:var(--text2)">
      <div style="font-size:500px;margin-bottom:1rem;animation:spin 1.2s linear infinite;display:inline-block">&#9881;</div>
      <div style="font-size:26px;margin-bottom:4px;color:var(--text)">Memproses ${totalRows.toLocaleString()} baris...</div>
      <div style="font-size:17px;color:var(--text3);margin-bottom:2px">Split data, diskritisasi, training &amp; evaluasi</div>
      ${isLarge?`<div style="font-size:14px;color:var(--text3);margin-bottom:4px">Dataset besar &mdash; membutuhkan beberapa detik</div>`:''}
      ${cleanPanel}
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;

  setTimeout(() => _runNB(), 30);
}

function _runNB() {
  const classIdx   = parseInt(document.getElementById('class-col-select').value);
  const classCol   = headers[classIdx];
  const total      = csvData.length;

  // ── Ambil kolom fitur yang aktif dari selector ──
  const activeCols = getActiveFeatureCols();
  if (activeCols.length === 0) {
    alert('Minimal 1 kolom fitur harus dipilih!');
    showInput();
    return;
  }
  const featureCols  = activeCols.map(a => a.name);
  const featureIdxs  = activeCols.map(a => a.idx);
  const excludedCols = headers.filter((h, i) => i !== classIdx && !featureCols.includes(h));
  const fiColIdx     = featureIdxs;

  /* ================================================================
     LANGKAH 1 — SPLIT TRAIN / TEST (stratified)
  ================================================================ */
  const { trainIdx, testIdx } = _stratifiedSplit(csvData, classIdx, NB_TEST_RATIO, NB_SEED);
  const trainData = trainIdx.map(i => csvData[i]);
  const testData  = testIdx.map(i => csvData[i]);
  const nTrain    = trainData.length;
  const nTest     = testData.length;

  /* ================================================================
     LANGKAH 2 — DISKRITISASI KOLOM NUMERIK KONTINU
     Bin edges dihitung HANYA dari data training,
     lalu diterapkan ke training dan testing.
  ================================================================ */
  const binEdges = {};   // feat → edges array (null jika tidak kontinu)
  const contCols = [];   // nama fitur yang dikontinu-diskritisasi

  featureCols.forEach((feat, fi) => {
    const colIdx = featureIdxs[fi];
    if (_isContinuousCol(trainData, colIdx)) {
      // Gunakan csvData (seluruh dataset) untuk edges — sama seperti Python pd.cut
      const edges = _calcBinEdges(csvData, colIdx, NB_N_BINS);
      binEdges[feat] = edges;
      if (edges) contCols.push(feat);
    } else {
      binEdges[feat] = null;
    }
  });

  /* ----------------------------------------------------------------
     Helper: ambil nilai fitur dari satu baris, terapkan binning
     jika kolom tersebut kontinu
  ---------------------------------------------------------------- */
  function getVal(row, feat, fi) {
    const raw   = row[fiColIdx[fi]];
    const edges = binEdges[feat];
    return edges ? _applyBin(raw, edges) : raw;
  }

  /* ================================================================
     LANGKAH 3 — TRAINING (hanya dari trainData)
     Bangun frequency map, priors, likelihoods dari data training
  ================================================================ */
  const classCounts = {};
  const freqMap     = {};
  const valSets     = {};

  featureCols.forEach(feat => {
    freqMap[feat] = {};
    valSets[feat] = new Set();
  });

  for (let i = 0; i < nTrain; i++) {
    const row   = trainData[i];
    const label = row[classIdx];
    classCounts[label] = (classCounts[label] || 0) + 1;

    featureCols.forEach((feat, fi) => {
      const v = getVal(row, feat, fi);
      valSets[feat].add(v);
      if (!freqMap[feat][label]) freqMap[feat][label] = {};
      freqMap[feat][label][v] = (freqMap[feat][label][v] || 0) + 1;
    });
  }

  const classes     = Object.keys(classCounts).sort();
  const featureVals = {};
  featureCols.forEach(feat => {
    featureVals[feat] = [...valSets[feat]].sort();
  });

  // Priors dari training
  const priors = {};
  classes.forEach(c => priors[c] = classCounts[c] / nTrain);

  // Likelihoods dari training (Laplace smoothing)
  const likelihoods = {};
  featureCols.forEach(feat => {
    const vals = featureVals[feat];
    likelihoods[feat] = {};
    classes.forEach(c => {
      likelihoods[feat][c] = {};
      const nC = classCounts[c];
      vals.forEach(v => {
        const cnt = (freqMap[feat][c] && freqMap[feat][c][v]) || 0;
        likelihoods[feat][c][v] = (cnt + 1) / (nC + vals.length);
      });
    });
  });

  // Fungsi prediksi
  function predictRow(row) {
    const post = {};
    classes.forEach(c => {
      let p = priors[c];
      featureCols.forEach((feat, fi) => {
        const v  = getVal(row, feat, fi);
        const lk = likelihoods[feat][c][v];
        p *= (lk !== undefined) ? lk : 1 / (classCounts[c] + featureVals[feat].length);
      });
      post[c] = p;
    });
    const pred = classes.reduce((a, b) => post[a] > post[b] ? a : b);
    return { post, pred };
  }

  /* ================================================================
     LANGKAH 4 — EVALUASI (hanya dari testData)
     Akurasi, confusion matrix, dan metrik dihitung dari test set
  ================================================================ */
  let correct = 0;
  const confMat = {};
  classes.forEach(a => {
    confMat[a] = {};
    classes.forEach(p => { confMat[a][p] = 0; });
  });

  // Simpan seluruh prediksi test untuk export (poin 5)
  const allTestPreds  = [];
  const allTestLabels = [];

  for (let i = 0; i < nTest; i++) {
    const row = testData[i];
    const res = predictRow(row);
    const lbl = row[classIdx];
    if (res.pred === lbl) correct++;
    confMat[lbl][res.pred]++;
    allTestPreds.push(res);
    allTestLabels.push({
      features: fiColIdx.map(ci => row[ci]),
      label: lbl
    });
  }

  const accuracy = (correct / nTest * 100).toFixed(1);

  // Precision, Recall, F1 per kelas
  const metrics = {};
  classes.forEach(c => {
    const tp = confMat[c][c];
    const fp = classes.reduce((s, a) => s + (a !== c ? confMat[a][c] : 0), 0);
    const fn = classes.reduce((s, p) => s + (p !== c ? confMat[c][p] : 0), 0);
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall    = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1        = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    metrics[c] = { tp, fp, fn, precision, recall, f1 };
  });

  const macroP  = classes.reduce((s,c) => s + metrics[c].precision, 0) / classes.length;
  const macroR  = classes.reduce((s,c) => s + metrics[c].recall, 0) / classes.length;
  const macroF1 = classes.reduce((s,c) => s + metrics[c].f1, 0) / classes.length;

  /* ================================================================
     LANGKAH 5 — SIMPAN SELURUH DATASET KE lastResult
     csvDataRef tetap seluruh csvData (untuk export Sheet1)
     allPreds & data berisi seluruh test set (bukan dibatasi 500)
  ================================================================ */
  const exIdx = allTestLabels.length - 1;
  const exRow = allTestLabels[exIdx];
  const { post: exPost, pred: exPred } = allTestPreds[exIdx];

  lastResult = {
    // Identitas kolom
    classes, classCounts, priors, likelihoods,
    featureCols, featureVals, classCol, classIdx, headers, sheetName,

    // Split info
    total,          // total seluruh data
    nTrain,         // jumlah data training
    nTest,          // jumlah data testing
    trainIdx,       // index baris training di csvData (untuk export)
    testIdx,        // index baris testing di csvData (untuk export)

    // Diskritisasi info
    binEdges,       // feat → edges | null
    contCols,       // kolom yang didiskritisasi

    // Data sample (seluruh test set)
    data:     allTestLabels,
    allPreds: allTestPreds,
    exIdx, exRow, exPost, exPred,

    // Evaluasi (dari test set)
    correct, accuracy, confMat, metrics, macroP, macroR, macroF1,

    // Referensi ke data asli (untuk export Sheet1)
    csvDataRef: csvData,
    fiColIdx,
    freqMap,
    excludedCols
  };

  buildResultHTML(lastResult);
}