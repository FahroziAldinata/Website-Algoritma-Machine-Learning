/* ============================================================
   knn_worker.js — Web Worker: semua komputasi KNN di sini
   v2: Label Encoding untuk fitur kategoris
   
   Alur encoding:
     1. Deteksi kolom kategoris dari featureCols
     2. Bangun label map dari SELURUH dataset (bukan hanya train)
        agar encoding konsisten antara train & test
     3. Encode → rawRowsEncoded (semua kolom fitur jadi angka)
     4. Split → trainRaw, testRaw (sudah encoded)
     5. Normalisasi Min-Max / Z-Score (sekarang semua kolom bisa dinorm)
     6. Prediksi & evaluasi seperti biasa
   ============================================================ */

/* ============================================================
   UTILS
   ============================================================ */

   function lcgRand(seed) {
    let s = seed >>> 0;
    return function () {
      s = Math.imul(1664525, s) + 1013904223;
      s = s >>> 0;
      return s / 4294967296;
    };
  }
  
  function lcgShuffle(arr, seed) {
    const a = arr.slice();
    const rand = lcgRand(seed);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  
  function stratifiedSplit(rows, classCol, testRatio, seed) {
    const groups = {};
    rows.forEach((r, i) => {
      const cls = r[classCol];
      if (!groups[cls]) groups[cls] = [];
      groups[cls].push(i);
    });
    const trainIdx = [], testIdx = [];
    for (const cls of Object.keys(groups).sort()) {
      const shuffled = lcgShuffle(groups[cls], seed);
      const nTest = Math.max(1, Math.round(shuffled.length * testRatio));
      testIdx.push(...shuffled.slice(0, nTest));
      trainIdx.push(...shuffled.slice(nTest));
    }
    return { trainIdx, testIdx };
  }
  
  function euclidean(a, b, cols) {
    let sum = 0;
    for (const c of cols) { const d = a[c] - b[c]; sum += d * d; }
    return Math.sqrt(sum);
  }
  function manhattan(a, b, cols) {
    let sum = 0;
    for (const c of cols) sum += Math.abs(a[c] - b[c]);
    return sum;
  }
  function minkowski(a, b, cols, p) {
    let sum = 0;
    for (const c of cols) sum += Math.pow(Math.abs(a[c] - b[c]), p);
    return Math.pow(sum, 1 / p);
  }
  function calcDist(a, b, cols, metric, p) {
    if (metric === 'euclidean') return euclidean(a, b, cols);
    if (metric === 'manhattan') return manhattan(a, b, cols);
    if (metric === 'minkowski') return minkowski(a, b, cols, p);
    return euclidean(a, b, cols);
  }
  
  function minMaxStats(rows, numericCols) {
    const stats = {};
    for (const c of numericCols) {
      let mn = Infinity, mx = -Infinity;
      rows.forEach(r => {
        const v = parseFloat(r[c]);
        if (!isNaN(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
      });
      stats[c] = { min: mn, max: mx };
    }
    return stats;
  }
  function zScoreStats(rows, numericCols) {
    const stats = {};
    for (const c of numericCols) {
      let sum = 0, count = 0;
      rows.forEach(r => { const v = parseFloat(r[c]); if (!isNaN(v)) { sum += v; count++; } });
      const mean = sum / count;
      let variance = 0;
      rows.forEach(r => { const v = parseFloat(r[c]); if (!isNaN(v)) variance += (v - mean) ** 2; });
      stats[c] = { mean, std: Math.sqrt(variance / count) };
    }
    return stats;
  }
  function applyNorm(rows, allFeatureCols, normType, stats) {
    return rows.map(r => {
      const nr = { ...r };
      for (const c of allFeatureCols) {
        if (!(c in stats)) continue;  // skip jika tidak ada stats (seharusnya tidak terjadi)
        const v = parseFloat(r[c]);
        if (isNaN(v)) { nr[c] = 0; continue; }
        if (normType === 'minmax') {
          const { min, max } = stats[c];
          nr[c] = max === min ? 0 : (v - min) / (max - min);
        } else if (normType === 'standard') {
          const { mean, std } = stats[c];
          nr[c] = std === 0 ? 0 : (v - mean) / std;
        } else {
          nr[c] = v;
        }
      }
      return nr;
    });
  }
  
  function vote(neighbors, classCol, weighting) {
    const tally = {};
    for (const n of neighbors) {
      const cls = n.row[classCol];
      if (!tally[cls]) tally[cls] = 0;
      if (weighting === 'distance') {
        tally[cls] += n.dist === 0 ? 1e9 : 1 / n.dist;
      } else {
        tally[cls] += 1;
      }
    }
    let best = null, bestScore = -Infinity;
    for (const cls of Object.keys(tally).sort()) {
      if (tally[cls] > bestScore) { bestScore = tally[cls]; best = cls; }
    }
    return { predicted: best, tally };
  }
  
  // Nilai yang dianggap boolean numerik (True/False string dari CSV)
  const BOOL_VALS = new Set(['true','false','True','False','TRUE','FALSE','1','0']);
  
  function isBooleanCol(rows, col) {
    // Kolom dianggap boolean jika semua nilai non-kosong ada di BOOL_VALS
    return rows.every(r => {
      const v = r[col];
      return v === '' || v == null || BOOL_VALS.has(String(v).trim());
    });
  }
  
  function parseBool(v) {
    // True/true/1 → 1, False/false/0 → 0
    const s = String(v).trim().toLowerCase();
    return (s === 'true' || s === '1') ? 1 : 0;
  }
  
  function detectNumeric(rows, cols) {
    return cols.filter(c =>
      rows.every(r => r[c] === '' || r[c] == null || !isNaN(parseFloat(r[c])))
    );
  }
  
  // Boolean cols: True/False string → diperlakukan seperti numerik 1/0
  function detectBoolean(rows, cols) {
    return cols.filter(c => {
      // Bukan numerik murni, tapi semua nilainya boolean string
      const isNum = rows.every(r => r[c] === '' || r[c] == null || !isNaN(parseFloat(r[c])));
      if (isNum) return false;
      return isBooleanCol(rows, c);
    });
  }
  
  function detectCategorical(rows, cols) {
    return cols.filter(c => {
      const isNum  = rows.every(r => r[c] === '' || r[c] == null || !isNaN(parseFloat(r[c])));
      const isBool = isBooleanCol(rows, c);
      // Kategoris = bukan numerik DAN bukan boolean
      return !isNum && !isBool;
    });
  }
  
  /* ============================================================
     LABEL ENCODING
     Bangun map dari seluruh dataset agar encoding konsisten.
     Hasil: { kolom: { 'nilaiA': 0, 'nilaiB': 1, ... } }
     Urutan: alfabetis (sama seperti Python sklearn LabelEncoder)
     ============================================================ */
  function buildLabelEncodings(rows, catCols) {
    const encodings = {};
    catCols.forEach(c => {
      const uniqueVals = [...new Set(rows.map(r => r[c]))]
        .filter(v => v !== '' && v != null)
        .sort();  // alfabetis = konsisten dengan sklearn
      const map = {};
      uniqueVals.forEach((v, i) => { map[v] = i; });
      encodings[c] = map;
    });
    return encodings;
  }
  
  /* ---- Terapkan label encoding ke seluruh rows ---- */
  function applyLabelEncoding(rows, encodings) {
    return rows.map(r => {
      const nr = { ...r };
      for (const [col, map] of Object.entries(encodings)) {
        const v = r[col];
        // Jika nilai tidak dikenal → assign nilai max+1 (rare case)
        nr[col] = v in map ? map[v] : Object.keys(map).length;
      }
      return nr;
    });
  }
  
  /* ============================================================
     CORE
     ============================================================ */
  
  function buildConfusionMatrix(predictions, classes) {
    const cm = {};
    classes.forEach(a => { cm[a] = {}; classes.forEach(p => { cm[a][p] = 0; }); });
    predictions.forEach(({ actual, predicted }) => { if (cm[actual]) cm[actual][predicted]++; });
    return cm;
  }
  
  function calcMetrics(predictions, classes, cm) {
    const correct  = predictions.filter(p => p.correct).length;
    const accuracy = predictions.length === 0 ? 0 : correct / predictions.length;
    const perClass = {};
    classes.forEach(cls => {
      const tp = cm[cls][cls] || 0;
      const fp = classes.reduce((s, a) => a !== cls ? s + (cm[a][cls] || 0) : s, 0);
      const fn = classes.reduce((s, p) => p !== cls ? s + (cm[cls][p] || 0) : s, 0);
      const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
      const recall    = tp + fn === 0 ? 0 : tp / (tp + fn);
      const f1        = precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall);
      perClass[cls]   = { tp, fp, fn, precision, recall, f1 };
    });
    const macro = {
      precision: classes.reduce((s, c) => s + perClass[c].precision, 0) / classes.length,
      recall:    classes.reduce((s, c) => s + perClass[c].recall,    0) / classes.length,
      f1:        classes.reduce((s, c) => s + perClass[c].f1,        0) / classes.length
    };
    return { accuracy, correct, total: predictions.length, perClass, macro };
  }
  
  function predictRow(queryNorm, queryRaw, trainNormSet, trainRawSet, allFeatureCols, classCol, k, metric, p, weighting) {
    const dists = trainNormSet.map((tr, idx) => ({
      idx,
      row:    tr,
      rawRow: trainRawSet[idx],
      dist:   calcDist(queryNorm, tr, allFeatureCols, metric, p)
    }));
    dists.sort((a, b) => a.dist !== b.dist ? a.dist - b.dist : a.idx - b.idx);
    const neighbors = dists.slice(0, k);
    const { predicted, tally } = vote(neighbors, classCol, weighting);
    return {
      queryRawRow:  queryRaw,
      queryNormRow: queryNorm,
      neighbors,
      dists: dists.slice(0, Math.min(k + 3, dists.length)),
      predicted,
      actual:  queryRaw[classCol],
      correct: predicted === queryRaw[classCol],
      tally
    };
  }
  
  function predictSet(normSet, rawSet, trainNorm, trainRaw, allFeatureCols, classCol, k, metric, p, weighting, progressLabel, totalSteps, stepOffset) {
    const results = [];
    const n = normSet.length;
    let lastPct = -1;
  
    for (let i = 0; i < n; i++) {
      results.push(predictRow(
        normSet[i], rawSet[i], trainNorm, trainRaw,
        allFeatureCols, classCol, k, metric, p, weighting
      ));
  
      const pct = Math.floor((stepOffset + (i + 1) / n) / totalSteps * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        self.postMessage({
          type: 'PROGRESS',
          step: progressLabel,
          message: `${progressLabel}: ${i + 1} / ${n} baris`,
          pct
        });
      }
    }
    return results;
  }
  
  /* ============================================================
     ENTRY POINT
     ============================================================ */
  self.onmessage = function (e) {
    if (e.data.type !== 'RUN') return;
  
    try {
      const {
        rawRows, classCol, featureCols,
        k, metric, p, weighting, normType, testRatio, seed
      } = e.data.payload;
  
      // Step 1 — Deteksi tipe kolom
      self.postMessage({ type: 'PROGRESS', step: 'Inisialisasi', message: 'Mendeteksi tipe kolom...', pct: 2 });
      const numericCols = detectNumeric(rawRows, featureCols);
      const boolCols    = detectBoolean(rawRows, featureCols);   // True/False → 1/0
      const catCols     = detectCategorical(rawRows, featureCols);
  
      if (featureCols.length === 0) {
        self.postMessage({ type: 'ERROR', message: 'Pilih minimal 1 kolom fitur.' });
        return;
      }
  
      // Step 2a — Boolean Encoding: True/False → 1/0
      let encodedRows = rawRows;
      let boolEncodings = {};  // { col: { 'True': 1, 'False': 0 } } untuk display
  
      if (boolCols.length > 0) {
        self.postMessage({
          type: 'PROGRESS',
          step: 'Boolean Encoding',
          message: `Encoding ${boolCols.length} kolom boolean (True/False → 1/0)...`,
          pct: 3
        });
        // Buat map display untuk UI
        boolCols.forEach(c => {
          boolEncodings[c] = { 'True': 1, 'False': 0, 'true': 1, 'false': 0 };
        });
        // Terapkan ke rows
        encodedRows = encodedRows.map(r => {
          const nr = { ...r };
          boolCols.forEach(c => { nr[c] = parseBool(r[c]); });
          return nr;
        });
      }
  
      // Step 2b — Label Encoding untuk kolom kategoris (teks)
      let labelEncodings = {};
  
      if (catCols.length > 0) {
        self.postMessage({
          type: 'PROGRESS',
          step: 'Label Encoding',
          message: `Encoding ${catCols.length} kolom kategoris...`,
          pct: 4
        });
  
        // Bangun encoding dari SELURUH dataset agar test set tidak unknown
        labelEncodings = buildLabelEncodings(encodedRows, catCols);
        encodedRows    = applyLabelEncoding(encodedRows, labelEncodings);
      }
  
      // Step 3 — Split (pakai encodedRows)
      self.postMessage({ type: 'PROGRESS', step: 'Split', message: 'Stratified split data...', pct: 6 });
      const { trainIdx, testIdx } = stratifiedSplit(encodedRows, classCol, testRatio, seed);
      const trainRaw = trainIdx.map(i => encodedRows[i]);
      const testRaw  = testIdx.map(i => encodedRows[i]);
  
      // rawRows asli (sebelum encode) untuk display di UI
      const trainRawOrig = trainIdx.map(i => rawRows[i]);
      const testRawOrig  = testIdx.map(i => rawRows[i]);
  
      // Step 4 — Normalisasi semua featureCols (numerik + encoded kategoris)
      // Setelah encoding, semua kolom featureCols sudah numerik
      self.postMessage({ type: 'PROGRESS', step: 'Normalisasi', message: 'Menghitung statistik & normalisasi...', pct: 10 });
  
      let normStats = null;
      const allNumericCols = featureCols; // setelah encode, semua jadi numerik
  
      if (normType !== 'none') {
        normStats = normType === 'minmax'
          ? minMaxStats(trainRaw, allNumericCols)
          : zScoreStats(trainRaw, allNumericCols);
      }
  
      const toNum = (rows) => rows.map(r => ({
        ...r,
        ...Object.fromEntries(allNumericCols.map(c => [c, parseFloat(r[c])]))
      }));
  
      const trainNorm = normType !== 'none'
        ? applyNorm(trainRaw, allNumericCols, normType, normStats)
        : toNum(trainRaw);
      const testNorm  = normType !== 'none'
        ? applyNorm(testRaw, allNumericCols, normType, normStats)
        : toNum(testRaw);
  
      // Step 5 — Prediksi Test
      self.postMessage({ type: 'PROGRESS', step: 'Prediksi Test', message: 'Memprediksi test set...', pct: 10 });
      const testPredictions = predictSet(
        testNorm, testRawOrig, trainNorm, trainRawOrig,
        allNumericCols, classCol, k, metric, p, weighting,
        'Prediksi Test', 2, 0
      );
  
      // Step 6 — Prediksi Training
      self.postMessage({ type: 'PROGRESS', step: 'Prediksi Training', message: 'Memprediksi training set...', pct: 65 });
      const trainPredictions = predictSet(
        trainNorm, trainRawOrig, trainNorm, trainRawOrig,
        allNumericCols, classCol, k, metric, p, weighting,
        'Prediksi Training', 2, 1
      );
  
      // Step 7 — Evaluasi
      self.postMessage({ type: 'PROGRESS', step: 'Evaluasi', message: 'Menghitung metrik evaluasi...', pct: 92 });
      const classes      = [...new Set(rawRows.map(r => r[classCol]))].sort();
      const testCM       = buildConfusionMatrix(testPredictions,  classes);
      const trainCM      = buildConfusionMatrix(trainPredictions, classes);
      const testMetrics  = calcMetrics(testPredictions,  classes, testCM);
      const trainMetrics = calcMetrics(trainPredictions, classes, trainCM);
  
      self.postMessage({ type: 'PROGRESS', step: 'Selesai', message: 'Menyiapkan tampilan...', pct: 98 });
  
      self.postMessage({
        type: 'DONE',
        result: {
          k, metric, p, weighting, normType,
          featureCols,
          numericCols,       // kolom numerik asli
          boolCols,          // kolom boolean asli (True/False)
          catCols,           // kolom kategoris teks asli
          boolEncodings,     // { col: { True:1, False:0 } } untuk display
          labelEncodings,    // { col: { nilai: angka } } untuk display
          allNumericCols,    // semua featureCols setelah encode
          trainRaw:     trainRawOrig,   // nilai asli untuk display
          testRaw:      testRawOrig,
          trainNorm,
          testNorm,
          normStats,         // mencakup SEMUA featureCols (bool+cat+num)
          predictions:  testPredictions,
          cm:           testCM,
          metrics:      testMetrics,
          trainPredictions,
          trainCM,
          trainMetrics,
          classes,
          trainIdx, testIdx,
          splitRatio: 1 - testRatio,
          totalRows: rawRows.length,
          seed
        }
      });
  
    } catch (err) {
      self.postMessage({ type: 'ERROR', message: err.message || String(err) });
    }
  };