/* ================================================================
   EXPORT EXCEL — disesuaikan dengan pipeline baru nb_core.js
   Struktur sheet:
     Data Training  : baris yang dipakai untuk training
     Data Testing   : baris yang dipakai untuk evaluasi
     Perhitungan    : Step 1 (Prior) + Step 2 (Likelihood) + Step 3 (Posterior contoh)
     Prediksi       : prediksi seluruh test set + ringkasan akurasi
     Evaluasi       : Confusion Matrix + Precision/Recall/F1 + Macro Avg

   Mode 'plain'  : semua nilai plain (angka/teks) — cepat, aman dataset besar
   Mode 'formula': formula Excel aktif merujuk ke sheet Data Training/Testing
================================================================ */
function exportExcel(mode) {
  if (!lastResult) { alert('Tidak ada hasil untuk diexport.'); return; }
  if (!mode) mode = 'plain';

  const btn = event && event.target;
  const origText = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '⏳ Menyiapkan...'; btn.disabled = true; }

  setTimeout(() => {
    _doExport(mode);
    if (btn) { btn.innerHTML = origText; btn.disabled = false; }
  }, 50);
}

function _doExport(mode) {
  if (!lastResult) return;
  mode = mode || 'plain';

  const {
    classes, featureCols, featureVals,
    total, nTrain, nTest, trainIdx, testIdx,
    data, exIdx, exRow, exPost, exPred,
    allPreds, correct, accuracy,
    classCol, classIdx, headers,
    csvDataRef, fiColIdx,
    metrics, confMat, macroP, macroR, macroF1,
    freqMap, classCounts, priors, likelihoods,
    binEdges, contCols, excludedCols
  } = lastResult;

  const fullData = csvDataRef || null;

  /* ----------------------------------------------------------------
     Helper: index (0-based) → huruf Excel
  ---------------------------------------------------------------- */
  function CL(idx) {
    let res = '', n = idx + 1;
    while (n > 0) {
      res = String.fromCharCode(64 + ((n - 1) % 26 + 1)) + res;
      n   = Math.floor((n - 1) / 26);
    }
    return res;
  }

  /* ----------------------------------------------------------------
     Helper: terapkan binning ke satu nilai (konsisten dengan nb_core)
  ---------------------------------------------------------------- */
  function applyBin(val, edges) {
    const n = parseFloat(val);
    if (isNaN(n) || !edges) return val;
    const nBins = edges.length - 1;
    for (let b = 0; b < nBins; b++) {
      if (n > edges[b] && n <= edges[b + 1]) return `bin_${b}`;
    }
    return n <= edges[0] ? 'bin_0' : `bin_${nBins - 1}`;
  }

  /* ----------------------------------------------------------------
     Susun data training dan testing dari csvData + idx
  ---------------------------------------------------------------- */
  const trainRows = trainIdx.map(i => fullData[i]);
  const testRows  = testIdx.map(i => fullData[i]);

  /* ----------------------------------------------------------------
     Peta kolom: headers[0]→A, headers[1]→B, ...
     Sheet Training : baris data mulai baris 2
     Sheet Testing  : baris data mulai baris 2
  ---------------------------------------------------------------- */
  const FL     = {};
  headers.forEach((h, i) => { FL[h] = CL(i); });
  const clsL   = FL[classCol];

  // D1/DN untuk sheet Training (dipakai formula mode)
  const D1_TR  = 2;
  const DN_TR  = nTrain + 1;
  // D1/DN untuk sheet Testing
  const D1_TE  = 2;
  const DN_TE  = nTest + 1;

  // Range kelas di sheet Training (untuk formula Prior/Likelihood)
  const classRangeTrain = `'Data Training'!$${clsL}$${D1_TR}:$${clsL}$${DN_TR}`;
  // Range kelas di sheet Testing (untuk formula Evaluasi)
  const classRangeTest  = `'Data Testing'!$${clsL}$${D1_TE}:$${clsL}$${DN_TE}`;

  /* ================================================================
     WORKBOOK BARU
  ================================================================ */
  const wb = XLSX.utils.book_new();

  /* ================================================================
     SHEET: Data Training
     Isi: baris training sesuai trainIdx, semua kolom header asli
  ================================================================ */
  const trainSheetRows = trainRows.map(r => {
    const row = {};
    headers.forEach((h, i) => { row[h] = r[i]; });
    return row;
  });
  const wsTrain = XLSX.utils.json_to_sheet(trainSheetRows, { header: headers });
  XLSX.utils.book_append_sheet(wb, wsTrain, 'Data Training');

  /* ================================================================
     SHEET: Data Testing
     Isi: baris testing sesuai testIdx, semua kolom header asli
  ================================================================ */
  const testSheetRows = testRows.map(r => {
    const row = {};
    headers.forEach((h, i) => { row[h] = r[i]; });
    return row;
  });
  const wsTest = XLSX.utils.json_to_sheet(testSheetRows, { header: headers });
  XLSX.utils.book_append_sheet(wb, wsTest, 'Data Testing');

  /* ================================================================
     SHEET: Perhitungan, Prediksi, Evaluasi — dispatch mode
  ================================================================ */
  if (mode === 'formula') {
    _buildSheetsFormula(wb, lastResult, CL, FL, clsL,
      D1_TR, DN_TR, D1_TE, DN_TE,
      classRangeTrain, classRangeTest,
      trainRows, testRows, applyBin);
  } else {
    _buildSheetsPlain(wb, lastResult, CL, FL, clsL,
      D1_TR, DN_TR, D1_TE, DN_TE,
      classRangeTrain, classRangeTest,
      trainRows, testRows, applyBin);
  }

  const suffix = mode === 'formula' ? '_formula' : '_plain';
  XLSX.writeFile(wb, `hasil_naive_bayes${suffix}.xlsx`);
}

/* ================================================================
   MODE PLAIN VALUE
   Sheet: Perhitungan | Prediksi | Evaluasi
   Semua kalkulasi di JS, ditulis sebagai angka/teks murni.
================================================================ */
function _buildSheetsPlain(wb, d, CL, FL, clsL,
    D1_TR, DN_TR, D1_TE, DN_TE,
    classRangeTrain, classRangeTest,
    trainRows, testRows, applyBin) {

  const {
    classes, featureCols, featureVals,
    nTrain, nTest,
    data, exIdx, exRow, exPost, exPred,
    allPreds, correct, accuracy,
    classCol, classIdx,
    freqMap, classCounts, priors, likelihoods,
    metrics, confMat, macroP, macroR, macroF1,
    fiColIdx, binEdges, contCols
  } = d;

  /* ================================================================
     SHEET PERHITUNGAN — Step 1, 2, 3
  ================================================================ */
  const aoa   = [];
  let R       = 0;
  const push  = row => { aoa.push(row); R++; };
  const empty = ()  => { aoa.push([]);  R++; };

  /* INFO SPLIT & DISKRITISASI */
  push(['=== INFO PIPELINE ===']);
  push(['Total Data',    nTrain + nTest]);
  push(['Data Training', nTrain, `${(nTrain/(nTrain+nTest)*100).toFixed(1)}%`]);
  push(['Data Testing',  nTest,  `${(nTest/(nTrain+nTest)*100).toFixed(1)}%`]);
  push(['Metode Split',  'Stratified (proporsi kelas dijaga)']);
  empty();
  if (contCols && contCols.length > 0) {
    push(['=== DISKRITISASI KOLOM NUMERIK ===']);
    push(['Kolom', 'Jumlah Bin', 'Bin Edges (dari data training)']);
    contCols.forEach(feat => {
      const edges = binEdges[feat];
      push([feat, edges ? edges.length - 1 : '-',
        edges ? edges.map(e => parseFloat(e.toFixed(4))).join(' | ') : '-']);
    });
    empty();
  }

  /* STEP 1: PRIOR — dihitung dari data training */
  push(['=== STEP 1: PROBABILITAS PRIOR P(C) ===']);
  push(['[Dihitung dari data training saja]']);
  push(['Kelas', 'Jumlah Data (Train)', 'Total Train', 'P(C)', 'Rumus']);
  classes.forEach(c => {
    const cnt = classCounts[c];
    const p   = priors[c];
    push([`P(${c})`, cnt, nTrain, parseFloat(p.toFixed(6)), `${cnt} / ${nTrain} = ${p.toFixed(6)}`]);
  });
  empty();

  /* STEP 2: LIKELIHOOD */
  push(['=== STEP 2: LIKELIHOOD P(xi|C) — Laplace Smoothing ===']);
  push(['Rumus: P(xi|C) = (count(xi & C) + 1) / (count(C) + k)  |  [dari data training]']);
  empty();
  const colWidth = 1 + classes.length * 2 + 1 + 1 + 1;
  const maxVals  = Math.max(...featureCols.map(f => featureVals[f].length));

  const headerRow = [];
  featureCols.forEach(feat => {
    const vals = featureVals[feat];
    const isBin = binEdges && binEdges[feat];
    headerRow.push(
      `Fitur: ${feat}${isBin ? ' [bin]' : ''}`,
      ...classes.map(c => `Hitung(${feat}=xi|${c})`),
      ...classes.map(c => `P(${feat}|${c})`),
      `Nilai Unik (k=${vals.length})`,
      'Rumus Laplace',
      ''
    );
  });
  push(headerRow);

  for (let vi = 0; vi < maxVals; vi++) {
    const row = [];
    featureCols.forEach(feat => {
      const vals = featureVals[feat];
      const v    = vals[vi];
      if (v === undefined) {
        for (let x = 0; x < colWidth; x++) row.push('');
      } else {
        const k = vals.length;
        row.push(v);
        classes.forEach(c => { row.push((freqMap[feat][c] && freqMap[feat][c][v]) || 0); });
        classes.forEach(c => {
          const cnt = (freqMap[feat][c] && freqMap[feat][c][v]) || 0;
          const nC  = classCounts[c];
          row.push(parseFloat(((cnt + 1) / (nC + k)).toFixed(6)));
        });
        row.push(k);
        const c0   = classes[0];
        const cnt0 = (freqMap[feat][c0] && freqMap[feat][c0][v]) || 0;
        row.push(`(${cnt0}+1)/(${classCounts[c0]}+${k})`);
        row.push('');
      }
    });
    push(row);
  }
  empty();

  /* STEP 3: POSTERIOR contoh */
  push(['=== STEP 3: POSTERIOR — Contoh Klasifikasi (Baris Terakhir Test Set) ===']);
  push([`Data Testing:`,
    ...featureCols.map((f, i) => `${f}=${exRow.features[i]}`),
    `Label Asli: ${exRow.label}`]);
  empty();
  const postRaw = {}, postNorm = {};
  let postSum = 0;
  classes.forEach(c => { postRaw[c] = exPost[c]; postSum += exPost[c]; });
  classes.forEach(c => { postNorm[c] = postRaw[c] / postSum; });
  push(['Kelas', 'P(C)', 'Likelihood P(X|C)', 'P(C|X) raw', 'Normalisasi', 'Persen (%)', 'Prediksi?']);
  classes.forEach(c => {
    let likeProduct = 1;
    featureCols.forEach((feat, fi) => {
      const v  = exRow.features[fi];
      const lk = likelihoods[feat][c][v];
      likeProduct *= lk !== undefined ? lk : 1 / (classCounts[c] + featureVals[feat].length);
    });
    push([c, parseFloat(priors[c].toFixed(6)), parseFloat(likeProduct.toFixed(8)),
      parseFloat(postRaw[c].toFixed(10)), parseFloat(postNorm[c].toFixed(6)),
      parseFloat((postNorm[c]*100).toFixed(4)), c === exPred ? `<- Prediksi: ${c}` : '']);
  });
  empty();
  push(['Hasil Prediksi', exPred, '', '', '', '', '']);
  push(['Label Asli',     exRow.label, '', '', '', '', '']);
  push(['Benar/Salah',    exPred === exRow.label ? 'BENAR' : 'SALAH', '', '', '', '', '']);

  const ws2 = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws2, 'Perhitungan');

  /* ================================================================
     SHEET PREDIKSI — seluruh test set
  ================================================================ */
  const aoaPred = [];
  const pushP   = row => aoaPred.push(row);
  const emptyP  = ()  => aoaPred.push([]);

  pushP(['=== PREDIKSI — Seluruh Data Testing ===']);
  pushP([`[${nTest} baris test set | Akurasi: ${accuracy}%]`]);
  pushP(['#', ...featureCols, classCol, 'Prediksi', 'Status']);

  data.forEach((row, i) => {
    const pred = (allPreds[i] || {}).pred || '';
    pushP([i + 1, ...row.features, row.label, pred, pred === row.label ? 'Benar' : 'Salah']);
  });
  emptyP();
  pushP(['Jumlah Benar', '', '', correct]);
  pushP(['Jumlah Salah', '', '', nTest - correct]);
  pushP(['Total Test',   '', '', nTest]);
  pushP(['Akurasi (%)',  '', '', parseFloat((correct / nTest * 100).toFixed(4))]);

  const wsPred = XLSX.utils.aoa_to_sheet(aoaPred);
  XLSX.utils.book_append_sheet(wb, wsPred, 'Prediksi');

  /* ================================================================
     SHEET EVALUASI — Confusion Matrix + Precision/Recall/F1
  ================================================================ */
  const aoaEval = [];
  const pushE   = row => aoaEval.push(row);
  const emptyE  = ()  => aoaEval.push([]);

  pushE(['=== CONFUSION MATRIX ===']);
  pushE(['[Dievaluasi dari data testing saja]']);
  pushE(['Aktual \\ Prediksi', ...classes]);
  classes.forEach(actual => {
    pushE([actual, ...classes.map(pred => confMat[actual][pred])]);
  });
  emptyE();
  pushE(['=== PRECISION / RECALL / F1-SCORE ===']);
  pushE(['Kelas', 'TP', 'FP', 'FN', 'Precision (%)', 'Recall (%)', 'F1-Score (%)']);
  classes.forEach(c => {
    const m = metrics[c];
    pushE([c, m.tp, m.fp, m.fn,
      parseFloat((m.precision * 100).toFixed(4)),
      parseFloat((m.recall    * 100).toFixed(4)),
      parseFloat((m.f1        * 100).toFixed(4))]);
  });
  pushE(['Macro Avg', '', '', '',
    parseFloat((macroP  * 100).toFixed(4)),
    parseFloat((macroR  * 100).toFixed(4)),
    parseFloat((macroF1 * 100).toFixed(4))]);

  const wsEval = XLSX.utils.aoa_to_sheet(aoaEval);
  XLSX.utils.book_append_sheet(wb, wsEval, 'Evaluasi');
}

/* ================================================================
   MODE FORMULA EXCEL
   Arsitektur sheet:
     Data Training  : data training (nama statis, dirujuk formula)
     Data Testing   : data testing  (nama statis, dirujuk formula)
     Posterior      : helper — P(C|X) per baris test set
     Perhitungan    : Step 1-3 dengan formula merujuk Data Training
     Prediksi       : Step 4 formula merujuk Posterior + Data Testing
     Evaluasi       : COUNTIFS merujuk Prediksi + Data Testing
================================================================ */
function _buildSheetsFormula(wb, d, CL, FL, clsL,
    D1_TR, DN_TR, D1_TE, DN_TE,
    classRangeTrain, classRangeTest,
    trainRows, testRows, applyBin) {

  const {
    classes, featureCols, featureVals,
    nTrain, nTest,
    data, exIdx, exRow, exPost, exPred,
    classCol, classIdx, headers,
    freqMap, classCounts, priors, likelihoods,
    metrics, confMat, macroP, macroR, macroF1,
    fiColIdx, binEdges, contCols
  } = d;

  const F = formula => ({ f: formula });

  /* ----------------------------------------------------------------
     Helper: tulis aoa ke worksheet secara manual agar { f } diproses
  ---------------------------------------------------------------- */
  function _aoaToWs(aoa) {
    const ws = {};
    let maxC = 0;
    aoa.forEach((row, ri) => {
      row.forEach((val, ci) => {
        if (ci > maxC) maxC = ci;
        const addr = XLSX.utils.encode_cell({ r: ri, c: ci });
        if (val === null || val === undefined || val === '') return;
        if (typeof val === 'object' && val !== null && 'f' in val) {
          ws[addr] = { t: 'n', f: val.f };
        } else if (typeof val === 'number') {
          ws[addr] = { t: 'n', v: val };
        } else {
          ws[addr] = { t: 's', v: String(val) };
        }
      });
    });
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: maxC } });
    return ws;
  }

  const classArray = `{"${classes.join('","')}"}`;

  /* ================================================================
     SHEET: Posterior (helper)
     Satu kolom per kelas, satu baris per baris data TESTING.
     Formula merujuk ke 'Data Training' dan 'Data Testing'.
  ================================================================ */
  const postAoa  = [];
  const postName = 'Posterior';

  postAoa.push(['Baris#', ...classes.map(c => `Post_${c}`)]);

  for (let i = 0; i < nTest; i++) {
    const teRow = D1_TE + i;   // baris di sheet Data Testing
    const row   = [i + 1];
    classes.forEach(c => {
      const priorF = `COUNTIF(${classRangeTrain},"${c}")/COUNTA(${classRangeTrain})`;
      const likeFs = featureCols.map(feat => {
        const featL      = FL[feat];
        const featRangeTR = `'Data Training'!$${featL}$${D1_TR}:$${featL}$${DN_TR}`;
        const k           = featureVals[feat].length;
        return `(COUNTIFS(${featRangeTR},'Data Testing'!${featL}${teRow},${classRangeTrain},"${c}")+1)/(COUNTIF(${classRangeTrain},"${c}")+${k})`;
      });
      row.push(F(`(${priorF})*` + likeFs.join('*')));
    });
    postAoa.push(row);
  }

  XLSX.utils.book_append_sheet(wb, _aoaToWs(postAoa), postName);

  // Peta kelas → huruf kolom di Posterior (A=Baris#, B=kelas[0], ...)
  const postColL = {};
  classes.forEach((c, ci) => { postColL[c] = CL(ci + 1); });

  /* ================================================================
     SHEET: Perhitungan — Step 1, 2, 3
     Formula merujuk ke 'Data Training'
  ================================================================ */
  const aoa   = [];
  let R       = 0;
  const push  = row => { aoa.push(row); R++; };
  const empty = ()  => { aoa.push([]);  R++; };
  const eR    = ()  => R + 1;

  /* INFO SPLIT */
  push(['=== INFO PIPELINE ===']);
  push(['Total Data',    nTrain + nTest]);
  push(['Data Training', nTrain, `${(nTrain/(nTrain+nTest)*100).toFixed(1)}%`]);
  push(['Data Testing',  nTest,  `${(nTest/(nTrain+nTest)*100).toFixed(1)}%`]);
  push(['Metode Split',  'Stratified (proporsi kelas dijaga)']);
  empty();
  if (contCols && contCols.length > 0) {
    push(['=== DISKRITISASI KOLOM NUMERIK ===']);
    push(['Kolom', 'Jumlah Bin', 'Bin Edges (dari data training)']);
    contCols.forEach(feat => {
      const edges = binEdges[feat];
      push([feat, edges ? edges.length - 1 : '-',
        edges ? edges.map(e => parseFloat(e.toFixed(4))).join(' | ') : '-']);
    });
    empty();
  }

  /* STEP 1: PRIOR */
  push(['=== STEP 1: PROBABILITAS PRIOR P(C) ===']);
  push(['[Dihitung dari Data Training]']);
  push(['Kelas', 'Jumlah (COUNTIF)', 'Total (COUNTA)', 'P(C)', 'Rumus teks']);
  push(['Total Training', F(`COUNTA(${classRangeTrain})`), '', '', '']);
  classes.forEach((c, ci) => {
    const r = eR();  // baris ke-5 dst (1=header info, +offset)
    push([
      `P(${c})`,
      F(`COUNTIF(${classRangeTrain},"${c}")`),
      F(`COUNTA(${classRangeTrain})`),
      F(`B${r}/C${r}`),
      `${classCounts[c]} / ${nTrain} = ${priors[c].toFixed(6)}`
    ]);
  });
  empty();

  /* STEP 2: LIKELIHOOD */
  push(['=== STEP 2: LIKELIHOOD P(xi|C) — Laplace Smoothing ===']);
  push(['Rumus: =(COUNTIFS(range_fitur_train,xi,range_kelas_train,C)+1)/(COUNTIF(range_kelas_train,C)+k)']);
  empty();

  const colWidthF = 1 + classes.length + 1 + 1 + 1;
  const maxValsF  = Math.max(...featureCols.map(f => featureVals[f].length));

  const headerRowF = [];
  featureCols.forEach(feat => {
    const isBin = binEdges && binEdges[feat];
    headerRowF.push(
      `Fitur: ${feat}${isBin ? ' [bin]' : ''}`,
      ...classes.map(c => `P(${feat}|${c})`),
      `k = ${featureVals[feat].length}`,
      'Rumus Laplace (contoh kelas 1)',
      ''
    );
  });
  push(headerRowF);

  for (let vi = 0; vi < maxValsF; vi++) {
    const row = [];
    featureCols.forEach(feat => {
      const vals       = featureVals[feat];
      const featL      = FL[feat];
      const featRangeTR = `'Data Training'!$${featL}$${D1_TR}:$${featL}$${DN_TR}`;
      const k          = vals.length;
      const v          = vals[vi];
      if (v === undefined) {
        for (let x = 0; x < colWidthF; x++) row.push('');
      } else {
        row.push(v);
        classes.forEach(c => {
          row.push(F(`(COUNTIFS(${featRangeTR},"${v}",${classRangeTrain},"${c}")+1)/(COUNTIF(${classRangeTrain},"${c}")+${k})`));
        });
        row.push(k);
        const cnt0 = (freqMap[feat][classes[0]] && freqMap[feat][classes[0]][v]) || 0;
        row.push(`(${cnt0}+1)/(${classCounts[classes[0]]}+${k})`);
        row.push('');
      }
    });
    push(row);
  }
  empty();

  /* STEP 3: POSTERIOR contoh */
  const postRaw = {}, postNorm = {};
  let postSum = 0;
  classes.forEach(c => { postRaw[c] = exPost[c]; postSum += exPost[c]; });
  classes.forEach(c => { postNorm[c] = postRaw[c] / postSum; });

  const postExRow = exIdx + 2;  // baris di Posterior (1=header, 2=data ke-0)
  push(['=== STEP 3: POSTERIOR — Contoh Klasifikasi (Baris Terakhir Test Set) ===']);
  push([`Data Testing (baris ${exIdx + 1}):`,
    ...featureCols.map(f => `${f}=${exRow.features[featureCols.indexOf(f)]}`),
    `Label Asli: ${exRow.label}`]);
  empty();
  push(['Kelas', 'P(C)', 'P(C|X) formula', 'P(C|X) raw (nilai)', 'Prediksi?']);

  classes.forEach(c => {
    push([
      c,
      F(`COUNTIF(${classRangeTrain},"${c}")/COUNTA(${classRangeTrain})`),
      F(`Posterior!${postColL[c]}${postExRow}`),
      parseFloat(postRaw[c].toFixed(10)),
      c === exPred ? `<- Prediksi: ${c}` : ''
    ]);
  });
  empty();

  const postExRefs   = classes.map(c => `Posterior!${postColL[c]}${postExRow}`);
  const postExRange  = postExRefs.join(',');
  const nEx          = classes.length;
  const chooseIdxsEx = Array.from({ length: nEx }, (_, i) => i + 1).join(',');
  push(['Hasil Prediksi',
    F(`INDEX(${classArray},MATCH(MAX(${postExRange}),CHOOSE({${chooseIdxsEx}},${postExRange}),0))`),
    '', '', '']);
  push(['Label Asli',  exRow.label,                              '', '', '']);
  push(['Benar/Salah', exPred === exRow.label ? 'BENAR' : 'SALAH', '', '', '']);

  XLSX.utils.book_append_sheet(wb, _aoaToWs(aoa), 'Perhitungan');

  /* ================================================================
     SHEET: Prediksi — seluruh test set, formula merujuk Posterior
  ================================================================ */
  const aoaPred  = [];
  let RP         = 0;
  const pushP    = row => { aoaPred.push(row); RP++; };
  const emptyP   = ()  => { aoaPred.push([]);  RP++; };
  const eRP      = ()  => RP + 1;

  // Layout kolom: A=# | B..=fitur | =kelas | =Prediksi | =Status
  const predColIdx = featureCols.length + 2;
  const statColIdx = featureCols.length + 3;
  const predColLP  = CL(predColIdx);
  const statColLP  = CL(statColIdx);

  pushP(['=== PREDIKSI — Seluruh Data Testing ===']);
  pushP(['[Mode Formula: merujuk sheet Posterior & Data Testing]']);
  pushP([`⚠ Dataset besar (${nTest} baris test) — pertimbangkan mode Plain agar Excel tidak lambat.`]);
  emptyP();
  pushP(['#', ...featureCols, classCol, 'Prediksi (formula)', 'Status']);
  const dataStartRP = eRP();

  for (let i = 0; i < nTest; i++) {
    const teRow    = D1_TE + i;   // baris di Data Testing
    const postRow  = i + 2;       // baris di Posterior
    const calcRow  = eRP();

    const postCellRefs = classes.map(c => `Posterior!${postColL[c]}${postRow}`);
    const postRangeArr = postCellRefs.join(',');
    const n            = classes.length;
    const chooseIdxs   = Array.from({ length: n }, (_, j) => j + 1).join(',');
    const predF = `INDEX(${classArray},MATCH(MAX(${postRangeArr}),CHOOSE({${chooseIdxs}},${postRangeArr}),0))`;
    const statF = `IF(${predColLP}${calcRow}='Data Testing'!${FL[classCol]}${teRow},"Benar","Salah")`;

    pushP([
      i + 1,
      ...featureCols.map(feat => F(`'Data Testing'!${FL[feat]}${teRow}`)),
      F(`'Data Testing'!${FL[classCol]}${teRow}`),
      F(predF),
      F(statF)
    ]);
  }

  emptyP();
  const dataEndRP = eRP() - 2;

  pushP(['Jumlah Benar', '', '', F(`COUNTIF(${statColLP}${dataStartRP}:${statColLP}${dataEndRP},"Benar")`)]);
  pushP(['Jumlah Salah', '', '', F(`COUNTIF(${statColLP}${dataStartRP}:${statColLP}${dataEndRP},"Salah")`)]);
  pushP(['Total Test',   '', '', nTest]);
  pushP(['Akurasi (%)',  '', '', F(`COUNTIF(${statColLP}${dataStartRP}:${statColLP}${dataEndRP},"Benar")/${nTest}*100`)]);

  XLSX.utils.book_append_sheet(wb, _aoaToWs(aoaPred), 'Prediksi');

  /* ================================================================
     SHEET: Evaluasi — COUNTIFS merujuk Prediksi + Data Testing
  ================================================================ */
  const aoaEval = [];
  let RE        = 0;
  const pushE   = row => { aoaEval.push(row); RE++; };
  const emptyE  = ()  => { aoaEval.push([]);  RE++; };
  const eRE     = ()  => RE + 1;

  // Range kolom Prediksi di sheet Prediksi
  const predRangeEval  = `Prediksi!$${predColLP}$${dataStartRP}:$${predColLP}$${dataEndRP}`;
  // Range kolom label di sheet Data Testing
  const labelRangeEval = `'Data Testing'!$${clsL}$${D1_TE}:$${clsL}$${DN_TE}`;

  /* Confusion Matrix */
  pushE(['=== CONFUSION MATRIX ===']);
  pushE(['[Dievaluasi dari data testing saja]']);
  pushE(['Aktual \\ Prediksi', ...classes]);
  classes.forEach(actual => {
    pushE([
      actual,
      ...classes.map(pred =>
        F(`COUNTIFS(${predRangeEval},"${pred}",${labelRangeEval},"${actual}")`)
      )
    ]);
  });
  emptyE();

  /* Precision / Recall / F1 */
  pushE(['=== PRECISION / RECALL / F1-SCORE ===']);
  pushE(['Kelas', 'TP', 'FP', 'FN', 'Precision (%)', 'Recall (%)', 'F1-Score (%)']);
  const evalDataStart = eRE();

  classes.forEach(c => {
    const r   = eRE();
    const tpF = `COUNTIFS(${predRangeEval},"${c}",${labelRangeEval},"${c}")`;
    const fpF = `COUNTIFS(${predRangeEval},"${c}",${labelRangeEval},"<>${c}")`;
    const fnF = `COUNTIFS(${predRangeEval},"<>${c}",${labelRangeEval},"${c}")`;
    const prF = `IF(B${r}+C${r}>0,B${r}/(B${r}+C${r})*100,0)`;
    const rcF = `IF(B${r}+D${r}>0,B${r}/(B${r}+D${r})*100,0)`;
    const f1F = `IF(E${r}+F${r}>0,2*E${r}*F${r}/(E${r}+F${r}),0)`;
    pushE([c, F(tpF), F(fpF), F(fnF), F(prF), F(rcF), F(f1F)]);
  });

  const evalDataEnd = eRE() - 1;
  pushE([
    'Macro Avg', '', '', '',
    F(`AVERAGE(E${evalDataStart}:E${evalDataEnd})`),
    F(`AVERAGE(F${evalDataStart}:F${evalDataEnd})`),
    F(`AVERAGE(G${evalDataStart}:G${evalDataEnd})`)
  ]);

  XLSX.utils.book_append_sheet(wb, _aoaToWs(aoaEval), 'Evaluasi');
}