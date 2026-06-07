/**
 * km_core.js — K-Means Clustering Algorithm
 *
 * Executes K-Means and records every intermediate step for manual review:
 *   - Centroid initialization detail
 *   - Per-iteration: distance matrix, cluster assignments, centroid update
 *   - Convergence check
 *   - Final SSE / inertia
 *
 * Entry point: processKMeans()
 * Result stored in window.KM_RESULT
 */

'use strict';

/* ============================================================
   MAIN ENTRY POINT
   ============================================================ */
function processKMeans() {
  readConfig();
  if (!validateConfig()) return;

  const { cleanMatrix, featureNames, selectedK: K,
          initMethod, distMetric, maxIter } = KM_STATE;

  const n = cleanMatrix.length;
  // SESUDAH
  const nCols = cleanMatrix[0].length;
  const normalizedCols = Array.from({ length: nCols }, (_, ci) =>
    minMaxNormalize(cleanMatrix.map(row => row[ci]))
  );
  const data = cleanMatrix.map((_, ri) =>
    normalizedCols.map(col => col[ri])
  );

  /* -------- 1. INITIALIZE CENTROIDS -------- */
  const initResult = initCentroids(data, K, initMethod);
  if (!initResult) return;
  const { centroids: initCentroids_, initLog, initIndices } = initResult;

  /* -------- 2. ITERATE -------- */
  let centroids = clone2D(initCentroids_);
  const iterations = [];
  let converged = false;
  let finalLabels = [];

  for (let iter = 0; iter < maxIter; iter++) {
    /* 2a. Assign step */
    const { labels, distances } = assignClusters(data, centroids, distMetric);

    /* 2b. Recompute centroids */
    const newCentroids = recomputeCentroids(data, labels, K, featureNames);

    /* 2c. Check convergence */
    converged = centroidsEqual(centroids, newCentroids);

    /* 2d. Log this iteration */
    iterations.push({
      iter: iter + 1,
      centroidsOld: clone2D(centroids),
      centroidsNew: clone2D(newCentroids),
      labels: [...labels],
      distances: distances.map(d => [...d]),
      converged,
    });

    centroids  = clone2D(newCentroids);
    finalLabels = labels;

    if (converged) break;
  }

  /* -------- 3. FINAL SSE -------- */
  const sse = computeSSE(data, finalLabels, centroids, distMetric);

  /* -------- 4. BUILD RESULT -------- */
  const clusterSummary = buildClusterSummary(data, finalLabels, centroids, K, featureNames);

  window.KM_RESULT = {
    data,
    rawRows:      KM_STATE.rawRows,
    rawHeaders:   KM_STATE.rawHeaders,
    selectedCols: KM_STATE.selectedCols,
    featureNames,
    K,
    distMetric,
    initMethod,
    initLog,
    initIndices,
    initCentroids: initCentroids_,
    iterations,
    finalCentroids: centroids,
    finalLabels,
    sse,
    clusterSummary,
    converged,
    totalIter: iterations.length,
    mvStrategy:    KM_STATE.mvStrategy,
    mvMissing:     KM_STATE.mvMissing,
  };

  renderResult(window.KM_RESULT);
}

/* ============================================================
   CENTROID INITIALIZATION
   ============================================================ */

/**
 * @returns {{ centroids: number[][], initLog: string[], initIndices: number[] }}
 */
function initCentroids(data, K, method) {
  const n = data.length;
  let indices = [];
  const log   = [];

  if (method === 'first') {
    indices = Array.from({ length: K }, (_, i) => i);
    log.push(`Metode: K Data Pertama`);
    log.push(`Indeks baris terpilih: [${indices.join(', ')}]`);
    indices.forEach((idx, ki) => {
      log.push(`Centroid C${ki + 1} ← Baris ${idx}: [${data[idx].map(fmt).join(', ')}]`);
    });

  } else if (method === 'random') {
    // Fisher-Yates shuffle, take first K
    const pool = Array.from({ length: n }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    indices = pool.slice(0, K).sort((a, b) => a - b);
    log.push(`Metode: Random`);
    log.push(`Indeks baris terpilih (acak): [${indices.join(', ')}]`);
    indices.forEach((idx, ki) => {
      log.push(`Centroid C${ki + 1} ← Baris ${idx}: [${data[idx].map(fmt).join(', ')}]`);
    });

  } else if (method === 'manual') {
    indices = KM_STATE._manualIndices;
    log.push(`Metode: Manual`);
    log.push(`Indeks baris ditentukan pengguna: [${indices.join(', ')}]`);
    indices.forEach((idx, ki) => {
      log.push(`Centroid C${ki + 1} ← Baris ${idx}: [${data[idx].map(fmt).join(', ')}]`);
    });
  }

  const centroids = indices.map(i => [...data[i]]);
  return { centroids, initLog: log, initIndices: indices };
}

/* ============================================================
   RECOMPUTE CENTROIDS
   ============================================================ */

/**
 * Compute new centroid for each cluster as mean of assigned points
 * If a cluster is empty, keep old centroid (reinit not needed for manual calc)
 */
function recomputeCentroids(data, labels, K, featureNames) {
  const groups = Array.from({ length: K }, () => []);
  data.forEach((row, i) => groups[labels[i]].push(row));

  return groups.map((rows, ki) => {
    if (rows.length === 0) {
      // Empty cluster: keep a distinct random point as fallback
      console.warn(`Cluster ${ki + 1} kosong — menggunakan centroid lama`);
      return new Array(featureNames.length).fill(0);
    }
    return computeCentroid(rows);
  });
}

/* ============================================================
   CLUSTER SUMMARY
   ============================================================ */

/**
 * Build summary statistics for each cluster
 */
function buildClusterSummary(data, labels, centroids, K, featureNames) {
  return Array.from({ length: K }, (_, ki) => {
    const members = data.map((row, i) => ({ row, idx: i })).filter(x => labels[x.idx] === ki);
    const rows = members.map(x => x.row);

    // Per-feature stats
    const stats = featureNames.map((f, fi) => {
      const vals = rows.map(r => r[fi]);
      return {
        feature: f,
        mean:    mean(vals),
        min:     Math.min(...vals),
        max:     Math.max(...vals),
        count:   vals.length,
      };
    });

    // Intra-cluster SSE
    const sse = rows.reduce((s, r) => s + computeDist(r, centroids[ki], 'euclidean') ** 2, 0);

    return {
      clusterIdx: ki,
      memberIndices: members.map(x => x.idx),
      count: members.length,
      centroid: centroids[ki],
      stats,
      sse,
    };
  });
}

/* ============================================================
   DISTANCE FORMULA DETAIL  (per row, per iteration)
   Per each data point, show full distance calc to each centroid
   ============================================================ */

/**
 * Build detailed distance breakdown for one data point to one centroid
 * @param {number[]} point
 * @param {number[]} centroid
 * @param {'euclidean'|'manhattan'} metric
 * @param {string[]} featureNames
 * @returns {object} with formula string, intermediate values, result
 */
function buildDistDetail(point, centroid, metric, featureNames) {
  const diffs = featureNames.map((_, i) => point[i] - centroid[i]);

  if (metric === 'euclidean') {
    const squares = diffs.map(d => d * d);
    const sumSq   = squares.reduce((s, x) => s + x, 0);
    const result  = Math.sqrt(sumSq);
    return {
      metric,
      steps: featureNames.map((f, i) => ({
        feature: f,
        pointVal: point[i],
        centVal:  centroid[i],
        diff:     diffs[i],
        squared:  squares[i],
      })),
      sumSq,
      result,
      formula: `√(${squares.map(s => fmt(s)).join(' + ')}) = √${fmt(sumSq)} = ${fmt(result)}`,
    };
  } else {
    const absVals = diffs.map(Math.abs);
    const result  = absVals.reduce((s, x) => s + x, 0);
    return {
      metric,
      steps: featureNames.map((f, i) => ({
        feature:  f,
        pointVal: point[i],
        centVal:  centroid[i],
        diff:     diffs[i],
        absVal:   absVals[i],
      })),
      result,
      formula: `${absVals.map(v => fmt(v)).join(' + ')} = ${fmt(result)}`,
    };
  }
}

/* Export for render */
window._buildDistDetail = buildDistDetail;
