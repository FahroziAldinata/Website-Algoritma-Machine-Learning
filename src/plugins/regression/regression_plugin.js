/**
 * src/plugins/regression/regression_plugin.js
 * Linear Regression Algorithm Plugin
 * 
 * Tujuan: Mengimplementasikan analisis regresi linear sederhana & berganda.
 * Mendukung OLS, Ridge, dan Lasso (Coordinate Descent dengan standardisasi fitur),
 * pencatatan detail deviasi & residual per baris data, metrik evaluasi R², MSE, RMSE, MAE,
 * grafik scatter plot SVG dinamis, serta ekspor Excel formula/plain.
 */

class RegressionPlugin extends AlgorithmPlugin {
  constructor() {
    super();
    this.id = 'regression';
    this.name = 'Linear Regression';
    this.icon = '&#978a;';
    this.description = 'Analisis regresi linear (sederhana & berganda) menggunakan OLS, Ridge, dan Lasso (Coordinate Descent).';
    
    this.configSchema = {
      reg: {
        label: 'Regularisasi',
        type: 'select',
        options: [
          { label: 'None (Ordinary Least Squares - OLS)', value: 'none' },
          { label: 'Ridge Regularization (L2)', value: 'ridge' },
          { label: 'Lasso Regularization (L1)', value: 'lasso' }
        ],
        default: 'none'
      },
      lambda: {
        label: 'Kekuatan Regularisasi (Lambda)',
        type: 'number',
        min: 0,
        max: 1000,
        step: 0.001,
        default: 0.01
      }
    };
  }

  _matTranspose(A) {
    const r = A.length, c = A[0].length;
    const AT = Array.from({length: c}, () => new Array(r));
    for (let i = 0; i < r; i++) {
      for (let j = 0; j < c; j++) {
        AT[j][i] = A[i][j];
      }
    }
    return AT;
  }

  _matMul(A, B) {
    const rA = A.length, cA = A[0].length, cB = B[0].length;
    const C = Array.from({length: rA}, () => new Array(cB).fill(0));
    for (let i = 0; i < rA; i++) {
      for (let j = 0; j < cB; j++) {
        let sum = 0;
        for (let k = 0; k < cA; k++) {
          sum += A[i][k] * B[k][j];
        }
        C[i][j] = sum;
      }
    }
    return C;
  }

  _matVecMul(A, x) {
    const r = A.length, c = A[0].length;
    const y = new Array(r).fill(0);
    for (let i = 0; i < r; i++) {
      let sum = 0;
      for (let j = 0; j < c; j++) {
        sum += A[i][j] * x[j];
      }
      y[i] = sum;
    }
    return y;
  }

  _matInverse(A) {
    const n = A.length;
    const C = A.map(row => [...row]);
    const I = Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => i === j ? 1 : 0));

    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(C[k][i]) > Math.abs(C[maxRow][i])) {
          maxRow = k;
        }
      }

      if (maxRow !== i) {
        [C[i], C[maxRow]] = [C[maxRow], C[i]];
        [I[i], I[maxRow]] = [I[maxRow], I[i]];
      }

      const pivot = C[i][i];
      if (Math.abs(pivot) < 1e-12) {
        return null; // Singular
      }

      for (let j = 0; j < n; j++) {
        C[i][j] /= pivot;
        I[i][j] /= pivot;
      }

      for (let k = 0; k < n; k++) {
        if (k === i) continue;
        const factor = C[k][i];
        for (let j = 0; j < n; j++) {
          C[k][j] -= factor * C[i][j];
          I[k][j] -= factor * I[i][j];
        }
      }
    }
    return I;
  }

  _mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((s, x) => s + x, 0) / arr.length;
  }

  _sumSqDev(arr) {
    const mu = this._mean(arr);
    return arr.reduce((s, x) => s + (x - mu) ** 2, 0);
  }

  _sumCrossDev(xArr, yArr) {
    const muX = this._mean(xArr);
    const muY = this._mean(yArr);
    return xArr.reduce((s, x, i) => s + (x - muX) * (yArr[i] - muY), 0);
  }

  _softThreshold(z, gamma) {
    if (z > gamma)  return z - gamma;
    if (z < -gamma) return z + gamma;
    return 0;
  }

  _lassoSimple(xArr, yArr, lambda, maxIter = 1000, tol = 1e-8) {
    const n = xArr.length;
    const effectiveLambda = lambda * n;

    const xMean = this._mean(xArr);
    const yMean = this._mean(yArr);
    const xc    = xArr.map(x => x - xMean);
    const yc    = yArr.map(y => y - yMean);
    const sxx   = xc.reduce((s, x) => s + x * x, 0);
    let b = 0;
    for (let iter = 0; iter < maxIter; iter++) {
      const rho  = xc.reduce((s, x, i) => s + x * (yc[i] - b * x), 0);
      const bNew = this._softThreshold(rho / sxx, effectiveLambda / sxx);
      if (Math.abs(bNew - b) < tol) { b = bNew; break; }
      b = bNew;
    }
    return b;
  }

  _lassoMultiple(X, y, lambda, maxIter = 2000, tol = 1e-8) {
    const n = X.length;
    const p = X[0].length;

    const effectiveLambda = lambda * n;

    const xMeans = Array(p).fill(0);
    const xStds  = Array(p).fill(1);

    for (let j = 1; j < p; j++) {
      const col   = X.map(row => row[j]);
      const mu    = col.reduce((s, v) => s + v, 0) / n;
      const sigma = Math.sqrt(col.reduce((s, v) => s + (v - mu) ** 2, 0) / n);
      xMeans[j]   = mu;
      xStds[j]    = sigma > 1e-10 ? sigma : 1;
    }

    const Xs = X.map(row =>
      row.map((v, j) => j === 0 ? v : (v - xMeans[j]) / xStds[j])
    );

    const yMean = y.reduce((s, v) => s + v, 0) / n;
    const yc    = y.map(v => v - yMean);

    let beta = Array(p).fill(0);

    for (let iter = 0; iter < maxIter; iter++) {
      let maxChange = 0;

      for (let j = 0; j < p; j++) {
        const r   = yc.map((yi, i) =>
          yi - Xs[i].reduce((s, x, k) => k === j ? s : s + x * beta[k], 0)
        );
        const rho  = r.reduce((s, ri, i) => s + Xs[i][j] * ri, 0);
        const xjSq = Xs.reduce((s, row) => s + row[j] ** 2, 0);

        const betaNew = j === 0
          ? rho / xjSq
          : this._softThreshold(rho / xjSq, effectiveLambda / xjSq);

        maxChange = Math.max(maxChange, Math.abs(betaNew - beta[j]));
        beta[j]   = betaNew;
      }

      if (maxChange < tol) break;
    }

    const betaOrig = Array(p).fill(0);
    for (let j = 1; j < p; j++) {
      betaOrig[j] = beta[j] / xStds[j];
    }
    betaOrig[0] = yMean + beta[0] - betaOrig.slice(1).reduce(
      (s, b, j) => s + b * xMeans[j + 1], 0
    );

    return betaOrig;
  }

  _calcMetrics(yArr, preds, yMean) {
    const n     = yArr.length;
    const ssTot = yArr.reduce((s, y) => s + (y - yMean) ** 2, 0);
    const ssRes = yArr.reduce((s, y, i) => s + (y - preds[i]) ** 2, 0);
    const r2    = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
    const mse   = ssRes / n;
    const rmse  = Math.sqrt(mse);
    const mae   = yArr.reduce((s, y, i) => s + Math.abs(y - preds[i]), 0) / n;
    return { r2, mse, rmse, mae, ssTot, ssRes };
  }

  _equationString(model) {
    const fmt = n => parseFloat(n.toFixed(4)).toString();
    const fmt2 = v => (v >= 0 ? ' + ' : ' - ') + fmt(Math.abs(v));
    if (model.mode === 'simple') {
      return `ŷ = ${fmt(model.intercept)} ${fmt2(model.slope)} × ${model.feats[0]}`;
    }
    const terms = model.slopes.map((b, j) => `${fmt2(b)} × ${model.feats[j]}`).join('');
    return `ŷ = ${fmt(model.intercept)} ${terms}`;
  }

  /**
   * Logika utama fitting model Regresi Linear di background thread (Worker)
   */
  async process(trainRowsDummy, testRowsDummy, config, onProgress) {
    const {
      classCol,
      featureCols,
      reg = 'none',
      lambda = 0.01,
      rawRows,
      seed,
      testRatio,
      splitMethod
    } = config;

    onProgress('Split Data', 'Melakukan partisi training & testing...', 10);
    const { train: trainRowsArr, test: testRowsArr } = splitData(rawRows, classCol, testRatio, seed, splitMethod);

    const p = featureCols.length;
    const yArr = trainRowsArr.map(r => parseFloat(r[classCol]) || 0);
    const yMean = this._mean(yArr);

    let model = {};

    onProgress('Model Fitting', 'Melakukan fitting model regresi linear...', 40);
    if (p === 1) {
      // Regresi sederhana (1 fitur)
      const feat = featureCols[0];
      const xArr = trainRowsArr.map(r => parseFloat(r[feat]) || 0);
      const xMean = this._mean(xArr);
      const sxy = this._sumCrossDev(xArr, yArr);
      const sxx = this._sumSqDev(xArr);

      let slope, intercept;
      if (reg === 'ridge') {
        slope     = sxy / (sxx + lambda);
        intercept = yMean - slope * xMean;
      } else if (reg === 'lasso') {
        slope     = this._lassoSimple(xArr, yArr, lambda);
        intercept = yMean - slope * xMean;
      } else {
        slope     = sxy / sxx;
        intercept = yMean - slope * xMean;
      }

      const preds = trainRowsArr.map(r => intercept + slope * (parseFloat(r[feat]) || 0));
      const trainMetrics = this._calcMetrics(yArr, preds, yMean);

      model = {
        mode: 'simple',
        reg, lambda,
        feats: featureCols,
        target: classCol,
        intercept, slope,
        coefficients: [intercept, slope],
        xMean, yMean,
        sxy, sxx,
        preds,
        trainMetrics,
        n: trainRowsArr.length
      };
    } else {
      // Regresi berganda (>= 2 fitur)
      const X = trainRowsArr.map(r => [1, ...featureCols.map(f => parseFloat(r[f]) || 0)]);
      const y = yArr;

      let coefficients;
      if (reg === 'lasso') {
        coefficients = this._lassoMultiple(X, y, lambda);
      } else {
        // Normal Equation Ridge (lambda=0 untuk OLS)
        const Xt  = this._matTranspose(X);
        const XtX = this._matMul(Xt, X);

        if (reg === 'ridge' && lambda > 0) {
          for (let j = 1; j <= p; j++) XtX[j][j] += lambda;
        }

        const XtXinv = this._matInverse(XtX);
        if (!XtXinv) {
          throw new Error('Matriks XᵀX singular — harap coba regularisasi Ridge atau naikkan lambda.');
        }

        const Xty = this._matVecMul(Xt, y);
        coefficients = this._matVecMul(XtXinv, Xty);
      }

      const intercept = coefficients[0];
      const slopes    = coefficients.slice(1);

      const preds = trainRowsArr.map(r =>
        intercept + slopes.reduce((s, b, j) => s + b * (parseFloat(r[featureCols[j]]) || 0), 0)
      );
      const trainMetrics = this._calcMetrics(yArr, preds, yMean);

      model = {
        mode: 'multiple',
        reg, lambda,
        feats: featureCols,
        target: classCol,
        intercept, slopes,
        coefficients,
        yMean,
        preds,
        trainMetrics,
        n: trainRowsArr.length
      };
    }

    onProgress('Evaluasi', 'Mengevaluasi performa model pada data testing...', 70);
    // Evaluasi data testing (jika ada)
    let testMetrics = null;
    let testPreds = [];
    if (testRowsArr.length > 0) {
      const yTestArr = testRowsArr.map(r => parseFloat(r[classCol]) || 0);
      const yTestMean = this._mean(yTestArr);
      
      testPreds = testRowsArr.map(r => {
        if (model.mode === 'simple') {
          return model.intercept + model.slope * (parseFloat(r[featureCols[0]]) || 0);
        }
        return model.intercept + model.slopes.reduce((s, b, j) => s + b * (parseFloat(r[featureCols[j]]) || 0), 0);
      });
      testMetrics = this._calcMetrics(yTestArr, testPreds, yTestMean);
    }

    onProgress('Selesai', 'Fitting Linear Regression selesai.', 100);

    return {
      model,
      trainRows: trainRowsArr,
      testRows: testRowsArr,
      trainMetrics: model.trainMetrics,
      testMetrics,
      testPreds,
      eq: this._equationString(model),
      reg,
      lambda,
      classCol,
      featureCols
    };
  }

  /**
   * Rendering visualisasi di DOM (Main Thread)
   */
  renderHTML(r, container) {
    const fmt = (n, d = 4) => {
      if (typeof n !== 'number' || isNaN(n)) return '—';
      return parseFloat(n.toFixed(d)).toString();
    };

    const hasTest = r.testRows.length > 0 && r.testMetrics !== null;

    let html = `
      <!-- Persamaan model -->
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem;margin-bottom:1.5rem;text-align:center;">
        <div style="font-size:11px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:0.5rem">Persamaan Model Regresi Terlatih</div>
        <div class="formula" style="font-size:20px;color:#a8d8ff;padding:10px;margin:0;display:inline-block;">
          ${escapeHTML(r.eq)}
        </div>
        <div style="display:flex;justify-content:center;gap:8px;margin-top:0.75rem;flex-wrap:wrap;">
          <span class="chip chip-ok">${r.model.mode === 'simple' ? 'Simple LR' : 'Multiple LR'}</span>
          <span class="chip" style="background:var(--bg4);color:var(--text2);">Regularisasi: ${r.reg.toUpperCase()}${r.reg !== 'none' ? ` (λ=${r.lambda})` : ''}</span>
          <span class="chip" style="background:var(--bg4);color:var(--text2);">Train: n=${r.trainRows.length}</span>
          ${hasTest ? `<span class="chip" style="background:var(--bg4);color:var(--text2);">Test: n=${r.testRows.length}</span>` : ''}
        </div>
      </div>

      <!-- Train vs Test comparison cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:12px;margin-bottom:1.5rem">
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem;border-top:3px solid var(--yellow)">
          <div style="font-size:11px;font-family:var(--mono);color:var(--yellow);letter-spacing:.08em;text-transform:uppercase;margin-bottom:.5rem">Training Set Performance</div>
          <div class="metrics-grid" style="grid-template-columns:repeat(2,1fr);gap:8px">
            <div class="metric-card"><div class="metric-label">R² Score</div><div class="metric-val" style="color:var(--yellow)">${fmt(r.trainMetrics.r2)}</div></div>
            <div class="metric-card"><div class="metric-label">RMSE</div><div class="metric-val metric-blue">${fmt(r.trainMetrics.rmse)}</div></div>
            <div class="metric-card"><div class="metric-label">MAE</div><div class="metric-val metric-blue">${fmt(r.trainMetrics.mae)}</div></div>
            <div class="metric-card"><div class="metric-label">MSE</div><div class="metric-val metric-blue">${fmt(r.trainMetrics.mse)}</div></div>
          </div>
        </div>
        ${hasTest ? `
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem;border-top:3px solid var(--accent)">
          <div style="font-size:11px;font-family:var(--mono);color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:.5rem">Test Set Performance</div>
          <div class="metrics-grid" style="grid-template-columns:repeat(2,1fr);gap:8px">
            <div class="metric-card"><div class="metric-label">R² Score</div><div class="metric-val metric-green">${fmt(r.testMetrics.r2)}</div></div>
            <div class="metric-card"><div class="metric-label">RMSE</div><div class="metric-val metric-blue">${fmt(r.testMetrics.rmse)}</div></div>
            <div class="metric-card"><div class="metric-label">MAE</div><div class="metric-val metric-blue">${fmt(r.testMetrics.mae)}</div></div>
            <div class="metric-card"><div class="metric-label">MSE</div><div class="metric-val metric-blue">${fmt(r.testMetrics.mse)}</div></div>
          </div>
        </div>` : ''}
      </div>
    `;

    // Render Scatter Plot SVG
    const W = 600, H = 350, PAD = 45;
    let xVals, yVals, xLabel, yLabel;
    if (r.model.mode === 'simple') {
      xVals  = r.trainRows.map(row => parseFloat(row[r.featureCols[0]]) || 0);
      yVals  = r.trainRows.map(row => parseFloat(row[r.classCol]) || 0);
      xLabel = r.featureCols[0];
      yLabel = r.classCol;
    } else {
      // Multiple LR: Prediksi (yHat) vs Aktual (y)
      xVals  = r.model.preds;
      yVals  = r.trainRows.map(row => parseFloat(row[r.classCol]) || 0);
      xLabel = 'ŷ (Prediksi)';
      yLabel = `${r.classCol} (Aktual)`;
    }

    const xMin = Math.min(...xVals), xMax = Math.max(...xVals);
    const yMin = Math.min(...yVals), yMax = Math.max(...yVals);
    const xRange = (xMax - xMin) || 1, yRange = (yMax - yMin) || 1;

    const toSVG = (px, py) => ({
      sx: PAD + ((px - xMin) / xRange) * (W - 2 * PAD),
      sy: (H - PAD) - ((py - yMin) / yRange) * (H - 2 * PAD),
    });

    // Bulatan data points
    const dots = xVals.map((x, idx) => {
      const {sx, sy} = toSVG(x, yVals[idx]);
      return `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4" fill="var(--accent)" fill-opacity="0.8" stroke="#000" stroke-width="0.5"/>`;
    }).join('');

    // Garis regresi
    let linePath = '';
    if (r.model.mode === 'simple') {
      const ly1 = r.model.intercept + r.model.slope * xMin;
      const ly2 = r.model.intercept + r.model.slope * xMax;
      const p1 = toSVG(xMin, ly1);
      const p2 = toSVG(xMax, ly2);
      linePath = `<line x1="${p1.sx.toFixed(1)}" y1="${p1.sy.toFixed(1)}" x2="${p2.sx.toFixed(1)}" y2="${p2.sy.toFixed(1)}" stroke="var(--yellow)" stroke-width="2.5"/>`;
    } else {
      // Garis y = x ideal fit
      const lo = Math.min(xMin, yMin);
      const hi = Math.max(xMax, yMax);
      const p1 = toSVG(lo, lo);
      const p2 = toSVG(hi, hi);
      linePath = `<line x1="${p1.sx.toFixed(1)}" y1="${p1.sy.toFixed(1)}" x2="${p2.sx.toFixed(1)}" y2="${p2.sy.toFixed(1)}" stroke="var(--yellow)" stroke-width="1.5" stroke-dasharray="4,4"/>`;
    }

    html += `
      <div class="section">
        <div class="section-head"><div class="step-circle">&#9678;</div><div class="section-title">Visualisasi Model Regresi</div></div>
        <div class="section-body">
          <div style="background:#0a0d14;padding:10px;border-radius:var(--radius);border:1px solid var(--border);display:flex;justify-content:center;">
            <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto;display:block">
              <!-- Grid line / regression -->
              ${linePath}
              <!-- Data dots -->
              ${dots}
            </svg>
          </div>
          <div style="font-size:11px;color:var(--text3);text-align:center;margin-top:6px;font-family:var(--mono)">
            Sumbu X: ${escapeHTML(xLabel)} &nbsp;|&nbsp; Sumbu Y: ${escapeHTML(yLabel)}
          </div>
        </div>
      </div>
    `;

    // Coef Table (untuk berganda)
    if (r.model.mode === 'multiple') {
      html += `
        <div class="section">
          <div class="section-head"><div class="step-circle">C</div><div class="section-title">Koefisien Model (Slopes &amp; Intercept)</div></div>
          <div class="section-body">
            <div class="tbl-wrap">
              <table>
                <thead><tr><th>Parameter</th><th>Nilai Koefisien</th></tr></thead>
                <tbody>
                  <tr><td>Intercept (a / &beta;₀)</td><td class="mono"><strong>${fmt(r.model.intercept, 6)}</strong></td></tr>
                  ${r.featureCols.map((feat, idx) => `
                    <tr><td>Slope ${escapeHTML(feat)} (b${idx+1} / &beta;<sub>${idx+1}</sub>)</td><td class="mono"><strong>${fmt(r.model.slopes[idx], 6)}</strong></td></tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    // Step 2: Perhitungan manual sederhananya
    if (r.model.mode === 'simple') {
      const feat = r.featureCols[0];
      const detailRows = r.trainRows.slice(0, 30).map((row, ri) => {
        const x = parseFloat(row[feat]) || 0;
        const y = parseFloat(row[r.classCol]) || 0;
        const xDev = x - r.model.xMean;
        const yDev = y - r.model.yMean;
        const yHat = r.model.intercept + r.model.slope * x;
        const resid = y - yHat;
        return `<tr>
          <td class="mono" style="color:var(--text3)">${ri + 1}</td>
          <td class="mono">${fmt(x)}</td>
          <td class="mono">${fmt(y)}</td>
          <td class="mono">${fmt(xDev)}</td>
          <td class="mono">${fmt(yDev)}</td>
          <td class="mono">${fmt(xDev ** 2)}</td>
          <td class="mono">${fmt(xDev * yDev)}</td>
          <td class="mono">${fmt(yHat)}</td>
          <td class="mono">${fmt(resid)}</td>
          <td class="mono">${fmt(resid ** 2)}</td>
        </tr>`;
      }).join('');

      html += `
        <div class="section">
          <div class="section-head"><div class="step-circle">2</div><div class="section-title">Detail Langkah Kalkulasi Manual (Sampel 30 Baris Pertama)</div></div>
          <div class="section-body">
            <div class="tbl-wrap-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>x (${escapeHTML(feat)})</th>
                    <th>y (${escapeHTML(r.classCol)})</th>
                    <th>x − x̄</th>
                    <th>y − ȳ</th>
                    <th>(x−x̄)²</th>
                    <th>(x−x̄)(y−ȳ)</th>
                    <th>ŷ</th>
                    <th>e = y−ŷ</th>
                    <th>e²</th>
                  </tr>
                </thead>
                <tbody>
                  ${detailRows}
                </tbody>
              </table>
            </div>
            <div class="info-box" style="margin-top:0.75rem;font-size:12px;line-height:1.8;font-family:var(--mono);">
              x̄ = ${fmt(r.model.xMean)} &nbsp;|&nbsp; ȳ = ${fmt(r.model.yMean)}<br>
              Σ(x−x̄)² = ${fmt(r.model.sxx)} &nbsp;|&nbsp; Σ(x−x̄)(y−ȳ) = ${fmt(r.model.sxy)}<br>
              b = Σ(x−x̄)(y−ȳ) / Σ(x−x̄)² = ${fmt(r.model.sxy)} / ${fmt(r.model.sxx)} = <strong>${fmt(r.model.slope)}</strong><br>
              a = ȳ − b &times; x̄ = <strong>${fmt(r.model.intercept)}</strong>
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  /**
   * Ekspor model regresi ke Excel
   */
  exportExcel(r, mode) {
    const fm = (mode === 'formula');
    const nTrain = r.trainRows.length;
    const nTest = r.testRows.length;
    const p = r.featureCols.length;

    const allCols = [...r.featureCols, r.classCol];
    const WB = newWB();

    // 1. Sheet Dataset
    const s1 = [['#', 'Set', ...allCols]];
    r.trainRows.forEach((row, idx) => {
      s1.push([idx + 1, 'TRAIN', ...allCols.map(c => parseFloat(row[c]) || 0)]);
    });
    r.testRows.forEach((row, idx) => {
      s1.push([nTrain + idx + 1, 'TEST', ...allCols.map(c => parseFloat(row[c]) || 0)]);
    });
    const ws1 = aoaToWS(s1);
    addWS(WB, ws1, 'Dataset');

    // 2. Sheet Perhitungan
    const s2 = [];
    if (r.model.mode === 'simple') {
      const feat = r.featureCols[0];
      const dataR1 = 5;
      const dataRN = dataR1 + nTrain - 1;

      s2.push([`Perhitungan — Regresi Sederhana: ${feat} → ${r.classCol}`]);
      s2.push([mode === 'formula' ? '[Formula Excel]' : '[Plain Values]']);
      s2.push([]);
      s2.push(['#', 'x', 'y', 'x − x̄', 'y − ȳ', '(x−x̄)²', '(x−x̄)(y−ȳ)', 'ŷ', 'e = y−ŷ', 'e²']);

      r.trainRows.forEach((row, i) => {
        const rowNum = dataR1 + i;
        const x = parseFloat(row[feat]) || 0;
        const y = parseFloat(row[r.classCol]) || 0;

        if (fm) {
          s2.push([
            i + 1,
            x,
            y,
            fc(`B${rowNum}-AVERAGE($B$${dataR1}:$B$${dataRN})`),
            fc(`C${rowNum}-AVERAGE($C$${dataR1}:$C$${dataRN})`),
            fc(`D${rowNum}^2`),
            fc(`D${rowNum}*E${rowNum}`),
            fc(`$B$${dataRN+4}+$B$${dataRN+3}*B${rowNum}`),
            fc(`C${rowNum}-H${rowNum}`),
            fc(`I${rowNum}^2`)
          ]);
        } else {
          const xDev = x - r.model.xMean;
          const yDev = y - r.model.yMean;
          const yHat = r.model.intercept + r.model.slope * x;
          const resid = y - yHat;
          s2.push([i + 1, x, y, xDev, yDev, xDev**2, xDev*yDev, yHat, resid, resid**2]);
        }
      });

      s2.push([]);
      s2.push(['=== Ringkasan Koefisien ===']);
      if (fm) {
        s2.push(['Slope (b)', fc(`SUM(G${dataR1}:G${dataRN})/SUM(F${dataR1}:F${dataRN})`)]);
        s2.push(['Intercept (a)', fc(`AVERAGE(C${dataR1}:C${dataRN})-B${dataRN+3}*AVERAGE(B${dataR1}:B${dataRN})`)]);
      } else {
        s2.push(['Slope (b)', nc(r.model.slope)]);
        s2.push(['Intercept (a)', nc(r.model.intercept)]);
      }
    } else {
      // Berganda
      s2.push([`Perhitungan — Regresi Berganda: ${r.featureCols.join(', ')} → ${r.classCol}`]);
      s2.push([]);
      s2.push(['Parameter', 'Nilai Koefisien']);
      s2.push(['Intercept (a)', nc(r.model.intercept)]);
      r.featureCols.forEach((feat, idx) => {
        s2.push([`Slope ${feat} (b${idx+1})`, nc(r.model.slopes[idx])]);
      });
    }

    const ws2 = aoaToWS(s2);
    addWS(WB, ws2, 'Perhitungan');

    // 3. Sheet Prediksi
    const s3 = [];
    s3.push(['#', 'Set', ...r.featureCols, 'y Aktual', 'ŷ Prediksi', 'Residual', 'e²']);
    
    const coefR1 = 4;
    const nCoef = 1 + p;
    const tblHdr = coefR1 + nCoef + 1;
    const dataR1 = tblHdr + 1;

    const allRows = [...r.trainRows, ...r.testRows];
    
    allRows.forEach((row, i) => {
      const isTrain = i < nTrain;
      const y = parseFloat(row[r.classCol]) || 0;
      const yHat = isTrain ? r.model.preds[i] : r.testPreds[i - nTrain];
      const resid = y - yHat;

      s3.push([
        i + 1,
        isTrain ? 'TRAIN' : 'TEST',
        ...r.featureCols.map(f => parseFloat(row[f]) || 0),
        y,
        nc(yHat),
        nc(resid),
        nc(resid ** 2)
      ]);
    });

    const ws3 = aoaToWS(s3);
    addWS(WB, ws3, 'Prediksi');

    // 4. Sheet Evaluasi
    const s4 = [];
    s4.push(['=== EVALUASI PERFORMA MODEL ===']);
    s4.push([]);
    s4.push(['Metrik', 'Train Set', 'Test Set']);
    s4.push(['R²', nc(r.trainMetrics.r2), hasTestSafe() ? nc(r.testMetrics.r2) : '-']);
    s4.push(['MSE', nc(r.trainMetrics.mse), hasTestSafe() ? nc(r.testMetrics.mse) : '-']);
    s4.push(['RMSE', nc(r.trainMetrics.rmse), hasTestSafe() ? nc(r.testMetrics.rmse) : '-']);
    s4.push(['MAE', nc(r.trainMetrics.mae), hasTestSafe() ? nc(r.testMetrics.mae) : '-']);

    function hasTestSafe() { return nTest > 0 && r.testMetrics !== null; }

    const ws4 = aoaToWS(s4);
    addWS(WB, ws4, 'Evaluasi');

    return WB;
  }
}

// Registrasi plugin ke registry
if (typeof registry !== 'undefined') {
  registry.register(new RegressionPlugin());
}
