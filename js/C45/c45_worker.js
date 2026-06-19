/* ============================================================
   c45_worker.js — Web Worker: semua komputasi C4.5 di sini
   Pola identik dengan knn_worker.js

   Pesan masuk  (main → worker):
     { type: 'RUN', payload: { ... } }

   Pesan keluar (worker → main):
     { type: 'PROGRESS', step, message, pct }
     { type: 'DONE',     result: { tree, steps, ... } }
     { type: 'ERROR',    message }
   ============================================================ */

/* ============================================================
   LCG UTILS (inline — worker tidak bisa import)
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

/* ============================================================
   STRATIFIED SPLIT
   ============================================================ */
function stratifiedSplit(rows, classIdx, testRatio, seed) {
  const byClass = {};
  rows.forEach(r => {
    const cls = r[classIdx];
    if (!byClass[cls]) byClass[cls] = [];
    byClass[cls].push(r);
  });
  const trainRows = [], testRows = [];
  let seedOffset = 0;
  for (const cls of Object.keys(byClass).sort()) {
    const group = lcgShuffle(byClass[cls], seed + seedOffset);
    const nTest = Math.max(1, Math.round(group.length * testRatio));
    if (group.length < 2) {
      trainRows.push(...group);
    } else {
      testRows.push(...group.slice(0, nTest));
      trainRows.push(...group.slice(nTest));
    }
    seedOffset += 100;
  }
  return { trainRows, testRows };
}

/* ============================================================
   MATH / ENTROPY UTILS
   ============================================================ */
function entropy(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let H = 0;
  for (const c of counts) {
    if (c === 0) continue;
    const p = c / total;
    H -= p * Math.log2(p);
  }
  return H;
}

function entropyFromLabels(labels) {
  const freq = {};
  for (const l of labels) freq[l] = (freq[l] || 0) + 1;
  return entropy(Object.values(freq));
}

function classFreq(labels) {
  const freq = {};
  for (const l of labels) freq[l] = (freq[l] || 0) + 1;
  return freq;
}

function majorityClass(labels) {
  const freq = classFreq(labels);
  return Object.keys(freq).reduce((a, b) => {
    if (freq[a] !== freq[b]) return freq[a] > freq[b] ? a : b;
    return a <= b ? a : b;
  });
}

function isPure(labels) {
  return new Set(labels).size === 1;
}

function fmt(n, d) {
  d = d === undefined ? 4 : d;
  if (typeof n !== 'number' || isNaN(n)) return '—';
  return parseFloat(n.toFixed(d)).toString();
}

/* ============================================================
   DETECT COL TYPES
   ============================================================ */
function detectColTypes(headers, rows) {
  return headers.map(function(h, i) {
    var vals = rows.map(function(r) { return r[i]; })
                   .filter(function(v) { return v !== '' && v !== null && v !== undefined; });
    var numCount = vals.filter(function(v) {
      return !isNaN(parseFloat(v)) && isFinite(v);
    }).length;
    return numCount / vals.length > 0.8 ? 'num' : 'cat';
  });
}

/* ============================================================
   INFORMATION GAIN — KATEGORIKAL
   ============================================================ */
function infoGainCat(rows, attrIdx, classIdx) {
  const total   = rows.length;
  const parentH = entropyFromLabels(rows.map(r => r[classIdx]));
  const groups  = {};
  for (const r of rows) {
    const val = r[attrIdx];
    if (!groups[val]) groups[val] = [];
    groups[val].push(r[classIdx]);
  }
  let weightedH = 0;
  const splitFracs = [];
  for (const val of Object.keys(groups)) {
    const g    = groups[val];
    const frac = g.length / total;
    weightedH += frac * entropyFromLabels(g);
    splitFracs.push(frac);
  }
  const gain = parentH - weightedH;
  let si = 0;
  for (const f of splitFracs) {
    if (f > 0) si -= f * Math.log2(f);
  }
  const gainRatio = si === 0 ? 0 : gain / si;
  return { gain, gainRatio, splitInfo: si, groups, parentH, weightedH };
}

/* ============================================================
   INFORMATION GAIN — NUMERIK  (optimasi single-pass per threshold)
   Kandidat threshold hanya di boundary beda kelas (Quinlan 1993).
   _evalThresholdFast menggunakan sorted array — O(n) per threshold.
   ============================================================ */
function infoGainNum(rows, attrIdx, classIdx, thresholdMode, criterion) {
  thresholdMode = thresholdMode || 'midpoint';
  criterion     = criterion     || 'gain_ratio';

  const total   = rows.length;
  const parentH = entropyFromLabels(rows.map(r => r[classIdx]));
  const sorted  = rows.slice().sort(function(a, b) {
    return parseFloat(a[attrIdx]) - parseFloat(b[attrIdx]);
  });

  if (thresholdMode === 'mean') {
    const mean = rows.reduce(function(s, r) { return s + parseFloat(r[attrIdx]); }, 0) / total;
    return Object.assign({ threshold: mean }, _evalThreshold(rows, attrIdx, classIdx, mean, parentH, total));
  }

  /* ---- Kandidat threshold: midpoint boundary beda kelas ---- */
  const candidates = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const va = parseFloat(sorted[i][attrIdx]);
    const vb = parseFloat(sorted[i + 1][attrIdx]);
    if (va === vb) continue;
    if (sorted[i][classIdx] === sorted[i + 1][classIdx]) continue;
    const mid = (va + vb) / 2;
    if (candidates.indexOf(mid) === -1) candidates.push(mid);
  }
  if (candidates.length === 0) {
    for (let i = 0; i < sorted.length - 1; i++) {
      const va = parseFloat(sorted[i][attrIdx]);
      const vb = parseFloat(sorted[i + 1][attrIdx]);
      if (va === vb) continue;
      const mid = (va + vb) / 2;
      if (candidates.indexOf(mid) === -1) candidates.push(mid);
    }
  }
  if (candidates.length === 0) {
    return { gain: 0, gainRatio: 0, splitInfo: 0, threshold: null, groups: null, parentH, weightedH: parentH };
  }

  /* ---- Evaluasi setiap kandidat — gunakan _evalThresholdFast ---- */
  // Pre-compute label array sorted (lebih cepat dari filter() berulang)
  const sortedLabels = sorted.map(r => r[classIdx]);

  let bestScore = -Infinity, bestGain = 0, bestGainRatio = 0;
  let bestThreshold = null, bestGroups = null, bestSplitInfo = 0;

  for (const t of candidates) {
    const r     = _evalThresholdFast(sorted, sortedLabels, attrIdx, t, parentH, total);
    const score = criterion === 'gain_ratio' ? r.gainRatio : r.gain;
    if (score > bestScore) {
      bestScore     = score;
      bestGain      = r.gain;
      bestGainRatio = r.gainRatio;
      bestThreshold = t;
      bestGroups    = r.groups;
      bestSplitInfo = r.splitInfo;
    }
  }
  return {
    gain: bestGain, gainRatio: bestGainRatio, splitInfo: bestSplitInfo,
    threshold: bestThreshold, groups: bestGroups, parentH,
    weightedH: parentH - bestGain, candidates
  };
}

/* Evaluasi threshold menggunakan sorted array — O(n) single scan.
   Karena sorted sudah diurutkan, kita cukup cari split index. */
function _evalThresholdFast(sorted, sortedLabels, attrIdx, threshold, parentH, total) {
  // Cari index pertama di mana nilai > threshold
  let splitIdx = 0;
  while (splitIdx < sorted.length && parseFloat(sorted[splitIdx][attrIdx]) <= threshold) {
    splitIdx++;
  }
  const nL = splitIdx, nR = total - splitIdx;
  if (nL === 0 || nR === 0) return { gain: 0, gainRatio: 0, splitInfo: 0, groups: null };

  const leftLabels  = sortedLabels.slice(0, nL);
  const rightLabels = sortedLabels.slice(nL);
  const fL = nL / total, fR = nR / total;
  const weightedH = fL * entropyFromLabels(leftLabels) + fR * entropyFromLabels(rightLabels);
  const gain      = parentH - weightedH;
  let si = 0;
  if (fL > 0) si -= fL * Math.log2(fL);
  if (fR > 0) si -= fR * Math.log2(fR);
  const gainRatio = si === 0 ? 0 : gain / si;
  const thFmt = fmt(threshold);
  return {
    gain, gainRatio, splitInfo: si, weightedH,
    groups: {
      ['≤' + thFmt]: leftLabels,
      ['>' + thFmt]: rightLabels
    }
  };
}

/* Fallback (untuk mode mean) */
function _evalThreshold(rows, attrIdx, classIdx, threshold, parentH, total) {
  const left  = rows.filter(r => parseFloat(r[attrIdx]) <= threshold).map(r => r[classIdx]);
  const right = rows.filter(r => parseFloat(r[attrIdx]) >  threshold).map(r => r[classIdx]);
  const nL = left.length, nR = right.length;
  if (nL === 0 || nR === 0) return { gain: 0, gainRatio: 0, splitInfo: 0, groups: null };
  const fL = nL / total, fR = nR / total;
  const weightedH = fL * entropyFromLabels(left) + fR * entropyFromLabels(right);
  const gain      = parentH - weightedH;
  let si = 0;
  if (fL > 0) si -= fL * Math.log2(fL);
  if (fR > 0) si -= fR * Math.log2(fR);
  const gainRatio = si === 0 ? 0 : gain / si;
  const thFmt = fmt(threshold);
  return {
    gain, gainRatio, splitInfo: si, weightedH,
    groups: {
      ['≤' + thFmt]: left,
      ['>' + thFmt]: right
    }
  };
}

/* ============================================================
   BUILD TREE (sinkron — aman di Worker karena tidak blokir UI)
   Progress dikirim setiap N node via postMessage.
   ============================================================ */
const PROGRESS_EVERY = 10; // kirim PROGRESS setiap N node

function buildTree(trainRows, featCols, colTypes, headers, classCol,
                   maxDepth, minSamples, numThreshold, criterion) {
  let nodeCount = 0;
  const steps   = [];

  function _leafReason(rows, labels, availFeat, depth) {
    if (isPure(labels))          return 'murni';
    if (rows.length <= minSamples) return 'sampel ≤ ' + minSamples;
    if (availFeat.length === 0)  return 'fitur habis';
    if (depth >= maxDepth)       return 'kedalaman maks (' + maxDepth + ')';
    return 'daun';
  }

  function _buildNode(rows, availFeat, depth, nodeName) {
    nodeCount++;

    /* Kirim progress setiap PROGRESS_EVERY node */
    if (nodeCount % PROGRESS_EVERY === 0) {
      self.postMessage({
        type: 'PROGRESS',
        step: 'Tree Building',
        message: 'Node #' + nodeCount + ' | Depth ' + depth + ' | ' + rows.length + ' baris',
        pct: Math.min(5 + nodeCount * 0.4, 78)
      });
    }

    const labels = rows.map(r => r[classCol]);
    const stepId = steps.length;

    /* ---- Base cases ---- */
    if (
      rows.length <= minSamples ||
      isPure(labels)            ||
      availFeat.length === 0    ||
      depth >= maxDepth
    ) {
      const leafClass   = majorityClass(labels);
      const leafEntropy = entropyFromLabels(labels);
      const freq        = classFreq(labels);
      const node = {
        type: 'leaf', label: leafClass, freq,
        entropy: leafEntropy, n: rows.length, depth, nodeName, stepId
      };
      steps.push({
        type: 'leaf', node, rows, labels, depth, nodeName,
        reason: _leafReason(rows, labels, availFeat, depth)
      });
      return node;
    }

    /* ---- Hitung gain setiap fitur ---- */
    const gains = [];
    for (const fi of availFeat) {
      const isNum = colTypes[fi] === 'num';
      let res;
      if (isNum) {
        res = infoGainNum(rows, fi, classCol, numThreshold, criterion);
        gains.push(Object.assign({ fi, isNum: true,  colName: headers[fi] }, res));
      } else {
        res = infoGainCat(rows, fi, classCol);
        gains.push(Object.assign({ fi, isNum: false, threshold: null, colName: headers[fi] }, res));
      }
    }

    /* Gain Ratio pre-filter (Quinlan 1993) */
    const avgGain = gains.reduce(function(s, g) { return s + g.gain; }, 0) / gains.length;
    function score(g) {
      if (criterion !== 'gain_ratio') return g.gain;
      return g.gain >= avgGain ? g.gainRatio : -Infinity;
    }

    /* Tie-break alfabetis */
    const best = gains.reduce(function(a, b) {
      const sa = score(a), sb = score(b);
      if (Math.abs(sa - sb) < 1e-10) return a.colName <= b.colName ? a : b;
      return sa > sb ? a : b;
    });

    const parentH = entropyFromLabels(labels);
    const node = {
      type: 'split', attr: best.fi, attrName: headers[best.fi],
      isNum: best.isNum, threshold: best.threshold,
      gain: best.gain, gainRatio: best.gainRatio, splitInfo: best.splitInfo,
      parentEntropy: parentH, n: rows.length, depth, nodeName, stepId,
      children: {}
    };

    steps.push({
      type: 'split', node, rows, labels, depth, nodeName,
      gains, best, parentH, avgGain
    });

    /* ---- Rekursi ke anak ---- */
    const nextFeat = best.isNum
      ? availFeat
      : availFeat.filter(function(f) { return f !== best.fi; });

    if (best.isNum) {
      const lName = '≤' + fmt(best.threshold);
      const rName = '>' + fmt(best.threshold);
      const leftRows  = rows.filter(r => parseFloat(r[best.fi]) <= best.threshold);
      const rightRows = rows.filter(r => parseFloat(r[best.fi]) >  best.threshold);
      node.children[lName] = _buildNode(leftRows,  nextFeat, depth + 1, lName);
      node.children[rName] = _buildNode(rightRows, nextFeat, depth + 1, rName);
    } else {
      const vals = [...new Set(rows.map(r => r[best.fi]))].sort();
      for (const val of vals) {
        const subset = rows.filter(r => r[best.fi] === val);
        if (subset.length === 0) continue;
        node.children[val] = _buildNode(subset, nextFeat, depth + 1, val);
      }
    }

    /* Guard: tidak ada cabang valid → fallback leaf */
    if (Object.keys(node.children).length === 0) {
      const leafFallback = {
        type: 'leaf',
        label: majorityClass(labels),
        freq: classFreq(labels),
        entropy: entropyFromLabels(labels),
        n: rows.length, depth, nodeName, stepId
      };
      steps[steps.length - 1] = {
        type: 'leaf', node: leafFallback, rows, labels, depth, nodeName,
        reason: 'children kosong (fallback)'
      };
      return leafFallback;
    }

    return node;
  }

  const tree = _buildNode(trainRows, featCols, 0, 'Root');
  return { tree, steps, nodeCount };
}

/* ============================================================
   PREDICT
   ============================================================ */
function predict(node, row) {
  if (node.type === 'leaf') return node.label;
  const val = row[node.attr];
  if (node.isNum) {
    const branch = parseFloat(val) <= node.threshold
      ? '≤' + fmt(node.threshold)
      : '>' + fmt(node.threshold);
    const child = node.children[branch];
    return child ? predict(child, row) : _majoritySubtree(node);
  }
  const child = node.children[val];
  return child ? predict(child, row) : _majoritySubtree(node);
}

function _majoritySubtree(node) {
  const labels = [];
  function collect(n) {
    if (n.type === 'leaf') {
      for (let i = 0; i < n.n; i++) labels.push(n.label);
      return;
    }
    Object.values(n.children).forEach(collect);
  }
  collect(node);
  return labels.length > 0 ? majorityClass(labels) : '?';
}

/* ============================================================
   CONFUSION MATRIX & METRICS
   ============================================================ */
function confusionMatrix(yTrue, yPred, classes) {
  const n   = classes.length;
  const mat = Array.from({ length: n }, () => new Array(n).fill(0));
  const idx = {};
  classes.forEach((c, i) => { idx[c] = i; });
  for (let i = 0; i < yTrue.length; i++) {
    const r = idx[yTrue[i]], c = idx[yPred[i]];
    if (r !== undefined && c !== undefined) mat[r][c]++;
  }
  return mat;
}

function accuracy(yTrue, yPred) {
  let correct = 0;
  for (let i = 0; i < yTrue.length; i++) {
    if (yTrue[i] === yPred[i]) correct++;
  }
  return correct / yTrue.length;
}

/* ============================================================
   IMPUTASI MISSING VALUE
   ============================================================ */
function imputeMissing(rows, headers, strategy, colTypes) {
  const result  = rows.map(r => r.slice());
  const nCols   = headers.length;
  const changed = [];

  for (let ci = 0; ci < nCols; ci++) {
    const vals = rows.map(r => r[ci]).filter(v => v !== '' && v !== null && v !== undefined);
    if (vals.length === rows.length) continue;

    let fillVal;
    if (strategy === 'drop') {
      fillVal = null;
    } else if (strategy === 'mean' && colTypes[ci] === 'num') {
      const nums = vals.filter(v => !isNaN(parseFloat(v)));
      fillVal = nums.length
        ? parseFloat((nums.reduce((a, b) => a + parseFloat(b), 0) / nums.length).toFixed(4)).toString()
        : '0';
    } else {
      const freq = {};
      for (const v of vals) freq[v] = (freq[v] || 0) + 1;
      fillVal = Object.keys(freq).reduce((a, b) => freq[a] >= freq[b] ? a : b);
    }

    for (let ri = 0; ri < result.length; ri++) {
      const v = result[ri][ci];
      if (v === '' || v === null || v === undefined) {
        result[ri][ci] = fillVal;
        changed.push({ row: ri, col: headers[ci], filled: fillVal });
      }
    }
  }
  const filtered = strategy === 'drop' ? result.filter(r => r.indexOf(null) === -1) : result;
  return { rows: filtered, changed };
}

/* ============================================================
   ENTRY POINT
   ============================================================ */
self.onmessage = function(e) {
  if (e.data.type !== 'RUN') return;

  try {
    const {
      rawRows, headers, colTypes, classCol, featCols,
      maxDepth, minSamples, numThreshold, criterion,
      splitMode, testRatio, splitSeed, mvStrategy
    } = e.data.payload;

    /* ---- Step 1: Imputasi missing value ---- */
    self.postMessage({ type: 'PROGRESS', step: 'Persiapan', message: 'Menangani missing value…', pct: 2 });
    const imputed  = imputeMissing(rawRows, headers, mvStrategy || 'mode', colTypes);
    const allRows  = imputed.rows;
    const allLabels = allRows.map(r => r[classCol]);
    const allClasses = [...new Set(allLabels)].sort();

    /* ---- Step 2: Train/Test Split ---- */
    self.postMessage({ type: 'PROGRESS', step: 'Split', message: 'Stratified split data…', pct: 4 });
    let trainRows, testRows;
    if (splitMode === 'holdout') {
      const res = stratifiedSplit(allRows, classCol, testRatio || 0.2, splitSeed || 42);
      trainRows = res.trainRows;
      testRows  = res.testRows;
    } else {
      trainRows = allRows;
      testRows  = [];
    }

    self.postMessage({
      type: 'PROGRESS',
      step: 'Split',
      message: 'Train: ' + trainRows.length + ' baris | Test: ' + testRows.length + ' baris',
      pct: 5
    });

    /* ---- Step 3: Sampling (jika diminta) ---- */
    if (e.data.payload.doSample && e.data.payload.sampleSize) {
      const sz = e.data.payload.sampleSize;
      if (trainRows.length > sz) {
        self.postMessage({
          type: 'PROGRESS', step: 'Sampling',
          message: 'Mengambil sample ' + sz + ' baris dari ' + trainRows.length + '…',
          pct: 6
        });
        // Stratified sample: ambil sz baris dari trainRows
        const ratio  = 1 - (sz / trainRows.length);
        const spl    = stratifiedSplit(trainRows, classCol, ratio, splitSeed || 42);
        trainRows    = spl.trainRows.length >= sz
          ? spl.trainRows.slice(0, sz)
          : trainRows.slice(0, sz);
      }
    }

    /* ---- Step 4: Build Tree ---- */
    self.postMessage({ type: 'PROGRESS', step: 'Tree Building', message: 'Membangun pohon keputusan…', pct: 5 });
    const { tree, steps, nodeCount } = buildTree(
      trainRows, featCols, colTypes, headers, classCol,
      maxDepth, minSamples, numThreshold, criterion
    );

    /* ---- Step 5: Evaluasi Training ---- */
    self.postMessage({ type: 'PROGRESS', step: 'Evaluasi Training', message: 'Evaluasi akurasi training set…', pct: 80 });
    const yTrueTrain = trainRows.map(r => r[classCol]);
    const yPredTrain = trainRows.map(r => predict(tree, r));
    const acc  = accuracy(yTrueTrain, yPredTrain);
    const cm   = confusionMatrix(yTrueTrain, yPredTrain, allClasses);

    /* ---- Step 6: Evaluasi Test (jika ada) ---- */
    let accTest = null, cmTest = null;
    if (testRows.length > 0) {
      self.postMessage({
        type: 'PROGRESS', step: 'Evaluasi Test',
        message: 'Evaluasi test set (' + testRows.length + ' baris)…',
        pct: 90
      });
      const yTrueTest = testRows.map(r => r[classCol]);
      const yPredTest = testRows.map(r => predict(tree, r));
      accTest = accuracy(yTrueTest, yPredTest);
      cmTest  = confusionMatrix(yTrueTest, yPredTest, allClasses);
    }

    self.postMessage({ type: 'PROGRESS', step: 'Selesai', message: 'Menyiapkan tampilan…', pct: 98 });

    /* ---- DONE ---- */
    self.postMessage({
      type: 'DONE',
      result: {
        tree, steps, allClasses,
        trainRows, testRows,
        acc, cm, accTest, cmTest,
        nodeCount,
        isSampled: !!(e.data.payload.doSample && e.data.payload.sampleSize)
      }
    });

  } catch (err) {
    self.postMessage({ type: 'ERROR', message: err.message || String(err) });
  }
};