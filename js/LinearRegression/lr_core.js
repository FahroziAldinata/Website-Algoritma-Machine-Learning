// ============================================================
//  js/LinearRegression/lr_core.js
//  Fit regresi linear (sederhana & berganda), prediksi, metrik
// ============================================================

/**
 * Fit Linear Regression
 *
 * Mode Sederhana (1 fitur):
 *   b = Σ((x_i - x̄)(y_i - ȳ)) / Σ(x_i - x̄)²
 *   a = ȳ - b * x̄
 *
 * Mode Berganda (≥2 fitur) — Normal Equation:
 *   β = (XᵀX + λI)⁻¹ Xᵀy   (λ=0 untuk OLS, λ>0 untuk Ridge)
 *   Kolom pertama X adalah 1 (intercept)
 *
 * Lasso: diselesaikan dengan coordinate descent (iteratif)
 *        Fitur di-standardisasi sebelum fitting, koefisien
 *        di-unstandardisasi kembali ke skala asli setelah selesai.
 *        Penalti efektif = lambda × n  (setara dengan sklearn alpha × n_samples)
 *        sehingga input lambda=0.01 menghasilkan koefisien yang sama
 *        dengan sklearn Lasso(alpha=0.01).
 *
 * @param {object[]} rows   - array baris bertipe float
 * @param {string[]} feats  - nama kolom fitur
 * @param {string}   target - nama kolom target
 * @param {object}   opts   - { reg: 'none'|'ridge'|'lasso', lambda: number }
 * @returns {object} model
 */
function fitLR(rows, feats, target, opts = {}) {
  const reg    = opts.reg    || 'none';
  const lambda = opts.lambda != null ? opts.lambda : 0.01;
  const n      = rows.length;
  const p      = feats.length;

  const yArr  = rows.map(r => r[target]);
  const yMean = mean(yArr);

  // ── Regresi Sederhana ──────────────────────────────────────
  if (p === 1) {
    const xArr  = rows.map(r => r[feats[0]]);
    const xMean = mean(xArr);   // FIX: simpan sekali, pakai ulang

    const sxy = sumCrossDev(xArr, yArr);
    const sxx = sumSqDev(xArr);

    let slope, intercept;

    if (reg === 'ridge') {
      // Ridge sederhana: b = Σ(x_i-x̄)(y_i-ȳ) / (Σ(x_i-x̄)² + λ)
      slope     = sxy / (sxx + lambda);
      intercept = yMean - slope * xMean;
    } else if (reg === 'lasso') {
      // Lasso 1 fitur: coordinate descent (data di-center di dalam lassoSimple)
      slope     = lassoSimple(xArr, yArr, lambda);
      intercept = yMean - slope * xMean;   // FIX: pakai xMean, bukan mean(xArr) ulang
    } else {
      // OLS
      slope     = sxy / sxx;
      intercept = yMean - slope * xMean;
    }

    const preds = rows.map(r => intercept + slope * r[feats[0]]);
    const metrics = calcMetrics(yArr, preds, yMean);

    // Detail kalkulasi per baris (untuk tampilan manual)
    // FIX: gunakan xMean yang sudah dihitung, bukan memanggil mean(xArr) tiap iterasi
    const details = rows.map((r, i) => {
      const xDev = r[feats[0]] - xMean;
      const yDev = r[target]   - yMean;
      return {
        x:        r[feats[0]],
        y:        r[target],
        xDev,
        yDev,
        xDevSq:   xDev ** 2,
        crossDev: xDev * yDev,
        yHat:     preds[i],
        resid:    r[target] - preds[i],
        residSq:  (r[target] - preds[i]) ** 2,
      };
    });

    return {
      mode: 'simple',
      reg, lambda,
      feats, target,
      intercept, slope,
      coefficients: [intercept, slope], // [a, b1]
      xMean, yMean,                     // FIX: xMean sudah tersimpan, tidak perlu mean(xArr) lagi
      sxy, sxx,
      preds, details, metrics, n,
      yArr,
    };
  }

  // ── Regresi Berganda ───────────────────────────────────────
  // Bangun matriks X (n × p+1), kolom pertama = 1
  const X = rows.map(r => [1, ...feats.map(f => r[f])]);
  const y = yArr;

  let coefficients;

  if (reg === 'lasso') {
    // FIX: Lasso dengan standardisasi fitur agar penalti λ adil antar fitur
    coefficients = lassoMultiple(X, y, lambda);
  } else {
    // Normal equation dengan Ridge (lambda=0 untuk OLS)
    const Xt  = matTranspose(X);
    const XtX = matMul(Xt, X);

    // Tambah regularisasi Ridge ke diagonal (kecuali intercept di index 0)
    if (reg === 'ridge' && lambda > 0) {
      for (let j = 1; j <= p; j++) XtX[j][j] += lambda;
    }

    const XtXinv = matInverse(XtX);
    if (!XtXinv) throw new Error('Matriks XᵀX singular — coba Ridge regularization');

    const Xty = matVecMul(Xt, y);
    coefficients = matVecMul(XtXinv, Xty);
  }

  const intercept = coefficients[0];
  const slopes    = coefficients.slice(1);

  const preds = rows.map(r =>
    intercept + slopes.reduce((s, b, j) => s + b * r[feats[j]], 0)
  );
  const metrics = calcMetrics(yArr, preds, yMean);

  // Detail per baris
  const details = rows.map((r, i) => ({
    xs:      feats.map(f => r[f]),
    y:       r[target],
    yHat:    preds[i],
    resid:   r[target] - preds[i],
    residSq: (r[target] - preds[i]) ** 2,
  }));

  return {
    mode: 'multiple',
    reg, lambda,
    feats, target,
    intercept, slopes,
    coefficients,
    yMean,
    preds, details, metrics, n,
    yArr,
    X,
  };
}

/** Prediksi satu baris baru */
function predictLR(model, inputObj) {
  if (model.mode === 'simple') {
    return model.intercept + model.slope * inputObj[model.feats[0]];
  }
  return model.intercept + model.slopes.reduce(
    (s, b, j) => s + b * inputObj[model.feats[j]], 0
  );
}

// ---- Metrics ----
function calcMetrics(yArr, preds, yMean) {
  const n     = yArr.length;
  const ssTot = yArr.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const ssRes = yArr.reduce((s, y, i) => s + (y - preds[i]) ** 2, 0);
  const r2    = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  const mse   = ssRes / n;
  const rmse  = Math.sqrt(mse);
  const mae   = yArr.reduce((s, y, i) => s + Math.abs(y - preds[i]), 0) / n;
  return { r2, mse, rmse, mae, ssTot, ssRes };
}

// ---- Lasso (Coordinate Descent) ----

/**
 * Lasso 1 fitur — bekerja pada data yang di-center.
 * Tidak memerlukan standardisasi karena hanya 1 fitur,
 * skala relatif antara fitur tidak menjadi masalah.
 *
 * OPSI A: penalti efektif = lambda × n  agar setara dengan
 * sklearn Lasso(alpha=lambda). sklearn menerapkan:
 *   loss = (1/2n)Σ(y−ŷ)² + alpha × Σ|β|
 * sedangkan coordinate descent standar menerapkan:
 *   loss = Σ(y−ŷ)² + lambda × Σ|β|
 * Untuk menyamakan: lambda_eff = alpha × n
 */
function lassoSimple(xArr, yArr, lambda, maxIter = 1000, tol = 1e-8) {
  const n             = xArr.length;
  const effectiveLambda = lambda * n;   // OPSI A: samakan dengan sklearn

  const xMean = mean(xArr);
  const yMean = mean(yArr);
  const xc    = xArr.map(x => x - xMean);
  const yc    = yArr.map(y => y - yMean);
  const sxx   = xc.reduce((s, x) => s + x * x, 0);
  let b = 0;
  for (let iter = 0; iter < maxIter; iter++) {
    const rho  = xc.reduce((s, x, i) => s + x * (yc[i] - b * x), 0);
    const bNew = softThreshold(rho / sxx, effectiveLambda / sxx);
    if (Math.abs(bNew - b) < tol) { b = bNew; break; }
    b = bNew;
  }
  return b;
}

/**
 * Lasso berganda — coordinate descent dengan standardisasi fitur.
 *
 * Fitur (kolom 1..p) di-standardisasi menjadi mean=0, std=1
 * sebelum fitting. Ini memastikan penalti λ setara untuk semua fitur
 * terlepas dari skala aslinya (misal ribuan vs puluhan).
 * Koefisien kemudian di-unstandardisasi kembali ke skala asli.
 *
 * OPSI A — Samakan penalti efektif dengan sklearn:
 *   sklearn loss = (1/2n)Σ(y−ŷ)² + alpha × Σ|β|
 *   JS loss      = Σ(y−ŷ)²        + lambda × Σ|β|
 *   → effectiveLambda = lambda × n  agar alpha=0.01 di JS
 *     menghasilkan koefisien yang sama dengan sklearn Lasso(alpha=0.01)
 *
 * Intercept (kolom 0) tidak diregularisasi dan tidak di-standardisasi.
 *
 * @param {number[][]} X      - matriks desain [1, x1, x2, ...] (n × p+1)
 * @param {number[]}   y      - vektor target (n)
 * @param {number}     lambda - kekuatan regularisasi L1 (setara sklearn alpha)
 */
function lassoMultiple(X, y, lambda, maxIter = 2000, tol = 1e-8) {
  const n = X.length;
  const p = X[0].length; // termasuk kolom intercept (index 0)

  // OPSI A: skala lambda × n agar setara dengan sklearn
  const effectiveLambda = lambda * n;

  // ── Hitung mean & std tiap kolom fitur (index 1..p-1) ──────
  const xMeans = Array(p).fill(0);
  const xStds  = Array(p).fill(1);

  for (let j = 1; j < p; j++) {
    const col   = X.map(row => row[j]);
    const mu    = col.reduce((s, v) => s + v, 0) / n;
    const sigma = Math.sqrt(col.reduce((s, v) => s + (v - mu) ** 2, 0) / n);
    xMeans[j]   = mu;
    xStds[j]    = sigma > 1e-10 ? sigma : 1; // hindari bagi nol jika fitur konstan
  }

  // ── Bangun matriks X yang sudah di-standardisasi ────────────
  const Xs = X.map(row =>
    row.map((v, j) => j === 0 ? v : (v - xMeans[j]) / xStds[j])
  );

  // ── Standardisasi y (center saja, tidak scale) ──────────────
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  const yc    = y.map(v => v - yMean);

  // ── Coordinate descent pada skala standar ───────────────────
  let beta = Array(p).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let maxChange = 0;

    for (let j = 0; j < p; j++) {
      // Residual parsial: y tanpa kontribusi kolom j
      const r   = yc.map((yi, i) =>
        yi - Xs[i].reduce((s, x, k) => k === j ? s : s + x * beta[k], 0)
      );
      const rho  = r.reduce((s, ri, i) => s + Xs[i][j] * ri, 0);
      const xjSq = Xs.reduce((s, row) => s + row[j] ** 2, 0);

      // Intercept (j=0) tidak diregularisasi
      // Fitur (j≥1): gunakan effectiveLambda agar setara sklearn
      const betaNew = j === 0
        ? rho / xjSq
        : softThreshold(rho / xjSq, effectiveLambda / xjSq);

      maxChange = Math.max(maxChange, Math.abs(betaNew - beta[j]));
      beta[j]   = betaNew;
    }

    if (maxChange < tol) break;
  }

  // ── Unstandardisasi: kembalikan ke skala fitur asli ─────────
  // slope asli: b_j_orig = b_j_std / std_j
  // intercept asli: a = yMean + beta[0] - Σ(b_j_orig × mean_j)
  const betaOrig = Array(p).fill(0);
  for (let j = 1; j < p; j++) {
    betaOrig[j] = beta[j] / xStds[j];
  }
  betaOrig[0] = yMean + beta[0] - betaOrig.slice(1).reduce(
    (s, b, j) => s + b * xMeans[j + 1], 0
  );

  return betaOrig;
}

function softThreshold(z, gamma) {
  if (z > gamma)  return z - gamma;
  if (z < -gamma) return z + gamma;
  return 0;
}

/** Buat persamaan regresi sebagai string */
function equationString(model) {
  const fmt2 = v => (v >= 0 ? '+' : '') + fmt(v, 4);
  if (model.mode === 'simple') {
    return `ŷ = ${fmt(model.intercept, 4)} ${fmt2(model.slope)} × ${model.feats[0]}`;
  }
  const terms = model.slopes.map((b, j) => `${fmt2(b)} × ${model.feats[j]}`).join(' ');
  return `ŷ = ${fmt(model.intercept, 4)} ${terms}`;
}