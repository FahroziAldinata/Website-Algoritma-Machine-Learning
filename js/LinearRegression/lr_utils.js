// ============================================================
//  js/LinearRegression/lr_utils.js
//  Utilitas statistik: mean, variance, covariance, matrix ops
// ============================================================

/** Hitung rata-rata array */
function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** Hitung variance populasi Σ(x - x̄)² / n */
function variance(arr) {
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

/** Hitung covariance Σ((x - x̄)(y - ȳ)) / n */
function covariance(xArr, yArr) {
  const mx = mean(xArr), my = mean(yArr);
  return xArr.reduce((s, xi, i) => s + (xi - mx) * (yArr[i] - my), 0) / xArr.length;
}

/** Hitung Σ(x_i - x̄)² */
function sumSqDev(arr) {
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0);
}

/** Hitung Σ((x_i - x̄)(y_i - ȳ)) */
function sumCrossDev(xArr, yArr) {
  const mx = mean(xArr), my = mean(yArr);
  return xArr.reduce((s, xi, i) => s + (xi - mx) * (yArr[i] - my), 0);
}

// ---- Matrix Operations (untuk regresi berganda) ----

/** Transpose matriks */
function matTranspose(A) {
  return A[0].map((_, j) => A.map(row => row[j]));
}

/** Perkalian dua matriks A (m×k) × B (k×n) */
function matMul(A, B) {
  const m = A.length, k = A[0].length, n = B[0].length;
  const C = Array.from({ length: m }, () => Array(n).fill(0));
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      for (let l = 0; l < k; l++)
        C[i][j] += A[i][l] * B[l][j];
  return C;
}

/**
 * Invers matriks n×n menggunakan Gauss-Jordan
 * @param {number[][]} M
 * @returns {number[][]|null} null jika singular
 */
function matInverse(M) {
  const n = M.length;
  const A = M.map(row => row.slice());
  const I = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

  for (let col = 0; col < n; col++) {
    // Cari pivot
    let pivotRow = -1;
    let maxVal = 1e-12;
    for (let row = col; row < n; row++) {
      if (Math.abs(A[row][col]) > maxVal) {
        maxVal = Math.abs(A[row][col]);
        pivotRow = row;
      }
    }
    if (pivotRow === -1) return null; // singular

    [A[col], A[pivotRow]] = [A[pivotRow], A[col]];
    [I[col], I[pivotRow]] = [I[pivotRow], I[col]];

    const pivot = A[col][col];
    for (let j = 0; j < n; j++) {
      A[col][j] /= pivot;
      I[col][j] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = A[row][col];
      for (let j = 0; j < n; j++) {
        A[row][j] -= f * A[col][j];
        I[row][j] -= f * I[col][j];
      }
    }
  }
  return I;
}

/** Perkalian matriks × vektor */
function matVecMul(A, v) {
  return A.map(row => row.reduce((s, a, j) => s + a * v[j], 0));
}

/**
 * Format angka: tampilkan hingga maxDec desimal, hilangkan trailing zero
 * @param {number} v
 * @param {number} maxDec
 */
function fmt(v, maxDec = 6) {
  if (!isFinite(v)) return String(v);
  return parseFloat(v.toFixed(maxDec)).toString();
}
