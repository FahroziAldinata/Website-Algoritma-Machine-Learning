// ============================================================
//  js/LinearRegression/lr_export.js
//  Dua mode export:
//    exportPlainText() — semua nilai teks/angka langsung
//    exportFormula()   — nilai dari formula Excel (verifiable)
//
//  Struktur sheet (keduanya sama):
//    Sheet 1 : Dataset            — data mentah + label TRAIN/TEST
//    Sheet 1b: Dataset Normalisasi — statistik deskriptif tiap kolom
//    Sheet 2 : Perhitungan        — langkah kalkulasi koefisien
//    Sheet 3 : Prediksi           — ŷ, aktual, residual semua baris
//    Sheet 4 : Evaluasi Metrik    — R², MSE, RMSE, MAE (train & test)
// ============================================================

// ── Cek SheetJS ───────────────────────────────────────────────
function _xlsxReady() {
  if (typeof XLSX === 'undefined') {
    alert('SheetJS belum dimuat. Pastikan script xlsx.full.min.js di-include.');
    return false;
  }
  return true;
}

// ============================================================
//  EXPORT 1 — Plain Text (nilai langsung, tanpa formula)
// ============================================================
function exportPlainText(model, trainRows, testRows) {
  if (!_xlsxReady()) return;
  const wb = XLSX.utils.book_new();

  _sheetDataset(wb, model, trainRows, testRows);          // Sheet 1
  _sheetNormalisasi(wb, model, trainRows, testRows);      // Sheet 1b
  _sheetCalcPlain(wb, model, trainRows);                  // Sheet 2
  _sheetPrediksiPlain(wb, model, trainRows, testRows);    // Sheet 3
  _sheetEvaluasiPlain(wb, model, trainRows, testRows);    // Sheet 4

  const fname = `LR_PlainText_${model.target}.xlsx`;
  XLSX.writeFile(wb, fname);
}

// ============================================================
//  EXPORT 2 — Formula Excel (nilai dari formula, verifiable)
// ============================================================
function exportFormula(model, trainRows, testRows) {
  if (!_xlsxReady()) return;
  const wb = XLSX.utils.book_new();

  _sheetDataset(wb, model, trainRows, testRows);          // Sheet 1 (sama)
  _sheetNormalisasi(wb, model, trainRows, testRows);      // Sheet 1b (sama)
  _sheetCalcFormula(wb, model, trainRows);                // Sheet 2 — pakai formula
  _sheetPrediksiFormula(wb, model, trainRows, testRows);  // Sheet 3 — pakai formula
  _sheetEvaluasiFormula(wb, model, trainRows, testRows);  // Sheet 4 — pakai formula

  const fname = `LR_Formula_${model.target}.xlsx`;
  XLSX.writeFile(wb, fname);
}

// ============================================================
//  SHEET 1 — Dataset (plain, sama untuk kedua export)
// ============================================================
function _sheetDataset(wb, model, trainRows, testRows) {
  const allCols = [...model.feats, model.target];

  const header = ['#', 'Set', ...allCols];
  const aoa    = [
    [`Dataset — ${model.feats.join(', ')} → ${model.target}`],
    [],
    header,
  ];

  trainRows.forEach((r, i) => {
    aoa.push([i + 1, 'TRAIN', ...allCols.map(c => r[c])]);
  });
  testRows.forEach((r, i) => {
    aoa.push([trainRows.length + i + 1, 'TEST', ...allCols.map(c => r[c])]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 5 }, { wch: 7 }, ...allCols.map(c => ({ wch: Math.max(c.length + 2, 12) }))];
  XLSX.utils.book_append_sheet(wb, ws, 'Dataset');
}

// ============================================================
//  SHEET 1b — Dataset Normalisasi (statistik deskriptif)
// ============================================================
function _sheetNormalisasi(wb, model, trainRows, testRows) {
  const allRows = [...trainRows, ...testRows];
  const allCols = [...model.feats, model.target];

  const aoa = [
    ['Dataset Normalisasi — Statistik Deskriptif'],
    [],
    ['Kolom', 'Min', 'Max', 'Mean', 'Std Dev', 'Median', 'Jumlah Data'],
  ];

  allCols.forEach(col => {
    const vals = allRows.map(r => r[col]).filter(v => v != null && !isNaN(v));
    const n    = vals.length;
    if (n === 0) { aoa.push([col, '-', '-', '-', '-', '-', 0]); return; }

    const sorted = [...vals].sort((a, b) => a - b);
    const mn     = sorted[0];
    const mx     = sorted[n - 1];
    const mu     = vals.reduce((s, v) => s + v, 0) / n;
    const sigma  = Math.sqrt(vals.reduce((s, v) => s + (v - mu) ** 2, 0) / n);
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    aoa.push([col, mn, mx, mu, sigma, median, n]);
  });

  aoa.push([]);
  aoa.push(['Keterangan']);
  aoa.push(['Min', 'Nilai terkecil']);
  aoa.push(['Max', 'Nilai terbesar']);
  aoa.push(['Mean', 'Rata-rata']);
  aoa.push(['Std Dev', 'Standar deviasi populasi']);
  aoa.push(['Median', 'Nilai tengah']);
  aoa.push(['Jumlah Data', 'Total baris yang valid (train + test)']);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Dataset Normalisasi');
}

// ============================================================
//  SHEET 2 PLAIN — Perhitungan (nilai langsung)
// ============================================================
function _sheetCalcPlain(wb, model, trainRows) {
  const aoa = [];
  const n   = trainRows.length;

  if (model.mode === 'simple') {
    const feat = model.feats[0];
    const tgt  = model.target;
    const xMean = model.xMean;
    const yMean = model.yMean;

    aoa.push([`Perhitungan — Regresi Sederhana: ${feat} → ${tgt}`]);
    aoa.push(['[Plain Text — nilai langsung]']);
    aoa.push([]);
    aoa.push(['x̄ (mean X)', xMean, '', 'ȳ (mean Y)', yMean]);
    aoa.push([]);
    aoa.push(['#', `x (${feat})`, `y (${tgt})`, 'x − x̄', 'y − ȳ', '(x−x̄)²', '(x−x̄)(y−ȳ)', 'ŷ', 'e = y−ŷ', 'e²']);

    trainRows.forEach((r, i) => {
      const x    = r[feat];
      const y    = r[tgt];
      const xDev = x - xMean;
      const yDev = y - yMean;
      const yHat = model.intercept + model.slope * x;
      const resid = y - yHat;
      aoa.push([i + 1, x, y, xDev, yDev, xDev ** 2, xDev * yDev, yHat, resid, resid ** 2]);
    });

    const totSxx  = trainRows.reduce((s, r) => s + (r[feat] - xMean) ** 2, 0);
    const totSxy  = trainRows.reduce((s, r) => s + (r[feat] - xMean) * (r[tgt] - yMean), 0);
    const totResidSq = trainRows.reduce((s, r) => {
      const e = r[tgt] - (model.intercept + model.slope * r[feat]);
      return s + e ** 2;
    }, 0);

    aoa.push(['TOTAL', '', '', '', '', totSxx, totSxy, '', '', totResidSq]);
    aoa.push([]);
    aoa.push(['--- Ringkasan Koefisien ---']);
    aoa.push(['Σ(x−x̄)²',          totSxx]);
    aoa.push(['Σ(x−x̄)(y−ȳ)',      totSxy]);
    aoa.push(['b (slope)',           model.slope,     '= Σ(x−x̄)(y−ȳ) / Σ(x−x̄)²']);
    aoa.push(['a (intercept)',       model.intercept, '= ȳ − b × x̄']);
    aoa.push(['Persamaan',           equationString(model)]);
    aoa.push(['Regularisasi',        model.reg.toUpperCase() + (model.reg !== 'none' ? ` (λ=${model.lambda})` : '')]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      {wch:5},{wch:14},{wch:14},{wch:12},{wch:12},{wch:14},{wch:16},{wch:14},{wch:14},{wch:12}
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Perhitungan');

  } else {
    // ── Berganda ──
    aoa.push([`Perhitungan — Regresi Berganda: ${model.feats.join(', ')} → ${model.target}`]);
    aoa.push(['[Plain Text — nilai langsung]']);
    aoa.push([]);
    aoa.push(['--- Koefisien (Normal Equation β = (XᵀX)⁻¹ Xᵀy) ---']);
    aoa.push(['Parameter', 'Nilai', 'Keterangan']);
    aoa.push(['Intercept (a)', model.intercept, 'β₀']);
    model.feats.forEach((f, j) => aoa.push([`b${j+1} (${f})`, model.slopes[j], `Koefisien fitur ${f}`]));
    aoa.push([]);
    aoa.push(['Persamaan', equationString(model)]);
    aoa.push(['Regularisasi', model.reg.toUpperCase() + (model.reg !== 'none' ? ` (λ=${model.lambda})` : '')]);
    aoa.push([]);
    aoa.push(['--- Tabel Prediksi Train ---']);
    const hdr = ['#', `y (${model.target})`, 'ŷ (prediksi)', 'e = y−ŷ', 'e²', ...model.feats];
    aoa.push(hdr);
    trainRows.forEach((r, i) => {
      const yHat = predictLR(model, r);
      const resid = r[model.target] - yHat;
      aoa.push([i + 1, r[model.target], yHat, resid, resid ** 2, ...model.feats.map(f => r[f])]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{wch:5},{wch:14},{wch:14},{wch:14},{wch:12},...model.feats.map(f=>({wch:Math.max(f.length+2,12)}))];
    XLSX.utils.book_append_sheet(wb, ws, 'Perhitungan');
  }
}

// ============================================================
//  SHEET 2 FORMULA — Perhitungan (formula Excel)
// ============================================================
function _sheetCalcFormula(wb, model, trainRows) {
  const aoa = [];
  const n   = trainRows.length;

  if (model.mode === 'simple') {
    const feat = model.feats[0];
    const tgt  = model.target;
    // Layout kolom: A=#, B=x, C=y, D=x-xBar, E=y-yBar, F=(x-xBar)^2, G=(x-xBar)(y-yBar), H=yHat, I=resid, J=resid^2
    // Data baris 5..5+n-1 (baris 1=judul, 2=mode, 3=kosong, 4=header)
    const dataR1 = 5;
    const dataRN = dataR1 + n - 1;

    aoa.push([`Perhitungan — Regresi Sederhana: ${feat} → ${tgt}`]);
    aoa.push(['[Formula Excel — nilai dihitung oleh spreadsheet]']);
    aoa.push([]);
    aoa.push(['#', `x (${feat})`, `y (${tgt})`, 'x − x̄', 'y − ȳ', '(x−x̄)²', '(x−x̄)(y−ȳ)', 'ŷ', 'e = y−ŷ', 'e²']);

    // Baris data dengan formula
    trainRows.forEach((r, i) => {
      const rowNum = dataR1 + i;
      aoa.push([
        i + 1,
        r[feat],     // B: nilai x langsung (sumber data)
        r[tgt],      // C: nilai y langsung (sumber data)
        { f: `B${rowNum}-AVERAGE($B$${dataR1}:$B$${dataRN})` },   // D: x − x̄
        { f: `C${rowNum}-AVERAGE($C$${dataR1}:$C$${dataRN})` },   // E: y − ȳ
        { f: `D${rowNum}^2` },                                     // F: (x−x̄)²
        { f: `D${rowNum}*E${rowNum}` },                            // G: (x−x̄)(y−ȳ)
        { f: `$B$${dataRN+4}+$B$${dataRN+3}*B${rowNum}` },       // H: ŷ = a + b*x  (ref ke ringkasan)
        { f: `C${rowNum}-H${rowNum}` },                            // I: e = y − ŷ
        { f: `I${rowNum}^2` },                                     // J: e²
      ]);
    });

    // Baris total
    aoa.push([
      'TOTAL', '', '',
      '', '',
      { f: `SUM(F${dataR1}:F${dataRN})` },
      { f: `SUM(G${dataR1}:G${dataRN})` },
      '', '',
      { f: `SUM(J${dataR1}:J${dataRN})` },
    ]);
    aoa.push([]);

    // Ringkasan koefisien — formula mengacu ke data di atas
    const sumRow  = dataRN + 1;  // baris TOTAL
    const ringSt  = dataRN + 2;  // mulai ringkasan
    aoa.push(['--- Ringkasan Koefisien ---']);
    aoa.push(['x̄ (mean X)',    { f: `AVERAGE(B${dataR1}:B${dataRN})` },  '', `Nilai: ${fmt(model.xMean,6)}`]);
    aoa.push(['ȳ (mean Y)',     { f: `AVERAGE(C${dataR1}:C${dataRN})` },  '', `Nilai: ${fmt(model.yMean,6)}`]);
    aoa.push(['Σ(x−x̄)²',      { f: `SUMPRODUCT(D${dataR1}:D${dataRN},D${dataR1}:D${dataRN})` }, '', `Nilai: ${fmt(model.sxx,6)}`]);
    aoa.push(['Σ(x−x̄)(y−ȳ)',  { f: `SUMPRODUCT(D${dataR1}:D${dataRN},E${dataR1}:E${dataRN})` }, '', `Nilai: ${fmt(model.sxy,6)}`]);
    // slope = Σxy / Σxx
    const sxxRow = ringSt + 4;  // baris Σ(x−x̄)² dalam aoa (0-indexed +2 offset)
    const sxyRow = ringSt + 5;
    aoa.push(['b (slope)',      { f: `B${sxyRow+1}/B${sxxRow+1}` },  '', `Nilai: ${fmt(model.slope,6)}`]);
    aoa.push(['a (intercept)',  { f: `B${ringSt+2}-B${sxyRow+2}*B${ringSt+1}` }, '', `Nilai: ${fmt(model.intercept,6)}`]);
    aoa.push(['Persamaan',      equationString(model)]);
    aoa.push(['Regularisasi',   model.reg.toUpperCase() + (model.reg !== 'none' ? ` (λ=${model.lambda})` : '')]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      {wch:18},{wch:14},{wch:14},{wch:18},{wch:18},{wch:14},{wch:18},{wch:16},{wch:14},{wch:12}
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Perhitungan');

  } else {
    // ── Berganda — koefisien plain, tabel prediksi pakai formula ──
    const feat0Col = 'B'; // kolom fitur pertama
    // Layout: A=#, B..B+p-1=fitur, B+p=y, B+p+1=yHat(formula), B+p+2=resid, B+p+3=resid^2
    const p      = model.feats.length;
    const colY   = String.fromCharCode(66 + p);       // kolom y
    const colHat = String.fromCharCode(66 + p + 1);   // kolom ŷ
    const colE   = String.fromCharCode(66 + p + 2);   // kolom e
    const colE2  = String.fromCharCode(66 + p + 3);   // kolom e²

    // Baris data mulai di 7 (1=judul, 2=mode, 3=kosong, 4=koef header, 5..5+p+1=koef rows, lalu kosong, header tabel)
    const coefRows = 2 + model.feats.length; // intercept + slopes
    const tblHdrRow = 5 + coefRows + 2;
    const dataR1    = tblHdrRow + 1;
    const dataRN    = dataR1 + trainRows.length - 1;

    aoa.push([`Perhitungan — Regresi Berganda: ${model.feats.join(', ')} → ${model.target}`]);
    aoa.push(['[Formula Excel — nilai dihitung oleh spreadsheet]']);
    aoa.push([]);
    aoa.push(['--- Koefisien ---']);
    aoa.push(['Parameter', 'Nilai']);
    aoa.push(['Intercept (a)', model.intercept]);
    model.feats.forEach((f, j) => aoa.push([`b${j+1} (${f})`, model.slopes[j]]));
    aoa.push([]);
    aoa.push(['--- Tabel Prediksi (Formula) ---']);

    const featHdr = model.feats.map(f => f);
    aoa.push(['#', ...featHdr, `y (${model.target})`, 'ŷ (formula)', 'e = y−ŷ', 'e²']);

    // Baris intercept ada di baris Excel: 6 (aoa index 5 = baris 6)
    const interceptExcelRow = 6;

    trainRows.forEach((r, i) => {
      const rowNum  = dataR1 + i;
      const featCols = model.feats.map((f, j) => String.fromCharCode(66 + j));

      // ŷ formula: =intercept_cell + b1*feat1 + b2*feat2 + ...
      const interceptRef = `$B$${interceptExcelRow}`;
      const termParts    = model.feats.map((f, j) => {
        const bRef  = `$B$${interceptExcelRow + 1 + j}`;
        const xCell = `${featCols[j]}${rowNum}`;
        return `${bRef}*${xCell}`;
      }).join('+');
      const yHatFormula = `${interceptRef}+${termParts}`;

      aoa.push([
        i + 1,
        ...model.feats.map(f => r[f]),
        r[model.target],
        { f: yHatFormula },
        { f: `${colY}${rowNum}-${colHat}${rowNum}` },
        { f: `${colE}${rowNum}^2` },
      ]);
    });

    aoa.push([]);
    aoa.push(['Persamaan', equationString(model)]);
    aoa.push(['Regularisasi', model.reg.toUpperCase() + (model.reg !== 'none' ? ` (λ=${model.lambda})` : '')]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{wch:5},...model.feats.map(f=>({wch:Math.max(f.length+2,12)})),{wch:14},{wch:20},{wch:14},{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws, 'Perhitungan');
  }
}

// ============================================================
//  SHEET 3 PLAIN — Prediksi (nilai langsung)
// ============================================================
function _sheetPrediksiPlain(wb, model, trainRows, testRows) {
  const aoa = [];
  aoa.push([`Prediksi — ${equationString(model)}`]);
  aoa.push(['[Plain Text — nilai langsung]']);
  aoa.push([]);
  aoa.push(['#', 'Set', ...model.feats, `y Aktual (${model.target})`, `ŷ Prediksi`, 'Residual (e)', 'e²']);

  const addRows = (rows, label) => {
    rows.forEach((r, i) => {
      const yHat  = predictLR(model, r);
      const y     = r[model.target];
      const resid = y - yHat;
      aoa.push([i + 1, label, ...model.feats.map(f => r[f]), y, yHat, resid, resid ** 2]);
    });
  };
  addRows(trainRows, 'TRAIN');
  addRows(testRows,  'TEST');

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:5},{wch:7},...model.feats.map(f=>({wch:Math.max(f.length+2,12)})),{wch:16},{wch:14},{wch:14},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws, 'Prediksi');
}

// ============================================================
//  SHEET 3 FORMULA — Prediksi (formula Excel)
// ============================================================
function _sheetPrediksiFormula(wb, model, trainRows, testRows) {
  const aoa = [];
  aoa.push([`Prediksi — ${equationString(model)}`]);
  aoa.push(['[Formula Excel — ŷ dihitung dari koefisien]']);
  aoa.push([]);

  // Koefisien di baris 4 ke bawah (di kolom tersendiri)
  // Lalu tabel data mulai di baris setelah koef + 2
  const nCoef   = 1 + model.feats.length; // intercept + slopes
  const coefR1  = 4;  // baris Excel pertama koef
  const tblHdr  = coefR1 + nCoef + 1;
  const dataR1  = tblHdr + 1;
  const allRows = [...trainRows, ...testRows];
  const dataRN  = dataR1 + allRows.length - 1;

  // Blok koefisien (kiri)
  aoa.push(['--- Koefisien Model ---', '', '', '']);
  aoa.push(['Intercept (a)', model.intercept, '', '']);
  model.feats.forEach((f, j) => aoa.push([`b${j+1} (${f})`, model.slopes[j], '', '']));
  aoa.push([]);

  // Header tabel
  aoa.push(['#', 'Set', ...model.feats, `y Aktual (${model.target})`, 'ŷ (formula)', 'Residual (e)', 'e²']);

  const featCols = model.feats.map((_, j) => String.fromCharCode(67 + j)); // C, D, E, ...
  const colY     = String.fromCharCode(67 + model.feats.length);
  const colHat   = String.fromCharCode(67 + model.feats.length + 1);
  const colE     = String.fromCharCode(67 + model.feats.length + 2);
  const colE2    = String.fromCharCode(67 + model.feats.length + 3);

  // intercept di baris Excel coefR1+1 = 5, col B
  const interceptRef = `$B$${coefR1 + 1}`;

  allRows.forEach((r, i) => {
    const label   = i < trainRows.length ? 'TRAIN' : 'TEST';
    const rowNum  = dataR1 + i;

    const termParts = model.feats.map((f, j) => {
      const bRef  = `$B$${coefR1 + 2 + j}`;
      const xCell = `${featCols[j]}${rowNum}`;
      return `${bRef}*${xCell}`;
    }).join('+');
    const yHatF = `${interceptRef}+${termParts}`;

    aoa.push([
      i + 1,
      label,
      ...model.feats.map(f => r[f]),
      r[model.target],
      { f: yHatF },
      { f: `${colY}${rowNum}-${colHat}${rowNum}` },
      { f: `${colE}${rowNum}^2` },
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:5},{wch:7},...model.feats.map(f=>({wch:Math.max(f.length+2,12)})),{wch:16},{wch:20},{wch:14},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws, 'Prediksi');
}

// ============================================================
//  SHEET 4 PLAIN — Evaluasi Metrik (nilai langsung)
// ============================================================
function _sheetEvaluasiPlain(wb, model, trainRows, testRows) {
  // Hitung metrik test
  const testMetrics = calcMetrics(
    testRows.map(r => r[model.target]),
    testRows.map(r => predictLR(model, r)),
    model.yMean
  );
  const tm = model.metrics;
  const te = testMetrics;

  const aoa = [
    ['Evaluasi Metrik — Regresi Linear'],
    ['[Plain Text — nilai langsung]'],
    [],
    ['Metrik', 'Formula', 'Nilai (Train)', 'Nilai (Test)', 'Keterangan'],
    ['R²',   '1 − SS_res/SS_tot',   tm.r2,   te.r2,   'Proporsi variasi yang dijelaskan (0–1, makin besar makin baik)'],
    ['MSE',  '(1/n)Σ(y−ŷ)²',        tm.mse,  te.mse,  'Mean Squared Error'],
    ['RMSE', '√MSE',                 tm.rmse, te.rmse, 'Root MSE — satuan sama dengan y'],
    ['MAE',  '(1/n)Σ|y−ŷ|',         tm.mae,  te.mae,  'Mean Absolute Error'],
    [],
    ['--- Detail ---'],
    ['',              'Train',        'Test'],
    ['SS_res',        tm.ssRes,       te.ssRes],
    ['SS_tot',        tm.ssTot,       te.ssTot],
    ['n (baris)',     model.n,        testRows.length],
    [],
    ['--- Model Info ---'],
    ['Fitur',        model.feats.join(', ')],
    ['Target',       model.target],
    ['Mode',         model.mode === 'simple' ? 'Sederhana (1 fitur)' : `Berganda (${model.feats.length} fitur)`],
    ['Regularisasi', model.reg.toUpperCase() + (model.reg !== 'none' ? ` (λ=${model.lambda})` : '')],
    ['Persamaan',    equationString(model)],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:10},{wch:22},{wch:16},{wch:16},{wch:55}];
  XLSX.utils.book_append_sheet(wb, ws, 'Evaluasi Metrik');
}

// ============================================================
//  SHEET 4 FORMULA — Evaluasi Metrik (formula Excel)
// ============================================================
function _sheetEvaluasiFormula(wb, model, trainRows, testRows) {
  const nTrain = trainRows.length;
  const nTest  = testRows.length;
  const testMetrics = calcMetrics(
    testRows.map(r => r[model.target]),
    testRows.map(r => predictLR(model, r)),
    model.yMean
  );
  const tm = model.metrics;
  const te = testMetrics;

  // Referensi ke sheet Prediksi:
  // kolom Set=B, y=C+feats.length+1, ŷ=C+feats.length+2, resid=C+feats.length+3
  const p        = model.feats.length;
  const sheetRef = "Prediksi";
  const colY     = String.fromCharCode(67 + p);       // y aktual
  const colHat   = String.fromCharCode(67 + p + 1);   // ŷ
  const colE     = String.fromCharCode(67 + p + 2);   // residual

  // Baris data di sheet Prediksi dimulai dari baris: coefR1+nCoef+2 = 4+nCoef+2
  const nCoef   = 1 + p;
  const coefR1  = 4;
  const predDataR1 = coefR1 + nCoef + 2; // header + 1
  const trainR1    = predDataR1;
  const trainRN    = trainR1 + nTrain - 1;
  const testR1     = trainRN + 1;
  const testRN     = testR1  + nTest  - 1;

  const yTrainRef = `'${sheetRef}'!${colY}${trainR1}:'${sheetRef}'!${colY}${trainRN}`;
  const eTrainRef = `'${sheetRef}'!${colE}${trainR1}:'${sheetRef}'!${colE}${trainRN}`;
  const yTestRef  = `'${sheetRef}'!${colY}${testR1}:'${sheetRef}'!${colY}${testRN}`;
  const eTestRef  = `'${sheetRef}'!${colE}${testR1}:'${sheetRef}'!${colE}${testRN}`;

  const r2TrainF  = `1-SUMPRODUCT(${eTrainRef},${eTrainRef})/SUMPRODUCT((${yTrainRef}-AVERAGE(${yTrainRef}))^2)`;
  const mseTrainF = `SUMPRODUCT(${eTrainRef},${eTrainRef})/${nTrain}`;
  const rmseTrainF= `SQRT(${mseTrainF})`;
  const maeTrainF = `SUMPRODUCT(ABS(${eTrainRef}))/${nTrain}`;

  const r2TestF   = `1-SUMPRODUCT(${eTestRef},${eTestRef})/SUMPRODUCT((${yTestRef}-AVERAGE(${yTestRef}))^2)`;
  const mseTestF  = `SUMPRODUCT(${eTestRef},${eTestRef})/${nTest}`;
  const rmseTestF = `SQRT(${mseTestF})`;
  const maeTestF  = `SUMPRODUCT(ABS(${eTestRef}))/${nTest}`;

  const aoa = [
    ['Evaluasi Metrik — Regresi Linear'],
    ['[Formula Excel — nilai diambil dari sheet Prediksi]'],
    [],
    ['Metrik', 'Nilai (Train)', 'Nilai (Test)', 'Keterangan'],
    ['R²',   { f: r2TrainF },   { f: r2TestF },   'Proporsi variasi yang dijelaskan (0–1, makin besar makin baik)'],
    ['MSE',  { f: mseTrainF },  { f: mseTestF },  'Mean Squared Error'],
    ['RMSE', { f: rmseTrainF }, { f: rmseTestF }, 'Root MSE — satuan sama dengan y'],
    ['MAE',  { f: maeTrainF },  { f: maeTestF },  'Mean Absolute Error'],
    [],
    ['--- Verifikasi Nilai (Plain Text) ---'],
    ['',              'Train',     'Test'],
    ['R²',            tm.r2,       te.r2],
    ['MSE',           tm.mse,      te.mse],
    ['RMSE',          tm.rmse,     te.rmse],
    ['MAE',           tm.mae,      te.mae],
    ['SS_res',        tm.ssRes,    te.ssRes],
    ['SS_tot',        tm.ssTot,    te.ssTot],
    ['n (baris)',     nTrain,      nTest],
    [],
    ['--- Model Info ---'],
    ['Fitur',        model.feats.join(', ')],
    ['Target',       model.target],
    ['Mode',         model.mode === 'simple' ? 'Sederhana (1 fitur)' : `Berganda (${model.feats.length} fitur)`],
    ['Regularisasi', model.reg.toUpperCase() + (model.reg !== 'none' ? ` (λ=${model.lambda})` : '')],
    ['Persamaan',    equationString(model)],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:10},{wch:20},{wch:20},{wch:55}];
  XLSX.utils.book_append_sheet(wb, ws, 'Evaluasi Metrik');
}