/* ============================================================
   lr_worker.js — Web Worker: semua komputasi Linear Regression
   
   Alur:
     1. Konversi float
     2. Train/Test split (LCG)
     3. Fit model (OLS / Ridge / Lasso)
     4. Prediksi train + test
     5. Hitung metrik
     6. Kirim DONE ke main thread
   ============================================================ */

// ── LCG (sama persis dengan lcg.js utama) ─────────────────────
function lcgRand(seed) {
    let s = seed >>> 0;
    return function () {
      s = Math.imul(1664525, s) + 1013904223;
      s = s >>> 0;
      return s / 4294967296;
    };
  }
  function lcgShuffle(arr, seed) {
    const a    = arr.slice();
    const rand = lcgRand(seed);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  
  // ── Train/Test Split ──────────────────────────────────────────
  function trainTestSplit(rows, testRatio, seed) {
    const n      = rows.length;
    const nTest  = Math.max(1, Math.round(n * testRatio));
    const shuffled = lcgShuffle(rows.map((_, i) => i), seed);
    const testIdx  = new Set(shuffled.slice(0, nTest));
    const train = [], test = [];
    rows.forEach((r, i) => (testIdx.has(i) ? test : train).push(r));
    return { train, test };
  }
  
  // ── Konversi float ────────────────────────────────────────────
  function toFloat(rows, cols) {
    return rows.map(r => {
      const out = Object.assign({}, r);
      cols.forEach(c => { out[c] = parseFloat(r[c]); });
      return out;
    });
  }
  
  // ── Statistik utilitas ────────────────────────────────────────
  function mean(arr) {
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }
  function sumSqDev(arr) {
    const m = mean(arr);
    return arr.reduce((s, v) => s + (v - m) ** 2, 0);
  }
  function sumCrossDev(xArr, yArr) {
    const mx = mean(xArr), my = mean(yArr);
    return xArr.reduce((s, xi, i) => s + (xi - mx) * (yArr[i] - my), 0);
  }
  
  // ── Matrix ops ────────────────────────────────────────────────
  function matTranspose(A) {
    return A[0].map((_, j) => A.map(row => row[j]));
  }
  function matMul(A, B) {
    const m = A.length, k = A[0].length, n = B[0].length;
    const C = Array.from({ length: m }, () => Array(n).fill(0));
    for (let i = 0; i < m; i++)
      for (let j = 0; j < n; j++)
        for (let l = 0; l < k; l++)
          C[i][j] += A[i][l] * B[l][j];
    return C;
  }
  function matInverse(M) {
    const n = M.length;
    const A = M.map(row => row.slice());
    const I = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
    );
    for (let col = 0; col < n; col++) {
      let pivotRow = -1, maxVal = 1e-12;
      for (let row = col; row < n; row++) {
        if (Math.abs(A[row][col]) > maxVal) { maxVal = Math.abs(A[row][col]); pivotRow = row; }
      }
      if (pivotRow === -1) return null;
      [A[col], A[pivotRow]] = [A[pivotRow], A[col]];
      [I[col], I[pivotRow]] = [I[pivotRow], I[col]];
      const pivot = A[col][col];
      for (let j = 0; j < n; j++) { A[col][j] /= pivot; I[col][j] /= pivot; }
      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const f = A[row][col];
        for (let j = 0; j < n; j++) { A[row][j] -= f * A[col][j]; I[row][j] -= f * I[col][j]; }
      }
    }
    return I;
  }
  function matVecMul(A, v) {
    return A.map(row => row.reduce((s, a, j) => s + a * v[j], 0));
  }
  
  // ── Soft Threshold (Lasso) ────────────────────────────────────
  function softThreshold(z, gamma) {
    if (z > gamma)  return z - gamma;
    if (z < -gamma) return z + gamma;
    return 0;
  }
  
  // ── Lasso Simple ──────────────────────────────────────────────
  function lassoSimple(xArr, yArr, lambda, maxIter = 1000, tol = 1e-8) {
    const n             = xArr.length;
    const effectiveLambda = lambda * n;
    const xMean = mean(xArr), yMean = mean(yArr);
    const xc  = xArr.map(x => x - xMean);
    const yc  = yArr.map(y => y - yMean);
    const sxx = xc.reduce((s, x) => s + x * x, 0);
    let b = 0;
    for (let iter = 0; iter < maxIter; iter++) {
      const rho  = xc.reduce((s, x, i) => s + x * (yc[i] - b * x), 0);
      const bNew = softThreshold(rho / sxx, effectiveLambda / sxx);
      if (Math.abs(bNew - b) < tol) { b = bNew; break; }
      b = bNew;
    }
    return b;
  }
  
  // ── Lasso Multiple (dengan standardisasi + progress) ──────────
  function lassoMultiple(X, y, lambda, maxIter = 2000, tol = 1e-8, onProgress) {
    const n = X.length;
    const p = X[0].length;
    const effectiveLambda = lambda * n;
  
    // Standardisasi fitur
    const xMeans = Array(p).fill(0);
    const xStds  = Array(p).fill(1);
    for (let j = 1; j < p; j++) {
      const col   = X.map(row => row[j]);
      const mu    = col.reduce((s, v) => s + v, 0) / n;
      const sigma = Math.sqrt(col.reduce((s, v) => s + (v - mu) ** 2, 0) / n);
      xMeans[j] = mu;
      xStds[j]  = sigma > 1e-10 ? sigma : 1;
    }
    const Xs    = X.map(row => row.map((v, j) => j === 0 ? v : (v - xMeans[j]) / xStds[j]));
    const yMean = y.reduce((s, v) => s + v, 0) / n;
    const yc    = y.map(v => v - yMean);
  
    let beta = Array(p).fill(0);
    const reportEvery = Math.max(1, Math.floor(maxIter / 20)); // progress tiap 5%
  
    for (let iter = 0; iter < maxIter; iter++) {
      let maxChange = 0;
      for (let j = 0; j < p; j++) {
        const r    = yc.map((yi, i) => yi - Xs[i].reduce((s, x, k) => k === j ? s : s + x * beta[k], 0));
        const rho  = r.reduce((s, ri, i) => s + Xs[i][j] * ri, 0);
        const xjSq = Xs.reduce((s, row) => s + row[j] ** 2, 0);
        const betaNew = j === 0
          ? rho / xjSq
          : softThreshold(rho / xjSq, effectiveLambda / xjSq);
        maxChange = Math.max(maxChange, Math.abs(betaNew - beta[j]));
        beta[j]   = betaNew;
      }
      // Kirim progress setiap beberapa iterasi
      if (onProgress && iter % reportEvery === 0) {
        const pct = Math.floor(10 + (iter / maxIter) * 35); // 10%–45%
        onProgress(pct, `Lasso iterasi ${iter + 1} / ${maxIter}`);
      }
      if (maxChange < tol) break;
    }
  
    // Unstandardisasi
    const betaOrig = Array(p).fill(0);
    for (let j = 1; j < p; j++) betaOrig[j] = beta[j] / xStds[j];
    betaOrig[0] = yMean + beta[0] - betaOrig.slice(1).reduce((s, b, j) => s + b * xMeans[j + 1], 0);
    return betaOrig;
  }
  
  // ── Fit LR ────────────────────────────────────────────────────
  function fitLR(rows, feats, target, opts, onProgress) {
    const reg    = opts.reg    || 'none';
    const lambda = opts.lambda != null ? opts.lambda : 0.01;
    const n      = rows.length;
    const p      = feats.length;
    const yArr   = rows.map(r => r[target]);
    const yMean  = mean(yArr);
  
    // ── Sederhana ──
    if (p === 1) {
      const xArr  = rows.map(r => r[feats[0]]);
      const xMean = mean(xArr);
      const sxy   = sumCrossDev(xArr, yArr);
      const sxx   = sumSqDev(xArr);
      let slope, intercept;
      if (reg === 'ridge') {
        slope     = sxy / (sxx + lambda);
        intercept = yMean - slope * xMean;
      } else if (reg === 'lasso') {
        slope     = lassoSimple(xArr, yArr, lambda);
        intercept = yMean - slope * xMean;
      } else {
        slope     = sxy / sxx;
        intercept = yMean - slope * xMean;
      }
      const preds   = rows.map(r => intercept + slope * r[feats[0]]);
      const metrics = calcMetrics(yArr, preds, yMean);
      const details = rows.map((r, i) => {
        const xDev = r[feats[0]] - xMean;
        const yDev = r[target]   - yMean;
        return { x: r[feats[0]], y: r[target], xDev, yDev, xDevSq: xDev**2, crossDev: xDev*yDev, yHat: preds[i], resid: r[target]-preds[i], residSq: (r[target]-preds[i])**2 };
      });
      return { mode:'simple', reg, lambda, feats, target, intercept, slope, coefficients:[intercept,slope], xMean, yMean, sxy, sxx, preds, details, metrics, n, yArr };
    }
  
    // ── Berganda ──
    const X = rows.map(r => [1, ...feats.map(f => r[f])]);
    const y = yArr;
    let coefficients;
  
    if (reg === 'lasso') {
      coefficients = lassoMultiple(X, y, lambda, 2000, 1e-8, onProgress);
    } else {
      onProgress && onProgress(20, 'Menghitung Normal Equation...');
      const Xt  = matTranspose(X);
      const XtX = matMul(Xt, X);
      if (reg === 'ridge' && lambda > 0) {
        for (let j = 1; j <= p; j++) XtX[j][j] += lambda;
      }
      const XtXinv = matInverse(XtX);
      if (!XtXinv) throw new Error('Matriks XᵀX singular — coba Ridge regularization');
      const Xty = matVecMul(Xt, y);
      coefficients = matVecMul(XtXinv, Xty);
      onProgress && onProgress(45, 'Normal Equation selesai');
    }
  
    const intercept = coefficients[0];
    const slopes    = coefficients.slice(1);
    const preds     = rows.map(r => intercept + slopes.reduce((s, b, j) => s + b * r[feats[j]], 0));
    const metrics   = calcMetrics(yArr, preds, yMean);
    const details   = rows.map((r, i) => ({
      xs: feats.map(f => r[f]), y: r[target], yHat: preds[i],
      resid: r[target]-preds[i], residSq: (r[target]-preds[i])**2
    }));
    return { mode:'multiple', reg, lambda, feats, target, intercept, slopes, coefficients, yMean, preds, details, metrics, n, yArr, X };
  }
  
  // ── Metrics ───────────────────────────────────────────────────
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
  
  // ── Predict satu baris ────────────────────────────────────────
  function predictLR(model, inputObj) {
    if (model.mode === 'simple') return model.intercept + model.slope * inputObj[model.feats[0]];
    return model.intercept + model.slopes.reduce((s, b, j) => s + b * inputObj[model.feats[j]], 0);
  }
  
  // ── equationString ────────────────────────────────────────────
  function fmt(v, maxDec = 6) {
    if (!isFinite(v)) return String(v);
    return parseFloat(v.toFixed(maxDec)).toString();
  }
  function equationString(model) {
    const fmt2 = v => (v >= 0 ? '+' : '') + fmt(v, 4);
    if (model.mode === 'simple') return `ŷ = ${fmt(model.intercept,4)} ${fmt2(model.slope)} × ${model.feats[0]}`;
    const terms = model.slopes.map((b, j) => `${fmt2(b)} × ${model.feats[j]}`).join(' ');
    return `ŷ = ${fmt(model.intercept,4)} ${terms}`;
  }
  
  // ── ENTRY POINT ───────────────────────────────────────────────
  self.onmessage = function (e) {
    if (e.data.type !== 'RUN') return;
  
    const progress = (pct, message) => {
      self.postMessage({ type: 'PROGRESS', pct, message });
    };
  
    try {
      const { rawRows, numericCols, featureCols, targetCol, testRatio, seed, reg, lambda } = e.data.payload;
  
      // Step 1 — Konversi float
      progress(2, 'Konversi data ke numerik...');
      const numRows = toFloat(rawRows, numericCols);
  
      // Step 2 — Split
      progress(6, 'Train/test split (LCG)...');
      const { train, test } = trainTestSplit(numRows, testRatio, seed);
  
      // Step 3 — Fit model
      progress(10, `Fitting model (${reg.toUpperCase()})...`);
      const model = fitLR(train, featureCols, targetCol, { reg, lambda }, progress);
  
      // Step 4 — Prediksi test
      progress(50, `Memprediksi test set (${test.length} baris)...`);
      const testPreds = test.map(r => predictLR(model, r));
  
      // Step 5 — Prediksi train (untuk tabel kalkulasi)
      progress(70, `Memprediksi train set (${train.length} baris)...`);
      const trainPreds = train.map(r => predictLR(model, r));
  
      // Step 6 — Metrik test
      progress(88, 'Menghitung metrik evaluasi...');
      const testMetrics = calcMetrics(
        test.map(r => r[targetCol]),
        testPreds,
        model.yMean
      );
  
      progress(96, 'Menyiapkan tampilan...');
  
      self.postMessage({
        type: 'DONE',
        result: {
          model,
          trainRows:   train,
          testRows:    test,
          testMetrics,
          equation:    equationString(model),
          totalRows:   rawRows.length,
          seed,
        }
      });
  
    } catch (err) {
      self.postMessage({ type: 'ERROR', message: err.message || String(err) });
    }
  };