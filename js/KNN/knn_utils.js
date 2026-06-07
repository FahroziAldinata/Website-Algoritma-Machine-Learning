/* ============================================================
   knn_utils.js — Jarak, Normalisasi, Voting
   ============================================================ */



// ---- Stratified split ----
// n_test = max(1, round(n_class * test_ratio))
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

// ---- Distance metrics ----
// Hanya bekerja pada fitur numerik; fitur kategoris dilewati
function euclidean(a, b, cols) {
  let sum = 0;
  for (const c of cols) {
    const diff = a[c] - b[c];
    sum += diff * diff;
  }
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

// ---- Min-Max normalisasi ----
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

function applyNorm(rows, numericCols, normType, stats) {
  return rows.map(r => {
    const nr = { ...r };
    for (const c of numericCols) {
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

// ---- Voting (uniform & distance-weighted) ----
// tie-break: alphabetical (kelas lebih kecil alfabet menang)
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
  for (const cls of Object.keys(tally).sort()) { // sort = alphabetical tie-break
    if (tally[cls] > bestScore) { bestScore = tally[cls]; best = cls; }
  }
  return { predicted: best, tally };
}

// ---- Deteksi kolom numerik vs kategoris ----
function detectNumeric(rows, cols) {
  return cols.filter(c =>
    rows.every(r => r[c] === '' || r[c] == null || !isNaN(parseFloat(r[c])))
  );
}
function detectCategorical(rows, cols) {
  return cols.filter(c =>
    rows.some(r => r[c] !== '' && r[c] != null && isNaN(parseFloat(r[c])))
  );
}
