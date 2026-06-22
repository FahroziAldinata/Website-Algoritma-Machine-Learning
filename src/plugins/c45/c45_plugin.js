/**
 * src/plugins/c45/c45_plugin.js
 * C4.5 Decision Tree Algorithm Plugin
 * 
 * Tujuan: Mengimplementasikan algoritma pohon keputusan C4.5.
 * Mendukung fitur kategorikal & numerik (midpoint Quinlan 1993), kriteria split
 * Info Gain & Gain Ratio, visualisasi pohon keputusan bertingkat, detail
 * langkah entropy & gain tiap node, serta ekspor Excel berantai formula.
 */

class C45Plugin extends AlgorithmPlugin {
  constructor() {
    super();
    this.id = 'c45';
    this.name = 'C4.5 Decision Tree';
    this.icon = '&#9650;';
    this.description = 'Klasifikasi berbasis pohon keputusan (decision tree) menggunakan Entropy, Information Gain, dan Gain Ratio.';
    
    this.configSchema = {
      criterion: {
        label: 'Kriteria Split',
        type: 'select',
        options: [
          { label: 'Gain Ratio (Default C4.5)', value: 'gain_ratio' },
          { label: 'Information Gain (ID3)', value: 'info_gain' }
        ],
        default: 'gain_ratio'
      },
      numThreshold: {
        label: 'Threshold Numerik',
        type: 'select',
        options: [
          { label: 'Midpoint Boundary (Quinlan)', value: 'midpoint' },
          { label: 'Rata-rata (Mean)', value: 'mean' }
        ],
        default: 'midpoint'
      },
      maxDepth: {
        label: 'Maksimal Kedalaman',
        type: 'number',
        min: 1,
        max: 20,
        step: 1,
        default: 5
      },
      minSamples: {
        label: 'Minimal Sampel per Split',
        type: 'number',
        min: 1,
        max: 100,
        step: 1,
        default: 2
      }
    };
  }

  /**
   * Logika perhitungan model C4.5 di background thread
   */
  async process(trainRowsDummy, testRowsDummy, config, onProgress) {
    const {
      classCol,
      featureCols,
      maxDepth = 5,
      minSamples = 2,
      numThreshold = 'midpoint',
      criterion = 'gain_ratio',
      seed = 42,
      testRatio = 0.2,
      splitMethod = 'random',
      rawRows
    } = config;

    // Convert rawRows (objects) to arrays-of-arrays format
    const headers = Object.keys(rawRows[0]);
    const classIdx = headers.indexOf(classCol);
    const featIdxs = featureCols.map(c => headers.indexOf(c));
    const allRowsArr = rawRows.map(r => headers.map(h => r[h]));
    
    // Deteksi tipe kolom (num/cat)
    const colTypes = this._detectColTypes(headers, allRowsArr);

    // Lakukan pemisahan dataset
    const { train: trainCleanObj, test: testCleanObj } = splitData(
      rawRows, classCol, testRatio, seed, splitMethod
    );

    const trainRowsArr = trainCleanObj.map(r => headers.map(h => r[h]));
    const testRowsArr = testCleanObj.map(r => headers.map(h => r[h]));

    // Bangun pohon keputusan C4.5
    const { tree, steps, nodeCount } = this._buildTree(
      trainRowsArr, featIdxs, colTypes, headers, classIdx,
      maxDepth, minSamples, numThreshold, criterion, onProgress
    );

    // Evaluasi training
    onProgress('Evaluasi Training', 'Evaluasi akurasi training set...', 80);
    const yTrueTrain = trainRowsArr.map(r => r[classIdx]);
    const yPredTrain = trainRowsArr.map(r => this._predict(tree, r));
    const acc = this._accuracy(yTrueTrain, yPredTrain);
    const classes = [...new Set(allRowsArr.map(r => r[classIdx]))].sort();
    const cm = this._confusionMatrix(yTrueTrain, yPredTrain, classes);

    // Evaluasi test
    let accTest = null, cmTest = null;
    if (testRowsArr.length > 0) {
      onProgress('Evaluasi Test', `Evaluasi test set (${testRowsArr.length} baris)...`, 90);
      const yTrueTest = testRowsArr.map(r => r[classIdx]);
      const yPredTest = testRowsArr.map(r => this._predict(tree, r));
      accTest = this._accuracy(yTrueTest, yPredTest);
      cmTest = this._confusionMatrix(yTrueTest, yPredTest, classes);
    }

    onProgress('Selesai', 'Perhitungan C4.5 selesai.', 100);

    return {
      tree,
      steps,
      allClasses: classes,
      trainRows: trainCleanObj,
      testRows: testCleanObj,
      acc,
      cm,
      accTest,
      cmTest,
      nodeCount,
      headers,
      colTypes,
      classCol,
      featCols: featureCols,
      criterion,
      splitMode: splitMethod === 'none' ? 'none' : 'holdout',
      maxDepth,
      minSamples,
      numThreshold,
      seed
    };
  }

  /**
   * Menggambar representasi pohon dan perhitungan di DOM
   */
  renderHTML(r, container) {
    const depthColors = [
      'var(--tree-depth-0, #ff4f4f)',
      'var(--tree-depth-1, #4f9cf9)',
      'var(--tree-depth-2, #34d399)',
      'var(--tree-depth-3, #fbbf24)',
      'var(--tree-depth-4, #a78bfa)'
    ];

    const hasTest = r.splitMode === 'holdout' && r.accTest != null && r.cmTest != null;

    // Helper formatting
    const pct = v => (v * 100).toFixed(1) + '%';
    const fmt = (n, d = 4) => {
      if (typeof n !== 'number' || isNaN(n)) return '—';
      return parseFloat(n.toFixed(d)).toString();
    };

    let html = `
      <!-- Train vs Test comparison cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:12px;margin-bottom:1.5rem">
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem;border-top:3px solid var(--yellow)">
          <div style="font-size:11px;font-family:var(--mono);color:var(--yellow);letter-spacing:.08em;text-transform:uppercase;margin-bottom:.5rem">Training Set (${r.trainRows.length} data)</div>
          <div class="metrics-grid" style="grid-template-columns:repeat(2,1fr);gap:8px">
            <div class="metric-card"><div class="metric-label">Accuracy</div><div class="metric-val" style="color:var(--yellow)">${pct(r.acc)}</div></div>
            <div class="metric-card"><div class="metric-label">Node Split</div><div class="metric-val" style="color:var(--yellow)">${r.steps.filter(s => s.type === 'split').length}</div></div>
          </div>
        </div>
        ${hasTest ? `
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem;border-top:3px solid var(--accent)">
          <div style="font-size:11px;font-family:var(--mono);color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:.5rem">Test Set (${r.testRows.length} data)</div>
          <div class="metrics-grid" style="grid-template-columns:repeat(2,1fr);gap:8px">
            <div class="metric-card"><div class="metric-label">Accuracy</div><div class="metric-val metric-green">${pct(r.accTest)}</div></div>
            <div class="metric-card"><div class="metric-label">Total Data</div><div class="metric-val metric-blue">${r.testRows.length}</div></div>
          </div>
        </div>` : ''}
      </div>
    `;

    // 1. Tree visualizer (Teks terformat)
    const lines = [];
    this._treeToLines(r.tree, '', true, lines, depthColors, fmt);
    const treeHTML = lines.join('\n');

    html += `
      <div class="section">
        <div class="section-head"><div class="step-circle">&#9650;</div><div class="section-title">Pohon Keputusan (Visual Teks)</div></div>
        <div class="section-body">
          <div class="vals-scroll" style="max-height: 400px; white-space: pre; background: var(--bg3); padding: 1.25rem;">${treeHTML}</div>
        </div>
      </div>
    `;

    // 2. Step-by-step accordion
    const blocks = r.steps.map((step, idx) => {
      const depthBadge = `<span class="chip" style="background:var(--bg4);font-size:11px;padding:2px 8px;">depth ${step.depth}</span>`;
      
      if (step.type === 'leaf') {
        const node = step.node;
        const freq = Object.entries(node.freq).map(([k, v]) =>
          `<span class="chip ${k === node.label ? 'chip-ok' : 'chip-fail'}" style="margin-right:4px">${escapeHTML(k)}: ${v}</span>`
        ).join('');
        return `
          <div class="iter-block" style="border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;overflow:hidden">
            <div class="section-head" style="background:var(--bg3);cursor:pointer;display:flex;justify-content:space-between;padding:10px 15px;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
              <div style="font-weight:500;font-size:14px;">🍃 Node Daun [#${idx + 1}] &rarr; <strong>${escapeHTML(node.label)}</strong> <span style="color:var(--text3)">(${escapeHTML(step.nodeName)}, n=${node.n})</span></div>
              ${depthBadge}
            </div>
            <div style="display:none;padding:15px;background:var(--bg2);">
              <div style="font-size:13px;color:var(--text2);margin-bottom:0.5rem">Alasan: <strong>${escapeHTML(step.reason)}</strong></div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">${freq}</div>
              ${this._renderEntropyFormula(node.entropy, node.freq, node.n, r.classCol, fmt)}
            </div>
          </div>
        `;
      }

      // Split node
      const best = step.best;
      const scoreLabel = r.criterion === 'gain_ratio' ? 'Gain Ratio' : 'Info Gain';
      const scoreVal = r.criterion === 'gain_ratio' ? best.gainRatio : best.gain;

      return `
        <div class="iter-block" style="border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;overflow:hidden">
          <div class="section-head" style="background:var(--bg3);cursor:pointer;display:flex;justify-content:space-between;padding:10px 15px;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
            <div style="font-weight:500;font-size:14px;">🔀 Node Split [#${idx + 1}] &rarr; Kolom <strong>${escapeHTML(r.headers[best.fi])}</strong> <span style="color:var(--text3)">(${escapeHTML(step.nodeName)}, n=${step.rows.length})</span></div>
            ${depthBadge}
          </div>
          <div style="display:none;padding:15px;background:var(--bg2);">
            <div class="sub-title">1. Entropy Parent</div>
            ${this._renderEntropyFormula(step.parentH, this._classFreq(step.labels), step.labels.length, r.classCol, fmt)}
            
            <div class="sub-title" style="margin-top:10px;">2. Tabel Gain Fitur</div>
            ${this._renderGainTable(step.gains, best, r.headers, r.criterion, fmt)}
            
            <div class="sub-title" style="margin-top:10px;">3. Detail Split Terpilih &rarr; ${escapeHTML(r.headers[best.fi])}</div>
            ${this._renderBestAttrDetail(best, step, r.headers, r.criterion, fmt)}
          </div>
        </div>
      `;
    }).join('');

    html += `
      <div class="section">
        <div class="section-head"><div class="step-circle">S</div><div class="section-title">Langkah Perhitungan Detil (Klik Node untuk Membuka)</div></div>
        <div class="section-body">${blocks}</div>
      </div>
    `;

    // 3. Confusion Matrix
    html += `
      <div class="section">
        <div class="section-head"><div class="step-circle">M</div><div class="section-title">Confusion Matrix (Training Set)</div></div>
        <div class="section-body">
          <div class="tbl-wrap-scroll">
            <table>
              <thead>
                <tr>
                  <th>↓ Aktual / Prediksi →</th>
                  ${r.allClasses.map(c => `<th>${escapeHTML(c)}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${r.allClasses.map((clsActual, i) => `
                  <tr>
                    <th>${escapeHTML(clsActual)}</th>
                    ${r.allClasses.map((clsPred, j) => {
                      const val = r.cm[i][j] || 0;
                      return `<td style="${i === j ? 'background:rgba(52,211,153,0.12);color:var(--green);font-weight:600' : val > 0 ? 'color:var(--red)' : 'color:var(--text3)'}">${val}</td>`;
                    }).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  /**
   * Helper: Render pohon sebagai lines teks preformatted
   */
  _treeToLines(node, prefix, isLast, lines, depthColors, fmt) {
    const connector = isLast ? '└── ' : '├── ';
    const color = depthColors[Math.min(node.depth, depthColors.length - 1)];

    if (node.type === 'leaf') {
      const freq = Object.entries(node.freq).map(([k, v]) => `${escapeHTML(k)}:${v}`).join(', ');
      lines.push(`${prefix}${connector}<span style="color:var(--yellow)">[DAUN: ${escapeHTML(node.label)}]</span> (n=${node.n}, {${freq}})`);
      return;
    }

    const threshStr = node.isNum ? ` &le; ${escapeHTML(fmt(node.threshold))}` : '';
    lines.push(`${prefix}${connector}<span style="color:${color};font-weight:600;">${escapeHTML(node.attrName)}${threshStr}</span> (n=${node.n}, H=${fmt(node.parentEntropy, 4)})`);

    const childExt = prefix + (isLast ? '    ' : '│   ');
    const keys = Object.keys(node.children);
    keys.forEach((k, i) => {
      const childConn = i < keys.length - 1 ? '├── ' : '└── ';
      lines.push(`${childExt}${childConn}<span style="color:var(--text2)">${escapeHTML(k)}:</span>`);
      this._treeToLines(node.children[k], childExt + '    ', i === keys.length - 1, lines, depthColors, fmt);
    });
  }

  /**
   * Helper: Render visual formula entropy
   */
  _renderEntropyFormula(H, freq, n, classCol, fmt) {
    const classColL = col2l(classCol != null ? classCol : 0);
    const terms = Object.entries(freq).map(([cls, cnt]) => {
      const p = cnt / n;
      return `−(${cnt}/${n}) × log₂(${cnt}/${n}) = ${fmt(-p * Math.log2(p), 4)}`;
    });
    return `
      <div class="formula">
        Entropy = ${terms.join(' + ')}
        <br>&rarr; <strong>H = ${fmt(H, 4)} bit</strong>
      </div>
    `;
  }

  /**
   * Helper: Render tabel gain untuk node split
   */
  _renderGainTable(gains, best, headers, criterion, fmt) {
    const scoreKey = criterion === 'gain_ratio' ? 'gainRatio' : 'gain';
    const scoreLabel = criterion === 'gain_ratio' ? 'Gain Ratio' : 'Info Gain';

    const rows = gains.map(g => {
      const isBest = g.fi === best.fi;
      const thStr = g.isNum && g.threshold !== null ? ` (&le;${fmt(g.threshold)})` : '';
      return `
        <tr ${isBest ? 'class="row-hl"' : ''}>
          <td><strong>${escapeHTML(headers[g.fi])}${thStr}</strong>${isBest ? ' <span style="color:var(--green)">★</span>' : ''}</td>
          <td>${g.isNum ? 'numerik' : 'kategorik'}</td>
          ${criterion === 'gain_ratio' ? `<td>${fmt(g.gain)}</td><td>${fmt(g.splitInfo)}</td>` : ''}
          <td class="mono" style="${isBest ? 'color:var(--green);font-weight:600;' : ''}">${fmt(g[scoreKey])}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="tbl-wrap-scroll" style="max-height:200px">
        <table>
          <thead>
            <tr>
              <th>Atribut</th>
              <th>Tipe</th>
              ${criterion === 'gain_ratio' ? '<th>Info Gain</th><th>Split Info</th>' : ''}
              <th>${scoreLabel}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  /**
   * Helper: Render detail split untuk atribut terpilih
   */
  _renderBestAttrDetail(best, step, headers, criterion, fmt) {
    const n = step.rows.length;
    let groupLines = '';

    for (const [val, labels] of Object.entries(best.groups)) {
      const freq = this._classFreq(Array.isArray(labels) ? labels : [labels]);
      const cnt = Array.isArray(labels) ? labels.length : 1;
      const H = this._entropyFromLabels(Array.isArray(labels) ? labels : [labels]);
      const freqStr = Object.entries(freq).map(([k, v]) => `${escapeHTML(k)}=${v}`).join(', ');
      groupLines += `
        <div style="font-size:12px;color:var(--text2);margin-bottom:0.25rem">
          &bull; Cabang <strong>${escapeHTML(val)}</strong>: n=${cnt}, {${freqStr}}, H=${fmt(H, 3)}
        </div>
      `;
    }

    return `
      <div style="background:var(--bg3);border-radius:var(--radius);padding:10px;font-family:var(--mono);">
        ${groupLines}
        <div style="border-top:1px dashed var(--border);margin-top:6px;padding-top:6px;font-size:12px;color:var(--text);">
          Info Gain = ${fmt(best.gain, 4)}
          ${criterion === 'gain_ratio' ? `&nbsp;|&nbsp; Split Info = ${fmt(best.splitInfo, 4)} &nbsp;|&nbsp; Gain Ratio = <strong>${fmt(best.gainRatio, 4)}</strong>` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Ekspor C4.5 ke Excel workbook SheetJS
   */
  exportExcel(r, mode) {
    const fm = (mode === 'formula');
    const _EX = {};
    const WB = newWB();

    // S1 - Dataset
    const sh1 = [[...r.headers]];
    r.trainRows.forEach(row => sh1.push(r.headers.map(h => sanitizeFormula(row[h]))));
    r.testRows.forEach(row => sh1.push(r.headers.map(h => sanitizeFormula(row[h]))));
    const ws1 = aoaToWS(sh1);
    addWS(WB, ws1, 'Dataset');

    // S2 - Perhitungan
    const sh2 = [];
    const classColL = col2l(r.headers.indexOf(r.classCol));
    const dsClsRng = `Dataset!${classColL}$2:${classColL}$${r.trainRows.length + r.testRows.length + 1}`;
    
    sh2.push(['C4.5 — Langkah Perhitungan Entropy']);
    sh2.push(['']);
    sh2.push([`=== ENTROPY PARENT (n=${r.trainRows.length + r.testRows.length}) ===`]);
    sh2.push(['Kelas', 'Jumlah (n_i)', 'Total (N)', 'Proporsi p_i', '-p*log2(p)', 'Entropy H']);

    const parentFreq = this._classFreq(r.trainRows.map(row => row[r.classCol]).concat(r.testRows.map(row => row[r.classCol])));
    const efdr = sh2.length + 1; // 5

    r.allClasses.forEach((cls, ci) => {
      const ni = parentFreq[cls] || 0;
      const totalN = r.trainRows.length + r.testRows.length;
      const pi = ni / totalN;
      const neg = pi > 0 ? -pi * Math.log2(pi) : 0;
      const er = efdr + ci;

      if (fm) {
        sh2.push([
          sanitizeFormula(cls),
          fc(`COUNTIF(${dsClsRng},"${cls}")`),
          fc(`COUNTA(${dsClsRng})`),
          fc(`B${er}/C${er}`),
          fc(`IF(D${er}=0,0,-D${er}*LOG(D${er},2))`),
          ''
        ]);
      } else {
        sh2.push([sanitizeFormula(cls), ni, totalN, n8(pi), n8(neg), '']);
      }
    });

    const eldr = efdr + r.allClasses.length - 1;
    if (fm) {
      sh2.push(['', '', '', '', 'H(parent) =', fc(`SUM(E${efdr}:E${eldr})`)]);
    } else {
      const parentH = Object.values(parentFreq).reduce((s, cnt) => {
        const p = cnt / (r.trainRows.length + r.testRows.length);
        return s - (p > 0 ? p * Math.log2(p) : 0);
      }, 0);
      sh2.push(['', '', '', '', 'H(parent) =', n8(parentH)]);
    }

    addWS(WB, aoaToWS(sh2), 'Perhitungan');

    // S3 - Prediksi
    const sh3 = [['#', ...r.headers, 'Prediksi', 'Aktual', 'Benar?']];
    const totalSet = r.trainRows.concat(r.testRows);
    
    totalSet.forEach((row, i) => {
      const pred = this._predict(r.tree, r.headers.map(h => row[h]));
      const actual = row[r.classCol];
      sh3.push([
        i + 1,
        ...r.headers.map(h => sanitizeFormula(row[h])),
        sanitizeFormula(pred),
        sanitizeFormula(actual),
        pred === actual ? 'Ya' : 'Tidak'
      ]);
    });
    addWS(WB, aoaToWS(sh3), 'Prediksi');

    return WB;
  }

  /* ============================================================
     HELPER METHODS
     ============================================================ */

  _detectColTypes(headers, rows) {
    return headers.map((h, i) => {
      const vals = rows.map(r => r[i]).filter(v => v !== '' && v !== null && v !== undefined);
      const numCount = vals.filter(v => !isNaN(parseFloat(v)) && isFinite(v)).length;
      return numCount / vals.length > 0.8 ? 'num' : 'cat';
    });
  }

  _entropy(counts) {
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

  _entropyFromLabels(labels) {
    const freq = {};
    for (const l of labels) freq[l] = (freq[l] || 0) + 1;
    return this._entropy(Object.values(freq));
  }

  _classFreq(labels) {
    const freq = {};
    for (const l of labels) freq[l] = (freq[l] || 0) + 1;
    return freq;
  }

  _majorityClass(labels) {
    const freq = {};
    for (const l of labels) freq[l] = (freq[l] || 0) + 1;
    return Object.keys(freq).reduce((a, b) => {
      if (freq[a] !== freq[b]) return freq[a] > freq[b] ? a : b;
      return a <= b ? a : b;
    });
  }

  _isPure(labels) {
    return new Set(labels).size === 1;
  }

  _accuracy(yTrue, yPred) {
    let correct = 0;
    for (let i = 0; i < yTrue.length; i++) {
      if (yTrue[i] === yPred[i]) correct++;
    }
    return correct / yTrue.length;
  }

  _confusionMatrix(yTrue, yPred, classes) {
    const n = classes.length;
    const mat = Array.from({ length: n }, () => new Array(n).fill(0));
    const idx = {};
    classes.forEach((c, i) => idx[c] = i);
    for (let i = 0; i < yTrue.length; i++) {
      const r = idx[yTrue[i]], c = idx[yPred[i]];
      if (r !== undefined && c !== undefined) mat[r][c]++;
    }
    return mat;
  }

  _infoGainCat(rows, attrIdx, classIdx) {
    const total = rows.length;
    const parentH = this._entropyFromLabels(rows.map(r => r[classIdx]));
    const groups = {};
    for (const r of rows) {
      const val = r[attrIdx];
      if (!groups[val]) groups[val] = [];
      groups[val].push(r[classIdx]);
    }
    let weightedH = 0;
    const splitInfo = [];
    for (const val of Object.keys(groups)) {
      const g = groups[val];
      const frac = g.length / total;
      weightedH += frac * this._entropyFromLabels(g);
      splitInfo.push(frac);
    }
    const gain = parentH - weightedH;
    let si = 0;
    for (const f of splitInfo) {
      if (f > 0) si -= f * Math.log2(f);
    }
    const gainRatio = si === 0 ? 0 : gain / si;
    return { gain, gainRatio, splitInfo: si, groups, parentH, weightedH };
  }

  _infoGainNum(rows, attrIdx, classIdx, thresholdMode, criterion) {
    const total = rows.length;
    const parentH = this._entropyFromLabels(rows.map(r => r[classIdx]));
    const sorted = [...rows].sort((a, b) => parseFloat(a[attrIdx]) - parseFloat(b[attrIdx]));

    let bestScore = -Infinity;
    let bestGain = 0;
    let bestGainRatio = 0;
    let bestThreshold = null;
    let bestGroups = null;
    let bestSplitInfo = 0;

    if (thresholdMode === 'mean') {
      const mean = rows.reduce((s, r) => s + parseFloat(r[attrIdx]), 0) / total;
      const result = this._evalThreshold(rows, attrIdx, classIdx, mean, parentH, total);
      return { ...result, threshold: mean };
    }

    const candidates = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const va = parseFloat(sorted[i][attrIdx]);
      const vb = parseFloat(sorted[i + 1][attrIdx]);
      if (va === vb) continue;
      if (sorted[i][classIdx] === sorted[i + 1][classIdx]) continue;
      const mid = (va + vb) / 2;
      if (!candidates.includes(mid)) candidates.push(mid);
    }

    if (candidates.length === 0) {
      for (let i = 0; i < sorted.length - 1; i++) {
        const va = parseFloat(sorted[i][attrIdx]);
        const vb = parseFloat(sorted[i + 1][attrIdx]);
        if (va === vb) continue;
        const mid = (va + vb) / 2;
        if (!candidates.includes(mid)) candidates.push(mid);
      }
    }

    if (candidates.length === 0) {
      return { gain: 0, gainRatio: 0, splitInfo: 0, threshold: null, groups: null, parentH, weightedH: parentH };
    }

    for (const t of candidates) {
      const r = this._evalThreshold(rows, attrIdx, classIdx, t, parentH, total);
      const score = criterion === 'gain_ratio' ? r.gainRatio : r.gain;
      if (score > bestScore) {
        bestScore = score;
        bestGain = r.gain;
        bestGainRatio = r.gainRatio;
        bestThreshold = t;
        bestGroups = r.groups;
        bestSplitInfo = r.splitInfo;
      }
    }
    return { gain: bestGain, gainRatio: bestGainRatio, splitInfo: bestSplitInfo, threshold: bestThreshold, groups: bestGroups, parentH, weightedH: parentH - bestGain, candidates };
  }

  _evalThreshold(rows, attrIdx, classIdx, threshold, parentH, total) {
    const left = rows.filter(r => parseFloat(r[attrIdx]) <= threshold).map(r => r[classIdx]);
    const right = rows.filter(r => parseFloat(r[attrIdx]) > threshold).map(r => r[classIdx]);
    const nL = left.length, nR = right.length;
    if (nL === 0 || nR === 0) return { gain: 0, gainRatio: 0, splitInfo: 0, groups: null };
    const fL = nL / total, fR = nR / total;
    const weightedH = fL * this._entropyFromLabels(left) + fR * this._entropyFromLabels(right);
    const gain = parentH - weightedH;
    let si = 0;
    if (fL > 0) si -= fL * Math.log2(fL);
    if (fR > 0) si -= fR * Math.log2(fR);
    const gainRatio = si === 0 ? 0 : gain / si;
    const fmt = n => parseFloat(n.toFixed(4)).toString();
    return { gain, gainRatio, splitInfo: si, groups: { [`≤${fmt(threshold)}`]: left, [`>${fmt(threshold)}`]: right }, weightedH };
  }

  _buildTree(trainRows, featCols, colTypes, headers, classCol, maxDepth, minSamples, numThreshold, criterion, onProgress) {
    let nodeCount = 0;
    const steps = [];
    const selfPlugin = this;

    function buildNode(rows, availFeat, depth, nodeName) {
      nodeCount++;
      if (nodeCount % 10 === 0) {
        onProgress('Tree Building', `Membangun pohon: Node #${nodeCount} | Kedalaman ${depth}`, Math.min(30 + nodeCount * 0.5, 75));
      }

      const labels = rows.map(r => r[classCol]);

      // Base cases
      if (rows.length <= minSamples || selfPlugin._isPure(labels) || availFeat.length === 0 || depth >= maxDepth) {
        const leafClass = selfPlugin._majorityClass(labels);
        const leafEntropy = selfPlugin._entropyFromLabels(labels);
        const freq = selfPlugin._classFreq(labels);
        const node = {
          type: 'leaf', label: leafClass, freq, entropy: leafEntropy, n: rows.length, depth, nodeName
        };
        steps.push({
          type: 'leaf', node, rows, labels, depth, nodeName,
          reason: selfPlugin._isPure(labels) ? 'murni' : (rows.length <= minSamples ? `sampel ≤ ${minSamples}` : (availFeat.length === 0 ? 'fitur habis' : 'kedalaman maks'))
        });
        return node;
      }

      const gains = [];
      for (const fi of availFeat) {
        const isNum = colTypes[fi] === 'num';
        let res;
        if (isNum) {
          res = selfPlugin._infoGainNum(rows, fi, classCol, numThreshold, criterion);
          gains.push({ fi, isNum: true, colName: headers[fi], ...res });
        } else {
          res = selfPlugin._infoGainCat(rows, fi, classCol);
          gains.push({ fi, isNum: false, colName: headers[fi], threshold: null, ...res });
        }
      }

      const avgGain = gains.reduce((s, g) => s + g.gain, 0) / gains.length;
      function score(g) {
        if (criterion !== 'gain_ratio') return g.gain;
        return g.gain >= avgGain ? g.gainRatio : -Infinity;
      }

      const best = gains.reduce((a, b) => {
        const sa = score(a), sb = score(b);
        if (Math.abs(sa - sb) < 1e-10) return a.colName <= b.colName ? a : b;
        return sa > sb ? a : b;
      });

      const parentH = selfPlugin._entropyFromLabels(labels);
      const node = {
        type: 'split', attr: best.fi, attrName: headers[best.fi],
        isNum: best.isNum, threshold: best.threshold,
        gain: best.gain, gainRatio: best.gainRatio, splitInfo: best.splitInfo,
        parentEntropy: parentH, n: rows.length, depth, nodeName,
        children: {}
      };

      steps.push({
        type: 'split', node, rows, labels, depth, nodeName, gains, best, parentH, avgGain
      });

      const nextFeat = best.isNum ? availFeat : availFeat.filter(f => f !== best.fi);
      const fmt = n => parseFloat(n.toFixed(4)).toString();

      if (best.isNum) {
        const lName = `≤${fmt(best.threshold)}`;
        const rName = `>${fmt(best.threshold)}`;
        const leftRows = rows.filter(r => parseFloat(r[best.fi]) <= best.threshold);
        const rightRows = rows.filter(r => parseFloat(r[best.fi]) > best.threshold);
        node.children[lName] = buildNode(leftRows, nextFeat, depth + 1, lName);
        node.children[rName] = buildNode(rightRows, nextFeat, depth + 1, rName);
      } else {
        const vals = [...new Set(rows.map(r => r[best.fi]))].sort();
        for (const val of vals) {
          const subset = rows.filter(r => r[best.fi] === val);
          if (subset.length === 0) continue;
          node.children[val] = buildNode(subset, nextFeat, depth + 1, val);
        }
      }

      if (Object.keys(node.children).length === 0) {
        const leafFallback = {
          type: 'leaf', label: selfPlugin._majorityClass(labels), freq: selfPlugin._classFreq(labels),
          entropy: parentH, n: rows.length, depth, nodeName
        };
        return leafFallback;
      }

      return node;
    }

    const tree = buildNode(trainRows, featCols, 0, 'Root');
    return { tree, steps, nodeCount };
  }

  _predict(node, row) {
    if (node.type === 'leaf') return node.label;
    const val = row[node.attr];
    const fmt = n => parseFloat(n.toFixed(4)).toString();

    if (node.isNum) {
      const branch = parseFloat(val) <= node.threshold
        ? `≤${fmt(node.threshold)}`
        : `>${fmt(node.threshold)}`;
      const child = node.children[branch];
      return child ? this._predict(child, row) : this._majoritySubtree(node);
    }
    const child = node.children[val];
    return child ? this._predict(child, row) : this._majoritySubtree(node);
  }

  _majoritySubtree(node) {
    const labels = [];
    const selfPlugin = this;
    function collect(n) {
      if (n.type === 'leaf') {
        for (let i = 0; i < n.n; i++) labels.push(n.label);
        return;
      }
      Object.values(n.children).forEach(collect);
    }
    collect(node);
    return labels.length > 0 ? selfPlugin._majorityClass(labels) : '?';
  }
}

// Registrasi plugin ke registry
if (typeof registry !== 'undefined') {
  registry.register(new C45Plugin());
}
