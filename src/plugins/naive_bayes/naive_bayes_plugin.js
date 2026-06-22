/**
 * src/plugins/naive_bayes/naive_bayes_plugin.js
 * Naive Bayes Algorithm Plugin
 * 
 * Tujuan: Mengimplementasikan algoritma Naive Bayes Classifier.
 * Mendukung diskritisasi kolom kontinu berbasis binning frekuensi merata,
 * Laplace smoothing untuk penanganan zero probability, visualisasi metrik evaluasi
 * (Confusion Matrix, Precision, Recall, F1), kalkulasi step-by-step prior dan likelihood,
 * serta ekspor Excel berantai formula.
 */

class NaiveBayesPlugin extends AlgorithmPlugin {
  constructor() {
    super();
    this.id = 'naive_bayes';
    this.name = 'Naive Bayes';
    this.icon = '&#9856;';
    this.description = 'Klasifikasi berbasis probabilitas menggunakan Teorema Bayes dengan Laplace smoothing dan diskritisasi numerik.';
    
    this.configSchema = {
      nBins: {
        label: 'Jumlah Bin Numerik',
        type: 'number',
        min: 2,
        max: 20,
        step: 1,
        default: 5
      }
    };
  }

  _isContinuousCol(rows, colName) {
    const vals = rows.map(r => r[colName]).filter(v => v !== undefined && v !== '' && !isNaN(parseFloat(v)));
    if (!vals.length) return false;

    // Pastikan semua nilai numerik
    const nums    = vals.map(v => parseFloat(v));
    const allInts = nums.every(n => Number.isInteger(n));
    const unique  = new Set(nums);

    // Integer dengan <= 20 nilai unik -> sudah diskrit, tidak perlu dibin
    if (allInts && unique.size <= 20) return false;

    // Sisanya (float, atau integer range besar) -> kontinu
    return true;
  }

  _calcBinEdges(rows, colName, nBins) {
    const nums = rows
      .map(r => parseFloat(r[colName]))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);

    if (!nums.length) return null;

    const min = nums[0];
    const max = nums[nums.length - 1];
    if (min === max) return null; // semua nilai sama -> tidak bisa dibin

    const step  = (max - min) / nBins;
    const edges = [];
    for (let i = 0; i <= nBins; i++) edges.push(min + i * step);
    edges[0]       -= 1e-9;  // sedikit lebih kecil agar nilai min masuk bin pertama
    edges[nBins]   += 1e-9;  // sedikit lebih besar agar nilai max masuk bin terakhir
    return edges;
  }

  _applyBin(val, edges) {
    const n = parseFloat(val);
    if (isNaN(n)) return val; // bukan angka -> kembalikan apa adanya
    const nBins = edges.length - 1;
    for (let b = 0; b < nBins; b++) {
      if (n > edges[b] && n <= edges[b + 1]) return `bin_${b}`;
    }
    // Di luar range: clamp ke bin pertama atau terakhir
    return n <= edges[0] ? `bin_0` : `bin_${nBins - 1}`;
  }

  /**
   * Logika utama perhitungan Naive Bayes di background thread (Worker)
   */
  async process(trainRowsDummy, testRowsDummy, config, onProgress) {
    const {
      classCol,
      featureCols,
      nBins = 5,
      rawRows,
      seed,
      testRatio,
      splitMethod
    } = config;

    onProgress('Split Data', 'Melakukan partisi training & testing...', 10);
    const { train: trainRowsArr, test: testRowsArr } = splitData(rawRows, classCol, testRatio, seed, splitMethod);

    onProgress('Diskritisasi', 'Mendeteksi dan melakukan binning pada kolom numerik...', 30);
    const binEdges = {};
    const contCols = [];
    featureCols.forEach(feat => {
      if (this._isContinuousCol(trainRowsArr, feat)) {
        // Hitung bin edges menggunakan seluruh dataset agar konsisten
        const edges = this._calcBinEdges(rawRows, feat, nBins);
        binEdges[feat] = edges;
        if (edges) contCols.push(feat);
      } else {
        binEdges[feat] = null;
      }
    });

    const getVal = (row, feat) => {
      const raw = row[feat];
      const edges = binEdges[feat];
      return edges ? this._applyBin(raw, edges) : raw;
    };

    onProgress('Training', 'Membangun tabel prior dan likelihood...', 50);
    const classCounts = {};
    const freqMap = {};
    const valSets = {};

    featureCols.forEach(feat => {
      freqMap[feat] = {};
      valSets[feat] = new Set();
    });

    const nTrain = trainRowsArr.length;
    for (let i = 0; i < nTrain; i++) {
      const row = trainRowsArr[i];
      const label = row[classCol];
      classCounts[label] = (classCounts[label] || 0) + 1;

      featureCols.forEach(feat => {
        const v = getVal(row, feat);
        valSets[feat].add(v);
        if (!freqMap[feat][label]) freqMap[feat][label] = {};
        freqMap[feat][label][v] = (freqMap[feat][label][v] || 0) + 1;
      });
    }

    const classes = Object.keys(classCounts).sort();
    const featureVals = {};
    featureCols.forEach(feat => {
      featureVals[feat] = [...valSets[feat]].sort();
    });

    // Priors
    const priors = {};
    classes.forEach(c => {
      priors[c] = classCounts[c] / nTrain;
    });

    // Likelihoods (dengan Laplace smoothing)
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

    // Helper prediksi
    const predictRow = (row) => {
      const post = {};
      classes.forEach(c => {
        let p = priors[c];
        featureCols.forEach(feat => {
          const v = getVal(row, feat);
          const lk = likelihoods[feat][c][v];
          p *= (lk !== undefined) ? lk : 1 / (classCounts[c] + featureVals[feat].length);
        });
        post[c] = p;
      });
      const pred = classes.reduce((a, b) => post[a] > post[b] ? a : b);
      return { post, pred };
    };

    onProgress('Evaluasi', 'Mengevaluasi akurasi dan confusion matrix...', 75);
    
    // Evaluasi training
    let trainCorrect = 0;
    const trainPreds = trainRowsArr.map(row => {
      const res = predictRow(row);
      if (res.pred === row[classCol]) trainCorrect++;
      return res;
    });
    const trainAcc = trainCorrect / nTrain;

    // Evaluasi testing
    const nTest = testRowsArr.length;
    let testCorrect = 0;
    const testPreds = [];
    const testLabels = [];

    const confMat = {};
    classes.forEach(a => {
      confMat[a] = {};
      classes.forEach(p => { confMat[a][p] = 0; });
    });

    for (let i = 0; i < nTest; i++) {
      const row = testRowsArr[i];
      const res = predictRow(row);
      const lbl = row[classCol];
      if (res.pred === lbl) testCorrect++;
      confMat[lbl][res.pred]++;
      testPreds.push(res);
      testLabels.push({
        features: featureCols.map(f => row[f]),
        label: lbl
      });
    }

    const testAcc = nTest > 0 ? (testCorrect / nTest) : 0;

    // Metrik Precision, Recall, F1 per kelas (dari test set)
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

    const macroP  = classes.reduce((s, c) => s + metrics[c].precision, 0) / classes.length;
    const macroR  = classes.reduce((s, c) => s + metrics[c].recall, 0) / classes.length;
    const macroF1 = classes.reduce((s, c) => s + metrics[c].f1, 0) / classes.length;

    onProgress('Selesai', 'Perhitungan Naive Bayes selesai.', 100);

    return {
      classes,
      classCounts,
      priors,
      likelihoods,
      featureCols,
      featureVals,
      classCol,
      nBins,
      total: rawRows.length,
      nTrain,
      nTest,
      trainRows: trainRowsArr,
      testRows: testRowsArr,
      binEdges,
      contCols,
      data: testLabels,
      allPreds: testPreds,
      correct: testCorrect,
      accuracy: (testAcc * 100).toFixed(1),
      confMat,
      metrics,
      macroP,
      macroR,
      macroF1,
      seed,
      splitMode: splitMethod === 'none' ? 'none' : 'holdout',
      trainAcc: (trainAcc * 100).toFixed(1),
      trainCorrect,
      rawRows
    };
  }

  /**
   * Menggambar visualisasi manual step-by-step di DOM (Main Thread)
   */
  renderHTML(r, container) {
    const pct = v => (v * 100).toFixed(1) + '%';
    const fmt = (n, d = 4) => {
      if (typeof n !== 'number' || isNaN(n)) return '—';
      return parseFloat(n.toFixed(d)).toString();
    };

    const hasTest = r.splitMode === 'holdout' && r.nTest > 0;

    // Excel address helper variables
    const dataRow1 = 2;
    const dataRowN = r.total + 1;
    const colMap = {};
    const allHeaders = r.featureCols.concat([r.classCol]);
    allHeaders.forEach((h, i) => {
      colMap[h] = col2l(i);
    });
    const classColLetter = colMap[r.classCol];
    const classRange = `Sheet1!$${classColLetter}$${dataRow1}:$${classColLetter}$${dataRowN}`;

    let html = `
      <!-- Train vs Test comparison cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:12px;margin-bottom:1.5rem">
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem;border-top:3px solid var(--yellow)">
          <div style="font-size:11px;font-family:var(--mono);color:var(--yellow);letter-spacing:.08em;text-transform:uppercase;margin-bottom:.5rem">Training Set (${r.nTrain} data)</div>
          <div class="metrics-grid" style="grid-template-columns:repeat(2,1fr);gap:8px">
            <div class="metric-card"><div class="metric-label">Accuracy</div><div class="metric-val" style="color:var(--yellow)">${r.trainAcc}%</div></div>
            <div class="metric-card"><div class="metric-label">Total Data</div><div class="metric-val metric-blue">${r.nTrain}</div></div>
          </div>
        </div>
        ${hasTest ? `
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem;border-top:3px solid var(--accent)">
          <div style="font-size:11px;font-family:var(--mono);color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:.5rem">Test Set (${r.nTest} data)</div>
          <div class="metrics-grid" style="grid-template-columns:repeat(2,1fr);gap:8px">
            <div class="metric-card"><div class="metric-label">Accuracy</div><div class="metric-val metric-green">${r.accuracy}%</div></div>
            <div class="metric-card"><div class="metric-label">Total Data</div><div class="metric-val metric-blue">${r.nTest}</div></div>
          </div>
        </div>` : ''}
      </div>
    `;

    /* ---- Banner kolom numerik kontinu yang didiskritisasi ---- */
    if (r.contCols && r.contCols.length > 0) {
      html += `
        <div style="background:rgba(90,98,117,0.18);border:1px solid var(--border2);
          border-radius:var(--radius);padding:0.65rem 1rem;font-size:14px;
          color:var(--text3);margin-bottom:0.75rem;">
          <span style="font-weight:600;color:var(--text2)">Diskritisasi Kolom Kontinu (n_bins = ${r.nBins}):</span>
          ${r.contCols.map(c => `
            <div style="margin-top:4px;font-family:var(--mono);">
              <strong>${escapeHTML(c)}</strong> &rarr; edges: [${r.binEdges[c].map(e => e.toFixed(4)).join(', ')}]
            </div>
          `).join('')}
        </div>`;
    }

    /* ---- Confusion Matrix ---- */
    html += `
      <div class="section">
        <div class="section-head">
          <div class="step-circle" style="background:var(--yellow);color:#000">CM</div>
          <div class="section-title">Confusion Matrix (Testing Set)</div>
        </div>
        <div class="section-body">
          <div class="info-box">
            <strong>Baris</strong> = kelas aktual &nbsp;|&nbsp; <strong>Kolom</strong> = kelas prediksi.<br>
            Diagonal (hijau) = prediksi benar. Luar diagonal (merah) = prediksi salah.
          </div>
          <div class="tbl-wrap" style="overflow-x:auto">
            <table style="min-width:max-content">
              <thead>
                <tr>
                  <th style="background:var(--bg4)">Aktual \\ Prediksi</th>
                  ${r.classes.map(c=>`<th style="background:var(--bg4)">${escapeHTML(c)}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${r.classes.map(actual => `
                <tr>
                  <td style="font-weight:600;background:var(--bg3)">${escapeHTML(actual)}</td>
                  ${r.classes.map(pred => {
                    const v    = r.confMat[actual][pred];
                    const diag = actual === pred;
                    return `<td class="mono" style="text-align:center;font-size:18px;
                      background:${diag ? 'rgba(52,211,153,0.12)' : v > 0 ? 'rgba(248,113,113,0.1)' : ''};
                      color:${diag ? 'var(--green)' : v > 0 ? 'var(--red)' : 'var(--text3)'};
                      font-weight:${diag||v>0?'600':'400'}">
                      ${v}
                    </td>`;
                  }).join('')}
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
  
          <!-- Precision / Recall / F1 per kelas -->
          <div style="margin-top:1.25rem;font-size:14px;font-weight:500;color:var(--text2);margin-bottom:0.5rem">
            Metrik per Kelas (Testing Set)
          </div>
          <div class="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Kelas</th><th>TP</th><th>FP</th><th>FN</th>
                  <th>Precision</th><th>Recall</th><th>F1-Score</th>
                </tr>
              </thead>
              <tbody>
                ${r.classes.map(c => {
                  const m = r.metrics[c];
                  const color = v => v >= 0.7 ? 'var(--green)' : v >= 0.5 ? 'var(--yellow)' : 'var(--red)';
                  return `<tr>
                    <td style="font-weight:600">${escapeHTML(c)}</td>
                    <td class="mono" style="color:var(--green)">${m.tp}</td>
                    <td class="mono" style="color:var(--red)">${m.fp}</td>
                    <td class="mono" style="color:var(--yellow)">${m.fn}</td>
                    <td class="mono" style="color:${color(m.precision)}">${pct(m.precision)}</td>
                    <td class="mono" style="color:${color(m.recall)}">${pct(m.recall)}</td>
                    <td class="mono" style="color:${color(m.f1)};font-weight:600">${pct(m.f1)}</td>
                  </tr>`;
                }).join('')}
                <tr style="border-top:2px solid var(--border2)">
                  <td style="font-weight:600;color:var(--text2)">Macro Avg</td>
                  <td>–</td><td>–</td><td>–</td>
                  <td class="mono" style="font-weight:600">${pct(r.macroP)}</td>
                  <td class="mono" style="font-weight:600">${pct(r.macroR)}</td>
                  <td class="mono" style="font-weight:600;color:${r.macroF1>=0.7?'var(--green)':'var(--yellow)'}">${pct(r.macroF1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    /* ================================================================
       STEP 1 — PRIOR
    ================================================================ */
    const priorExcelRows = [
      { cell: 'A1 (header)', formula: 'Kelas', comment: 'Judul kolom — ketik manual' },
      { cell: 'B1 (header)', formula: 'Jumlah', comment: '' },
      { cell: 'C1 (header)', formula: 'Total', comment: '' },
      { cell: 'D1 (header)', formula: 'P(C)', comment: '' },
      ...r.classes.flatMap((c, ci) => {
        const rowNum = ci + 2;
        return [
          { cell: `A${rowNum}`, formula: c, comment: `Nama kelas — ketik manual` },
          { cell: `B${rowNum}`, formula: `=COUNTIF(${classRange},"${c}")`, comment: `Jumlah baris kelas "${c}"` },
          { cell: `C${rowNum}`, formula: `=COUNTA(${classRange})`, comment: `Total semua data` },
          { cell: `D${rowNum}`, formula: `=B${rowNum}/C${rowNum}`, comment: `P(${c})` }
        ];
      })
    ];

    html += `
      <div class="section">
        <div class="section-head">
          <div class="step-circle">1</div>
          <div class="section-title">Probabilitas Prior — P(C)</div>
        </div>
        <div class="section-body">
          <div class="info-box">
            <strong>Konsep:</strong> Prior probability adalah probabilitas kemunculan kelas
            sebelum melihat data fitur apapun. Dihitung dari frekuensi relatif setiap kelas dalam data training.<br><br>
            <strong>Rumus:</strong> P(C) = jumlah data kelas C / total data training
          </div>
          <div class="tbl-wrap">
            <table>
              <thead>
                <tr><th>Kelas (C)</th><th>Jumlah Data</th><th>Total Data</th><th>Perhitungan</th><th>P(C)</th></tr>
              </thead>
              <tbody>
                ${r.classes.map(c => `
                <tr>
                  <td style="font-weight:600">${escapeHTML(c)}</td>
                  <td class="mono">${r.classCounts[c]}</td>
                  <td class="mono">${r.nTrain}</td>
                  <td class="mono">${r.classCounts[c]} / ${r.nTrain}</td>
                  <td class="mono" style="color:var(--accent)">${fmt(r.priors[c])}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div class="formula">${r.classes.map(c =>
            `P(${escapeHTML(c)}) = ${r.classCounts[c]}/${r.nTrain} = ${fmt(r.priors[c])}`).join('\n')}</div>
          
          ${this._buildExcelBlock('exc-prior', priorExcelRows)}
        </div>
      </div>`;

    /* ================================================================
       STEP 2 — LIKELIHOOD PER FITUR
    ================================================================ */
    let likeBody = `
      <div class="info-box">
        <strong>Konsep:</strong> Likelihood = probabilitas nilai fitur xi muncul pada kelas C.
        Laplace Smoothing mencegah nilai nol jika suatu nilai tidak muncul di kelas tertentu.<br><br>
        <strong>Rumus:</strong> P(xi | C) = (COUNTIFS(kolom_fitur, xi, kolom_kelas, C) + 1) / (COUNTIF(kolom_kelas, C) + jumlah_nilai_unik_fitur)
      </div>`;

    let likeSheetRowStart = r.classes.length + 3;

    r.featureCols.forEach((feat, fi) => {
      const vals = r.featureVals[feat];
      const featColLetter = colMap[feat];
      const featRange = `Sheet1!$${featColLetter}$${dataRow1}:$${featColLetter}$${dataRowN}`;

      const hRow  = likeSheetRowStart;
      const excRows = [
        { cell: `A${hRow} (header)`, formula: feat, comment: `Header fitur — ketik manual` },
        ...r.classes.map((c, ci) => ({
          cell: `${col2l(ci+1)}${hRow} (header)`,
          formula: `P(${feat}|${c})`,
          comment: 'Header kolom kelas — ketik manual'
        }))
      ];

      vals.forEach((v, vi) => {
        const rowNum = hRow + 1 + vi;
        excRows.push({ cell: `A${rowNum}`, formula: v, comment: `Nilai unik "${feat}" — ketik manual` });

        r.classes.forEach((c, ci) => {
          excRows.push({
            cell: `${col2l(ci+1)}${rowNum}`,
            formula: `=(COUNTIFS(${featRange},"${v}",${classRange},"${c}")+1)/(COUNTIF(${classRange},"${c}")+${vals.length})`,
            comment: `P(${feat}="${v}"|${c}) — ${vals.length} nilai unik`
          });
        });
      });

      likeBody += `
        <div style="font-size:18px;font-weight:500;color:var(--text);margin:1.25rem 0 0.3rem;">
          Fitur: <span style="color:var(--accent)">${escapeHTML(feat)}</span>
        </div>
        <div class="vals-scroll" style="margin-bottom:0.5rem;font-size:12px;color:var(--text3)">Nilai Unik: ${vals.map(v => '"' + v + '"').join(', ')}</div>
        <div class="tbl-wrap-scroll">
          <table>
            <thead>
              <tr>
                <th>Nilai (xi)</th>
                ${r.classes.map(c => `<th>P(${escapeHTML(feat)}&#124;${escapeHTML(c)})</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${vals.map(v => {
                return `<tr>
                  <td style="font-weight:600">${escapeHTML(v)}</td>
                  ${r.classes.map(c => {
                    const cnt = (r.classCounts[c] && r.likelihoods[feat][c][v]) ? ((r.likelihoods[feat][c][v] * (r.classCounts[c] + vals.length)) - 1) : 0;
                    const p   = r.likelihoods[feat][c][v];
                    return `<td class="mono">(${fmt(cnt, 0)}+1)/(${r.classCounts[c]}+${vals.length})
                      = <span style="color:var(--accent)">${fmt(p)}</span></td>`;
                  }).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        ${this._buildExcelBlock(`exc-like-${fi}`, excRows)}`;

      likeSheetRowStart += 1 + vals.length + 2;
    });

    html += `
      <div class="section">
        <div class="section-head">
          <div class="step-circle">2</div>
          <div class="section-title">Likelihood dengan Laplace Smoothing — P(xi | C)</div>
        </div>
        <div class="section-body">${likeBody}</div>
      </div>`;

    /* ================================================================
       STEP 3 — POSTERIOR (Contoh Baris Terakhir)
    ================================================================ */
    if (r.nTest > 0) {
      const exIdx = r.nTest - 1;
      const exRow = r.data[exIdx];
      const exPred = r.allPreds[exIdx].pred;
      const exPost = r.allPreds[exIdx].post;

      let postBody = `
        <div class="info-box">
          <strong>Data yang diklasifikasikan (baris terakhir test set):</strong><br>
          ${r.featureCols.map((f, i) => `<strong>${escapeHTML(f)}</strong> = ${escapeHTML(exRow.features[i])}`).join(' &nbsp;|&nbsp; ')}<br>
          <em style="color:var(--text3)">Label asli: ${escapeHTML(exRow.label)}</em>
        </div>
        <p style="font-size:14px;color:var(--text2);margin-bottom:0.5rem">
          Rumus posterior:&nbsp;
          <strong style="color:var(--text)">P(C|X) &prop; P(C) &times; P(x1|C) &times; P(x2|C) &times; &hellip;</strong>
        </p>`;

      const excelExRow = exIdx + dataRow1;

      r.classes.forEach(c => {
        let steps = `= ${fmt(r.priors[c])}`;
        let val   = r.priors[c];
        let label = `P(${escapeHTML(c)}|X) = P(${escapeHTML(c)})`;

        r.featureCols.forEach((feat, fi) => {
          const v = exRow.features[fi];
          const lk = r.likelihoods[feat][c][v] !== undefined ? r.likelihoods[feat][c][v] : 1 / (r.classCounts[c] + r.featureVals[feat].length);
          label += ` × P(${escapeHTML(feat)}=${escapeHTML(v)}|${escapeHTML(c)})`;
          steps += ` × ${fmt(lk)}`;
          val *= lk;
        });

        const isWinner = c === exPred;
        postBody += `
          <div style="margin-bottom:4px;font-size:12px;color:var(--text2);font-family:var(--mono)">${label}</div>
          <div class="formula" style="${isWinner ? 'border-left-color:var(--green);color:#a8ffcc' : ''}">
            ${steps}
            <br>= <strong>${fmt(val, 8)}</strong> ${isWinner ? '  ← TERBESAR' : ''}
          </div>`;
      });

      const postExcelRows = [];
      r.classes.forEach((c, ci) => {
        const priorFormula = `COUNTIF(${classRange},"${c}")/COUNTA(${classRange})`;
        const likeFormulas = r.featureCols.map(feat => {
          const featColLetter = colMap[feat];
          const featRangeFull = `Sheet1!$${featColLetter}$${dataRow1}:$${featColLetter}$${dataRowN}`;
          const vals = r.featureVals[feat];
          const valRef = `Sheet1!${featColLetter}${excelExRow}`;
          return `(COUNTIFS(${featRangeFull},${valRef},${classRange},"${c}")+1)/(COUNTIF(${classRange},"${c}")+${vals.length})`;
        });
        const fullFormula = `=(${priorFormula})*` + likeFormulas.join('*');
        postExcelRows.push({
          cell: `sel P(${c}|X)`,
          formula: fullFormula,
          comment: `Posterior kelas "${c}" untuk baris ke-${exIdx+1}`
        });
      });

      html += `
        <div class="section">
          <div class="section-head">
            <div class="step-circle">3</div>
            <div class="section-title">Klasifikasi Contoh (Baris Terakhir)</div>
          </div>
          <div class="section-body">
            ${postBody}
            <div class="tbl-wrap" style="margin-top:10px;">
              <table>
                <thead><tr><th>Kelas</th><th>Nilai Posterior</th><th>Keputusan</th></tr></thead>
                <tbody>
                  ${r.classes.map(c => `
                  <tr class="${c===exPred?'row-hl':''}">
                    <td style="font-weight:600">${escapeHTML(c)}</td>
                    <td class="mono">${fmt(exPost[c], 8)}</td>
                    <td>${c===exPred?`<span class="chip chip-ok">&#10003; Prediksi = ${escapeHTML(c)}</span>`:'–'}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
            ${this._buildExcelBlock('exc-post', postExcelRows)}
          </div>
        </div>`;
    }

    /* ================================================================
       STEP 4 — AKURASI LENGKAP
    ================================================================ */
    const predColIdx = r.featureCols.length + 2; 
    const predColLetter = col2l(predColIdx - 1);
    const statusColLetter = col2l(predColIdx);
    
    const accExcelRows = [
      { cell: `${predColLetter}1`, formula: 'Prediksi', comment: 'Kolom prediksi' }
    ];

    const r2 = dataRow1;
    const postFormulasParts = r.classes.map(c => {
      const priorFormula = `COUNTIF(${classRange},"${c}")/COUNTA(${classRange})`;
      const likeFormulas = r.featureCols.map(feat => {
        const featColLetter = colMap[feat];
        const featRangeFull = `Sheet1!$${featColLetter}$${dataRow1}:$${featColLetter}$${dataRowN}`;
        const vals = r.featureVals[feat];
        return `(COUNTIFS(${featRangeFull},Sheet1!${featColLetter}${r2},${classRange},"${c}")+1)/(COUNTIF(${classRange},"${c}")+${vals.length})`;
      });
      return `(${priorFormula})*` + likeFormulas.join('*');
    });

    const predFormula = `=INDEX({"${r.classes.join('","')}"},MATCH(MAX(${postFormulasParts.join(',')}),(${postFormulasParts.join(',')}),0))`;
    accExcelRows.push({
      cell: `${predColLetter}${r2}`,
      formula: predFormula,
      comment: `Prediksi kelas untuk baris ${r2} — salin ke baris ${r2+1} hingga ${dataRowN}`
    });

    accExcelRows.push({
      cell: `${statusColLetter}${r2}`,
      formula: `=IF(${predColLetter}${r2}=Sheet1!${colMap[r.classCol]}${r2},"Benar","Salah")`,
      comment: `Bandingkan prediksi vs label asli`
    });

    accExcelRows.push({
      cell: `sel Akurasi`,
      formula: `=COUNTIF(${statusColLetter}${r2}:${statusColLetter}${dataRowN},"Benar")/COUNTA(${classRange})*100`,
      comment: `Akurasi keseluruhan`
    });

    const evalFormulaRows = r.classes.map(c => {
      const m  = r.metrics[c];
      const colorV = v => v >= 0.7 ? 'var(--green)' : v >= 0.5 ? 'var(--yellow)' : 'var(--red)';
      return `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="font-weight:600;padding:10px 12px">${escapeHTML(c)}</td>
          <td class="mono" style="padding:10px 12px;color:var(--green)">${m.tp}</td>
          <td class="mono" style="padding:10px 12px;color:var(--red)">${m.fp}</td>
          <td class="mono" style="padding:10px 12px;color:var(--yellow)">${m.fn}</td>
          <td style="padding:10px 12px">
            <div class="formula" style="margin:0;font-size:11px;padding:4px 8px">
              TP / (TP + FP) = ${m.tp} / (${m.tp} + ${m.fp}) = ${m.tp + m.fp > 0 ? m.tp + '/' + (m.tp + m.fp) : '–'}
            </div>
            <div style="color:${colorV(m.precision)};font-family:var(--mono);font-size:12px;margin-top:3px">${pct(m.precision)}</div>
          </td>
          <td style="padding:10px 12px">
            <div class="formula" style="margin:0;font-size:11px;padding:4px 8px">
              TP / (TP + FN) = ${m.tp} / (${m.tp} + ${m.fn}) = ${m.tp + m.fn > 0 ? m.tp + '/' + (m.tp + m.fn) : '–'}
            </div>
            <div style="color:${colorV(m.recall)};font-family:var(--mono);font-size:12px;margin-top:3px">${pct(m.recall)}</div>
          </td>
          <td style="padding:10px 12px">
            <div class="formula" style="margin:0;font-size:11px;padding:4px 8px">
              2 × P × R / (P + R)
            </div>
            <div style="color:${colorV(m.f1)};font-family:var(--mono);font-size:12px;margin-top:3px;font-weight:600">${pct(m.f1)}</div>
          </td>
        </tr>`;
    }).join('');

    html += `
      <div class="section">
        <div class="section-head">
          <div class="step-circle">4</div>
          <div class="section-title">Akurasi &amp; Detail Evaluasi per Kelas</div>
        </div>
        <div class="section-body">
          <div class="tbl-wrap-scroll">
            <table style="min-width:max-content">
              <thead>
                <tr>
                  <th>Kelas</th>
                  <th>TP</th><th>FP</th><th>FN</th>
                  <th>Precision (rumus)</th>
                  <th>Recall (rumus)</th>
                  <th>F1-Score (rumus)</th>
                </tr>
              </thead>
              <tbody>
                ${evalFormulaRows}
                <tr style="border-top:2px solid var(--border2);background:var(--bg3)">
                  <td style="font-weight:600;padding:10px 12px;color:var(--text2)">Macro Avg</td>
                  <td colspan="3" style="padding:10px 12px;font-size:11px;color:var(--text3)">
                    Rata-rata ${r.classes.length} kelas
                  </td>
                  <td style="padding:10px 12px">
                    <div style="font-family:var(--mono);font-size:13px;font-weight:600">${pct(r.macroP)}</div>
                  </td>
                  <td style="padding:10px 12px">
                    <div style="font-family:var(--mono);font-size:13px;font-weight:600">${pct(r.macroR)}</div>
                  </td>
                  <td style="padding:10px 12px">
                    <div style="font-family:var(--mono);font-size:13px;font-weight:600;color:${r.macroF1>=0.7?'var(--green)':'var(--yellow)'}">${pct(r.macroF1)}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
  
          <hr class="divider" style="margin:1.25rem 0">
  
          <div class="info-box" style="margin-bottom:0.5rem">
            ${r.nTest > 500 ? `<strong>Data testing besar (${r.nTest.toLocaleString()} baris)</strong> — menampilkan 500 baris pertama data testing.` : `Menampilkan semua ${r.nTest} baris data testing.`}
          </div>
          <div class="tbl-wrap-scroll" id="acc-table-wrap">
            <table id="acc-table">
              <thead>
                <tr>
                  <th>#</th>
                  ${r.featureCols.map(f=>`<th>${escapeHTML(f)}</th>`).join('')}
                  <th>${escapeHTML(r.classCol)}</th><th>Prediksi</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${r.data.slice(0, 500).map((row, i) => {
                  const isOk = r.allPreds[i].pred === row.label;
                  return `
                    <tr>
                      <td class="mono" style="color:var(--text3)">${i + 1}</td>
                      ${row.features.map(v => `<td>${escapeHTML(v)}</td>`).join('')}
                      <td style="font-weight:500">${escapeHTML(row.label)}</td>
                      <td class="mono">${escapeHTML(r.allPreds[i].pred)}</td>
                      <td>${isOk
                        ? '<span class="chip chip-ok">&#10003; Benar</span>'
                        : '<span class="chip chip-fail">&#10007; Salah</span>'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
  
          ${this._buildExcelBlock('exc-acc', accExcelRows)}
        </div>
      </div>`;

    container.innerHTML = html;
  }

  /**
   * Membuat workbook SheetJS berisi formula berantai dinamis (hanya di Main Thread)
   */
  exportExcel(r, mode) {
    const fm = (mode === 'formula');
    
    // Alamat & Index helpers
    const D1_TR = 2;
    const DN_TR = r.nTrain + 1;
    const D1_TE = 2;
    const DN_TE = r.nTest + 1;

    const colMap = {};
    const allHeaders = r.featureCols.concat([r.classCol]);
    allHeaders.forEach((h, i) => {
      colMap[h] = col2l(i);
    });

    const clsL = colMap[r.classCol];
    const classRangeTrain = `'Data Training'!$${clsL}$${D1_TR}:$${clsL}$${DN_TR}`;
    const classRangeTest  = `'Data Testing'!$${clsL}$${D1_TE}:$${clsL}$${DN_TE}`;

    const WB = newWB();

    // 1. Sheet Data Training
    const trainSheetRows = r.trainRows.map(row => {
      const obj = {};
      allHeaders.forEach(h => {
        obj[h] = sanitizeFormula(row[h]);
      });
      return obj;
    });
    const wsTrain = XLSX.utils.json_to_sheet(trainSheetRows, { header: allHeaders });
    addWS(WB, wsTrain, 'Data Training');

    // 2. Sheet Data Testing
    const testSheetRows = r.testRows.map(row => {
      const obj = {};
      allHeaders.forEach(h => {
        obj[h] = sanitizeFormula(row[h]);
      });
      return obj;
    });
    const wsTest = XLSX.utils.json_to_sheet(testSheetRows, { header: allHeaders });
    addWS(WB, wsTest, 'Data Testing');

    // 3. Sheet Posterior (helper)
    const postAoa = [['Baris#', ...r.classes.map(c => `Post_${c}`)]];
    const postColL = {};
    r.classes.forEach((c, ci) => {
      postColL[c] = col2l(ci + 1);
    });

    for (let i = 0; i < r.nTest; i++) {
      const teRow = D1_TE + i;
      const row = [i + 1];
      r.classes.forEach(c => {
        if (fm) {
          const priorF = `COUNTIF(${classRangeTrain},"${c}")/COUNTA(${classRangeTrain})`;
          const likeFs = r.featureCols.map(feat => {
            const featL = colMap[feat];
            const featRangeTR = `'Data Training'!$${featL}$${D1_TR}:$${featL}$${DN_TR}`;
            const k = r.featureVals[feat].length;
            return `(COUNTIFS(${featRangeTR},'Data Testing'!${featL}${teRow},${classRangeTrain},"${c}")+1)/(COUNTIF(${classRangeTrain},"${c}")+${k})`;
          });
          row.push(fc(`(${priorF})*` + likeFs.join('*')));
        } else {
          // Plain value
          row.push(nc(r.allPreds[i].post[c]));
        }
      });
      postAoa.push(row);
    }
    const wsPost = aoaToWS(postAoa);
    addWS(WB, wsPost, 'Posterior');

    // 4. Sheet Perhitungan (Prior & Likelihood & Posterior Contoh)
    const aoaCalc = [];
    const push = row => aoaCalc.push(row);
    const empty = () => aoaCalc.push([]);

    push(['=== INFO PIPELINE ===']);
    push(['Total Data', r.total]);
    push(['Data Training', r.nTrain, fm ? fc(`B3/B2`) : r.nTrain / r.total]);
    push(['Data Testing', r.nTest, fm ? fc(`B4/B2`) : r.nTest / r.total]);
    push(['Metode Split', r.splitMode]);
    empty();

    if (r.contCols && r.contCols.length > 0) {
      push(['=== DISKRITISASI KOLOM NUMERIK ===']);
      push(['Kolom', 'Jumlah Bin', 'Bin Edges (dari training)']);
      r.contCols.forEach(feat => {
        const edges = r.binEdges[feat];
        push([feat, edges ? edges.length - 1 : '-', edges ? edges.map(e => n8(e)).join(' | ') : '-']);
      });
      empty();
    }

    push(['=== STEP 1: PROBABILITAS PRIOR P(C) ===']);
    push(['Kelas', 'Jumlah Data (Train)', 'Total Train', 'P(C)']);
    r.classes.forEach((c, ci) => {
      const rNum = aoaCalc.length + 1;
      push([
        c,
        fm ? fc(`COUNTIF(${classRangeTrain},"${c}")`) : r.classCounts[c],
        fm ? fc(`COUNTA(${classRangeTrain})`) : r.nTrain,
        fm ? fc(`B${rNum}/C${rNum}`) : priorsSafe(c)
      ]);
    });
    function priorsSafe(c) { return r.priors[c] || 0; }
    empty();

    push(['=== STEP 2: LIKELIHOOD P(xi|C) ===']);
    empty();

    const maxVals = Math.max(...r.featureCols.map(f => r.featureVals[f].length));
    const headerRow = [];
    r.featureCols.forEach(feat => {
      headerRow.push(`Fitur: ${feat}`, ...r.classes.map(c => `P(${feat}|${c})`), `k = ${r.featureVals[feat].length}`, '', '');
    });
    push(headerRow);

    for (let vi = 0; vi < maxVals; vi++) {
      const row = [];
      r.featureCols.forEach(feat => {
        const vals = r.featureVals[feat];
        const v = vals[vi];
        if (v === undefined) {
          row.push('', ...r.classes.map(() => ''), '', '', '');
        } else {
          row.push(sanitizeFormula(v));
          r.classes.forEach(c => {
            if (fm) {
              const featL = colMap[feat];
              const featRangeTR = `'Data Training'!$${featL}$${D1_TR}:$${featL}$${DN_TR}`;
              const k = vals.length;
              row.push(fc(`(COUNTIFS(${featRangeTR},"${v}",${classRangeTrain},"${c}")+1)/(COUNTIF(${classRangeTrain},"${c}")+${k})`));
            } else {
              row.push(nc(r.likelihoods[feat][c][v]));
            }
          });
          row.push(vals.length, '', '');
        }
      });
      push(row);
    }
    empty();

    if (r.nTest > 0) {
      const exIdx = r.nTest - 1;
      const exRow = r.data[exIdx];
      const exPred = r.allPreds[exIdx].pred;
      const exPost = r.allPreds[exIdx].post;
      const excelExRow = exIdx + D1_TE;
      const postExRow = exIdx + 2;

      push(['=== STEP 3: POSTERIOR (Contoh Baris Terakhir Test Set) ===']);
      push(['Data Testing:', ...r.featureCols.map((f, i) => `${f}=${exRow.features[i]}`), `Label Asli: ${exRow.label}`]);
      empty();
      push(['Kelas', 'P(C)', 'P(C|X) formula', 'P(C|X) raw', 'Prediksi?']);

      r.classes.forEach(c => {
        push([
          c,
          fm ? fc(`COUNTIF(${classRangeTrain},"${c}")/COUNTA(${classRangeTrain})`) : nc(r.priors[c]),
          fm ? fc(`Posterior!${postColL[c]}${postExRow}`) : nc(exPost[c]),
          nc(exPost[c]),
          c === exPred ? `<- Prediksi: ${c}` : ''
        ]);
      });
    }

    const wsCalc = aoaToWS(aoaCalc);
    addWS(WB, wsCalc, 'Perhitungan');

    // 5. Sheet Prediksi
    const classArray = `{"${r.classes.join('","')}"}`;
    const n = r.classes.length;
    const chooseIdxs = Array.from({ length: n }, (_, j) => j + 1).join(',');

    const aoaPred = [
      ['=== PREDIKSI DATA TESTING ==='],
      ['#', ...r.featureCols, r.classCol, 'Prediksi', 'Status'],
    ];

    for (let i = 0; i < r.nTest; i++) {
      const teRow = D1_TE + i;
      const postRow = i + 2;
      const calcRow = aoaPred.length + 1;

      const postCellRefs = r.classes.map(c => `Posterior!${postColL[c]}${postRow}`);
      const postRangeArr = postCellRefs.join(',');
      const predF = `INDEX(${classArray},MATCH(MAX(${postRangeArr}),CHOOSE({${chooseIdxs}},${postRangeArr}),0))`;
      const statF = `IF(G${calcRow}='Data Testing'!${colMap[r.classCol]}${teRow},"Benar","Salah")`; // G is column index of Prediksi column (which is dynamic, but let's make it col2l(r.featureCols.length + 2))
      
      const predColLetter = col2l(r.featureCols.length + 1);
      const labelColLetter = colMap[r.classCol];
      const dynamicStatF = `IF(${predColLetter}${calcRow}='Data Testing'!${labelColLetter}${teRow},"Benar","Salah")`;

      aoaPred.push([
        i + 1,
        ...r.featureCols.map(feat => fm ? fc(`'Data Testing'!${colMap[feat]}${teRow}`) : sanitizeFormula(r.data[i].features[r.featureCols.indexOf(feat)])),
        fm ? fc(`'Data Testing'!${colMap[r.classCol]}${teRow}`) : sanitizeFormula(r.data[i].label),
        fm ? fc(predF) : sc(r.allPreds[i].pred),
        fm ? fc(dynamicStatF) : sc(r.allPreds[i].pred === r.data[i].label ? 'Benar' : 'Salah')
      ]);
    }

    const startIdx = 3;
    const endIdx = aoaPred.length;
    const statusColLP = col2l(r.featureCols.length + 2);

    empty();
    push(['Jumlah Benar', '', '', fm ? fc(`COUNTIF(${statusColLP}${startIdx}:${statusColLP}${endIdx},"Benar")`) : r.correct]);
    push(['Jumlah Salah', '', '', fm ? fc(`COUNTIF(${statusColLP}${startIdx}:${statusColLP}${endIdx},"Salah")`) : r.nTest - r.correct]);
    push(['Total Test',   '', '', r.nTest]);
    push(['Akurasi (%)',  '', '', fm ? fc(`COUNTIF(${statusColLP}${startIdx}:${statusColLP}${endIdx},"Benar")/${r.nTest}*100`) : (r.correct / r.nTest * 100)]);

    const wsPred = aoaToWS(aoaPred);
    addWS(WB, wsPred, 'Prediksi');

    // 6. Sheet Evaluasi
    const predRangeEval  = `Prediksi!$${col2l(r.featureCols.length + 1)}$${startIdx}:$${col2l(r.featureCols.length + 1)}$${endIdx}`;
    const labelRangeEval = `'Data Testing'!$${clsL}$${D1_TE}:$${clsL}$${DN_TE}`;

    const aoaEval = [
      ['=== CONFUSION MATRIX ==='],
      ['Aktual \\ Prediksi', ...r.classes]
    ];

    r.classes.forEach((actual, ai) => {
      aoaEval.push([
        actual,
        ...r.classes.map(pred => fm ? fc(`COUNTIFS(${predRangeEval},"${pred}",${labelRangeEval},"${actual}")`) : r.confMat[actual][pred])
      ]);
    });
    empty();

    aoaEval.push(['=== METRIK EVALUASI ===']);
    aoaEval.push(['Kelas', 'TP', 'FP', 'FN', 'Precision (%)', 'Recall (%)', 'F1-Score (%)']);
    
    const evalStartRow = aoaEval.length + 1;
    r.classes.forEach((c, ci) => {
      const rNum = aoaEval.length + 1;
      if (fm) {
        const tpF = `COUNTIFS(${predRangeEval},"${c}",${labelRangeEval},"${c}")`;
        const fpF = `COUNTIFS(${predRangeEval},"${c}",${labelRangeEval},"<>${c}")`;
        const fnF = `COUNTIFS(${predRangeEval},"<>${c}",${labelRangeEval},"${c}")`;
        const prF = `IF(B${rNum}+C${rNum}>0,B${rNum}/(B${rNum}+C${rNum})*100,0)`;
        const rcF = `IF(B${rNum}+D${rNum}>0,B${rNum}/(B${rNum}+D${rNum})*100,0)`;
        const f1F = `IF(E${rNum}+F${rNum}>0,2*E${rNum}*F${rNum}/(E${rNum}+F${rNum}),0)`;
        aoaEval.push([c, fc(tpF), fc(fpF), fc(fnF), fc(prF), fc(rcF), fc(f1F)]);
      } else {
        aoaEval.push([c, r.metrics[c].tp, r.metrics[c].fp, r.metrics[c].fn, r.metrics[c].precision * 100, r.metrics[c].recall * 100, r.metrics[c].f1 * 100]);
      }
    });

    const evalEndRow = aoaEval.length;
    if (fm) {
      aoaEval.push([
        'Macro Avg', '', '', '',
        fc(`AVERAGE(E${evalStartRow}:E${evalEndRow})`),
        fc(`AVERAGE(F${evalStartRow}:F${evalEndRow})`),
        fc(`AVERAGE(G${evalStartRow}:G${evalEndRow})`)
      ]);
    } else {
      aoaEval.push(['Macro Avg', '', '', '', r.macroP * 100, r.macroR * 100, r.macroF1 * 100]);
    }

    const wsEval = aoaToWS(aoaEval);
    addWS(WB, wsEval, 'Evaluasi');

    return WB;
  }
}

// Registrasi plugin ke registry
if (typeof registry !== 'undefined') {
  registry.register(new NaiveBayesPlugin());
}
