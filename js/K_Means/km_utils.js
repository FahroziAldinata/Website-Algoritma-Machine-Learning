/**
 * km_utils.js — Utility & helper functions for K-Means Manual Calculator
 * Includes: distance calculations, stat helpers, color palette, formatting
 */

'use strict';

/* ============================================================
   CLUSTER COLOR PALETTE
   ============================================================ */
const CLUSTER_COLORS = [
  { hex: '#4f9cf9', bg: 'rgba(79,156,249,0.15)',  border: 'rgba(79,156,249,0.4)'  }, // blue
  { hex: '#f97316', bg: 'rgba(249,115,22,0.15)',   border: 'rgba(249,115,22,0.4)'  }, // orange
  { hex: '#34d399', bg: 'rgba(52,211,153,0.15)',   border: 'rgba(52,211,153,0.4)'  }, // green
  { hex: '#f472b6', bg: 'rgba(244,114,182,0.15)',  border: 'rgba(244,114,182,0.4)' }, // pink
  { hex: '#a78bfa', bg: 'rgba(167,139,250,0.15)',  border: 'rgba(167,139,250,0.4)' }, // purple
  { hex: '#fbbf24', bg: 'rgba(251,191,36,0.15)',   border: 'rgba(251,191,36,0.4)'  }, // yellow
  { hex: '#22d3ee', bg: 'rgba(34,211,238,0.15)',   border: 'rgba(34,211,238,0.4)'  }, // cyan
  { hex: '#fb7185', bg: 'rgba(251,113,133,0.15)',  border: 'rgba(251,113,133,0.4)' }, // rose
];

function getClusterColor(idx) {
  return CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
}

/**
 * Render colored cluster badge HTML
 * @param {number} idx  0-based cluster index
 * @param {string} [label] optional label override
 */
function clusterBadgeHTML(idx, label) {
  const c = getClusterColor(idx);
  const lbl = label !== undefined ? label : `Cluster ${idx + 1}`;
  return `<span class="cluster-badge" style="background:${c.bg};border:1px solid ${c.border};color:${c.hex}">
    <span class="cluster-dot" style="background:${c.hex}"></span>${lbl}
  </span>`;
}

/* ============================================================
   DISTANCE METRICS
   ============================================================ */

/**
 * Euclidean distance between two numeric arrays
 * d = sqrt( Σ (a[i] - b[i])² )
 */
function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

/**
 * Manhattan distance between two numeric arrays
 * d = Σ |a[i] - b[i]|
 */
function manhattan(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum;
}

/**
 * Compute distance using selected metric
 * @param {number[]} a
 * @param {number[]} b
 * @param {'euclidean'|'manhattan'} metric
 */
function computeDist(a, b, metric) {
  return metric === 'manhattan' ? manhattan(a, b) : euclidean(a, b);
}

/**
 * Build the step-by-step distance formula string (for display)
 * @param {number[]} point
 * @param {number[]} centroid
 * @param {'euclidean'|'manhattan'} metric
 * @param {string[]} featureNames
 */
function distFormulaStr(point, centroid, metric, featureNames) {
  const pairs = featureNames.map((f, i) =>
    `(${fmt(point[i])} − ${fmt(centroid[i])})`
  );
  if (metric === 'euclidean') {
    const sqPairs = pairs.map((p, i) => `(${fmt(point[i])} − ${fmt(centroid[i])})²`);
    const innerStr = sqPairs.join(' + ');
    const sqVals = featureNames.map((_, i) => fmt((point[i] - centroid[i]) ** 2));
    return `√(${innerStr})\n= √(${sqVals.join(' + ')})\n= √(${fmt(sqVals.reduce((a, b) => a + parseFloat(b), 0))})\n= ${fmt(euclidean(point, centroid))}`;
  } else {
    const absPairs = featureNames.map((_, i) => `|${fmt(point[i])} − ${fmt(centroid[i])}|`);
    const absVals  = featureNames.map((_, i) => fmt(Math.abs(point[i] - centroid[i])));
    return `${absPairs.join(' + ')}\n= ${absVals.join(' + ')}\n= ${fmt(manhattan(point, centroid))}`;
  }
}

/* ============================================================
   STATISTICS HELPERS
   ============================================================ */

/** Arithmetic mean of array */
function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

/** Median of array */
function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Compute new centroid as mean of rows in cluster
 * @param {number[][]} rows  — array of feature vectors
 * @returns {number[]} centroid vector
 */
function computeCentroid(rows) {
  if (!rows.length) return [];
  const dim = rows[0].length;
  const c = new Array(dim).fill(0);
  rows.forEach(r => r.forEach((v, i) => { c[i] += v; }));
  return c.map(s => s / rows.length);
}

/**
 * Sum of Squared Errors (inertia) for a full assignment
 * @param {number[][]} data
 * @param {number[]} labels  cluster index per row
 * @param {number[][]} centroids
 * @param {'euclidean'|'manhattan'} metric
 */
function computeSSE(data, labels, centroids, metric) {
  let sse = 0;
  data.forEach((row, i) => {
    const d = computeDist(row, centroids[labels[i]], metric);
    sse += d * d;
  });
  return sse;
}

/* ============================================================
   ARRAY / OBJECT HELPERS
   ============================================================ */

/** Deep clone a 2-D numeric array */
function clone2D(arr) {
  return arr.map(r => [...r]);
}

/** Check if two centroid arrays are identical (within tolerance) */
function centroidsEqual(a, b, tol = 1e-9) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].length !== b[i].length) return false;
    for (let j = 0; j < a[i].length; j++) {
      if (Math.abs(a[i][j] - b[i][j]) > tol) return false;
    }
  }
  return true;
}

/**
 * Assign each row to nearest centroid
 * @returns {{ labels: number[], distances: number[][] }}
 *    labels[i] = cluster index for row i
 *    distances[i][k] = distance from row i to centroid k
 */
function assignClusters(data, centroids, metric) {
  const labels    = [];
  const distances = [];
  data.forEach(row => {
    const dists = centroids.map(c => computeDist(row, c, metric));
    labels.push(dists.indexOf(Math.min(...dists)));
    distances.push(dists);
  });
  return { labels, distances };
}

/* ============================================================
   NUMBER FORMATTING
   ============================================================ */

/** Format number to at most 4 decimal places, trimming trailing zeros */
function fmt(n, decimals = 4) {
  if (n === null || n === undefined || isNaN(n)) return '?';
  const rounded = parseFloat(n.toFixed(decimals));
  // Use fixed to avoid scientific notation for small numbers
  return parseFloat(rounded.toPrecision(8)).toString();
}

/** Format number for table display (2 decimals) */
function fmtShort(n) {
  if (n === null || n === undefined || isNaN(n)) return '?';
  return parseFloat(n.toFixed(2)).toString();
}

/* ============================================================
   DOM HELPERS
   ============================================================ */

function show(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = '';
}
function hide(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
function setText(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

/**
 * Toggle accordion body visibility
 * @param {HTMLElement} header  — the .iter-header element
 */
function toggleIterBlock(header) {
  header.classList.toggle('open');
  const body = header.nextElementSibling;
  if (body) body.classList.toggle('open');
}

/**
 * Toggle a collapsible section
 * @param {string} bodyId  — ID of the body element
 * @param {HTMLElement} togEl — the toggle button element
 */
function toggleSection(bodyId, togEl) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : '';
  if (togEl) togEl.classList.toggle('open', !isOpen);
}

/** Copy text to clipboard with visual feedback */
function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Disalin';
    btn.style.color = 'var(--green)';
    setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 1500);
  });
}

/* ============================================================
   MISSING VALUE DETECTION
   ============================================================ */

/**
 * Scan raw string rows for missing/non-numeric values in selected columns
 * @param {string[][]} rows     — raw CSV rows (excluding header)
 * @param {number[]} colIdxs    — column indices to check
 * @returns {{ rowIdx, colIdx, colName }[] }
 */
function detectMissingValues(rows, colIdxs, headers) {
  const missing = [];
  rows.forEach((row, ri) => {
    colIdxs.forEach(ci => {
      const val = row[ci] === undefined ? '' : String(row[ci]).trim();
      if (val === '' || val.toLowerCase() === 'null' || val.toLowerCase() === 'na' ||
          val.toLowerCase() === 'nan' || val.toLowerCase() === 'n/a' || isNaN(Number(val))) {
        missing.push({ rowIdx: ri, colIdx: ci, colName: headers[ci], rawVal: val });
      }
    });
  });
  return missing;
}

/**
 * Fill or drop missing values
 * @param {(number|null)[][]} numericMatrix  — rows x cols, null = missing
 * @param {'mean'|'median'|'drop'} strategy
 * @returns {{ cleaned: number[][], droppedCount: number, fillValues: number[], log: string[] }}
 */
function handleMissingValues(numericMatrix, strategy) {
  const nCols = numericMatrix[0].length;
  const log = [];
  let droppedCount = 0;

  if (strategy === 'drop') {
    const before = numericMatrix.length;
    const cleaned = numericMatrix.filter(row => row.every(v => v !== null));
    droppedCount = before - cleaned.length;
    log.push(`Dihapus ${droppedCount} baris yang memiliki missing value.`);
    return { cleaned, droppedCount, fillValues: [], log };
  }

  // Compute fill values per column (ignore nulls)
  const fillValues = [];
  for (let ci = 0; ci < nCols; ci++) {
    const vals = numericMatrix.map(r => r[ci]).filter(v => v !== null);
    const fv = strategy === 'median' ? median(vals) : mean(vals);
    fillValues.push(fv);
  }

  const cleaned = numericMatrix.map((row, ri) =>
    row.map((v, ci) => {
      if (v === null) {
        log.push(`Baris ${ri + 1}, kolom ${ci}: diisi dengan ${strategy} = ${fmt(fillValues[ci])}`);
        return fillValues[ci];
      }
      return v;
    })
  );

  return { cleaned, droppedCount: 0, fillValues, log };
}

/* ============================================================
   NORMALIZATION (optional, for display)
   ============================================================ */

/**
 * Min-Max normalize a column vector (for reference only, K-Means runs on raw values here)
 */
function minMaxNormalize(col) {
  const mn = Math.min(...col), mx = Math.max(...col);
  if (mx === mn) return col.map(() => 0);
  return col.map(v => (v - mn) / (mx - mn));
}

/* ============================================================
   EVALUATION METRICS
   ============================================================ */

/**
 * Silhouette Score (rata-rata seluruh data)
 * Range: -1 (buruk) sampai 1 (sempurna)
 */
function computeSilhouette(data, labels, K, metric) {
  const n = data.length;
  if (K <= 1 || n <= K) return null;

  const scores = data.map((point, i) => {
    const myCluster = labels[i];

    // a(i) = rata-rata jarak ke sesama anggota cluster
    const sameCluster = data.filter((_, j) => j !== i && labels[j] === myCluster);
    if (sameCluster.length === 0) return 0;
    const a = mean(sameCluster.map(p => computeDist(point, p, metric)));

    // b(i) = rata-rata jarak terkecil ke cluster lain
    let b = Infinity;
    for (let ki = 0; ki < K; ki++) {
      if (ki === myCluster) continue;
      const otherCluster = data.filter((_, j) => labels[j] === ki);
      if (otherCluster.length === 0) continue;
      const avgDist = mean(otherCluster.map(p => computeDist(point, p, metric)));
      if (avgDist < b) b = avgDist;
    }

    return (b - a) / Math.max(a, b);
  });

  return mean(scores);
}

/**
 * Silhouette Score per cluster
 */
function computeSilhouettePerCluster(data, labels, K, metric) {
  return Array.from({ length: K }, (_, ki) => {
    const indices = data.map((_, i) => i).filter(i => labels[i] === ki);
    if (indices.length === 0) return { cluster: ki, score: null, count: 0 };
    const clusterScores = indices.map(i => {
      const point = data[i];
      const sameCluster = data.filter((_, j) => j !== i && labels[j] === ki);
      if (sameCluster.length === 0) return 0;
      const a = mean(sameCluster.map(p => computeDist(point, p, metric)));
      let b = Infinity;
      for (let kj = 0; kj < K; kj++) {
        if (kj === ki) continue;
        const otherCluster = data.filter((_, j) => labels[j] === kj);
        if (otherCluster.length === 0) continue;
        const avgDist = mean(otherCluster.map(p => computeDist(point, p, metric)));
        if (avgDist < b) b = avgDist;
      }
      return (b - a) / Math.max(a, b);
    });
    return { cluster: ki, score: mean(clusterScores), count: indices.length };
  });
}

/**
 * Davies-Bouldin Index
 * Semakin kecil semakin baik (0 = sempurna)
 */
function computeDaviesBouldin(data, labels, centroids, K, metric) {
  if (K <= 1) return null;

  // Scatter per cluster = rata-rata jarak anggota ke centroidnya
  const scatter = Array.from({ length: K }, (_, ki) => {
    const members = data.filter((_, i) => labels[i] === ki);
    if (members.length === 0) return 0;
    return mean(members.map(p => computeDist(p, centroids[ki], metric)));
  });

  // DB = rata-rata max Rij per cluster
  let dbSum = 0;
  for (let i = 0; i < K; i++) {
    let maxR = -Infinity;
    for (let j = 0; j < K; j++) {
      if (i === j) continue;
      const separation = computeDist(centroids[i], centroids[j], metric);
      if (separation === 0) continue;
      const R = (scatter[i] + scatter[j]) / separation;
      if (R > maxR) maxR = R;
    }
    dbSum += maxR === -Infinity ? 0 : maxR;
  }

  return dbSum / K;
}