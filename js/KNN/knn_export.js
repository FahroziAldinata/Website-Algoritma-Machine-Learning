/* ============================================================
   knn_export.js  v3 — Cell-Reference Chain Export
   
   PLAIN  mode: semua cell berisi nilai langsung (angka/teks)
   FORMULA mode: setiap hasil perhitungan merujuk ke cell sumber
   
   Chain Formula:
     S1_Dataset   → nilai mentah (plain selalu)
     S2_Stats     → =MIN/MAX/AVERAGE/STDEV dari S1
     S3_Norm      → =(x - min)/range  ref ke S1 + S2
     S4_Jarak     → =SQRT/ABS ref ke S3 (nilai ternormalisasi)
     S5_Pred_Test → jarak ref ke S4, status =IF(pred=aktual,...)
     S6_Pred_Train→ sama seperti S5 untuk training set
     S7_Evaluasi  → TP/FP/FN =COUNTIFS dari S5/S6,
                    Precision/Recall/F1/Acc semua ref ke cell TP dst,
                    Macro = AVERAGE dari cell per-kelas,
                    Gap = cell_train - cell_test
   ============================================================ */

/* ── Global state untuk alamat cell antar sheet ── */
let _EX = {};   // koordinat penting, diisi oleh tiap builder

function exportKNN(mode) {
  if (!knnResult) return alert('Jalankan KNN terlebih dahulu.');
  const r  = knnResult;
  const fm = (mode === 'formula');
  _EX = {};

  const WB = XLSX.utils.book_new();

  s1_dataset   (WB, r, fm);
  s2_stats     (WB, r, fm);
  s3_norm      (WB, r, fm);
  s4_jarak     (WB, r, fm);
  s5_pred      (WB, r, fm, 'test');
  s6_pred      (WB, r, fm, 'train');
  s7_evaluasi  (WB, r, fm);

  XLSX.writeFile(WB, fm ? 'KNN_Formula.xlsx' : 'KNN_Plain.xlsx');
}

/* ============================================================
   UTILITAS
   ============================================================ */

/** Encode angka kolom (0-based) ke huruf Excel: 0→A, 25→Z, 26→AA */
function col2l(c) {
  let s = '';
  c++;
  while (c > 0) {
    c--;
    s = String.fromCharCode(65 + (c % 26)) + s;
    c = Math.floor(c / 26);
  }
  return s;
}

/** Alamat cell: rc(0,0) → "A1" */
function rc(r, c) { return col2l(c) + (r + 1); }

/** External cell ref: xref('S2_Stats','B3') → "'S2_Stats'!B3" */
function xref(sheet, addr) { return `'${sheet}'!${addr}`; }

/** Tulis worksheet dari array-of-arrays (mendukung {t,f} cell objects) */
function aoaToWS(data) { return XLSX.utils.aoa_to_sheet(data); }
function addWS(WB, ws, name) { XLSX.utils.book_append_sheet(WB, ws, name); }

/** Bulatkan angka ke 8 desimal (hindari floating noise di formula) */
function n8(v) { return Math.round(v * 1e8) / 1e8; }

/** Cell formula */
function fc(f)  { return { t: 'n', f }; }
/** Cell string */
function sc(s)  { return { t: 's', v: String(s) }; }
/** Cell number plain */
function nc(v)  { return typeof v === 'number' ? v : parseFloat(v) || 0; }

/* ============================================================
   S1 — DATASET  (selalu plain, sumber kebenaran)
   Layout:
     Baris 1-9   : header info
     Baris 10    : header kolom training ("Baris", feat1..featN, Kelas)
     Baris 11..  : data training
     (kosong)
     header test
     data test
   ============================================================ */
function s1_dataset(WB, r, fm) {
  const SN = '1_Dataset';
  const nc_feat = r.numericCols;
  const allFeat = r.featureCols;

  const rows = [];

  // Info header (baris 0-7)
  rows.push(['ML Manual Calculator — K-NN']);
  rows.push(['K', r.k, 'Metrik', r.metric, 'Norm', r.normType]);
  rows.push(['Weighting', r.weighting, 'Seed', r.seed, 'Split', n8(r.splitRatio)]);
  rows.push(['Total Baris', r.totalRows, 'Train', r.trainRaw.length, 'Test', r.testRaw.length]);
  rows.push([]);

  // Training header — baris 4 (index 4) → row 5 di Excel
  const TRAIN_HEADER_ROW = rows.length;   // index
  rows.push(['#', ...allFeat, classCol]);  // kolom: A=No, B..=fitur, last=kelas

  // Simpan posisi: kolom fitur numerik di sheet ini
  _EX.s1 = {
    sn: SN,
    trainHeaderRow: TRAIN_HEADER_ROW,
    trainDataStart: rows.length,          // index baris data train pertama
    featCols: {},   // c → index kolom (0-based) di sheet
    klasCol: 0
  };
  allFeat.forEach((c, i) => { _EX.s1.featCols[c] = i + 1; }); // +1 karena kolom A = No
  _EX.s1.klasCol = allFeat.length + 1;

  // Helper: ambil nilai yang sudah di-encode untuk export S1
  // trainNorm sudah berisi nilai setelah encode+norm, tapi kita butuh nilai setelah encode sebelum norm
  // Kita reconstruct dari trainNorm jika normType!=none, atau dari trainRaw jika none
  // Untuk S1 (Dataset), tampilkan nilai ASLI untuk numerik, nilai ENCODED untuk bool/cat
  function s1CellVal(row, c) {
    // Numerik asli → tampilkan as-is
    if (r.numericCols && r.numericCols.includes(c)) {
      return isNaN(parseFloat(row[c])) ? row[c] : n8(parseFloat(row[c]));
    }
    // Boolean → 1/0
    if (r.boolCols && r.boolCols.includes(c)) {
      const s = String(row[c]).trim().toLowerCase();
      return (s === 'true' || s === '1') ? 1 : 0;
    }
    // Kategoris → encoded angka dari labelEncodings
    if (r.labelEncodings && r.labelEncodings[c] !== undefined) {
      const map = r.labelEncodings[c];
      return row[c] in map ? map[row[c]] : row[c];
    }
    return isNaN(parseFloat(row[c])) ? row[c] : n8(parseFloat(row[c]));
  }

  r.trainRaw.forEach((row, i) => {
    rows.push([
      i + 1,
      ...allFeat.map(c => s1CellVal(row, c)),
      row[classCol]
    ]);
  });

  _EX.s1.trainDataEnd = rows.length - 1;  // index baris terakhir train
  rows.push([]);

  // Test header
  const TEST_HEADER_ROW = rows.length;
  rows.push(['#', ...allFeat, classCol]);
  _EX.s1.testHeaderRow = TEST_HEADER_ROW;
  _EX.s1.testDataStart = rows.length;

  r.testRaw.forEach((row, i) => {
    rows.push([
      i + 1,
      ...allFeat.map(c => s1CellVal(row, c)),
      row[classCol]
    ]);
  });
  _EX.s1.testDataEnd = rows.length - 1;

  addWS(WB, aoaToWS(rows), SN);
}

/* ============================================================
   S2 — STATISTIK NORMALISASI
   Formula mode: MIN/MAX/AVERAGE/STDEV merujuk ke kolom S1
   Layout (per fitur numerik):
     header: Fitur | Min | Max | Range | Mean | StdDev
     data  : 1 baris per fitur
   ============================================================ */
function s2_stats(WB, r, fm) {
  const SN = '2_Stats';
  const S1 = _EX.s1.sn;
  const trainStart = _EX.s1.trainDataStart + 1;  // Excel row (1-based)
  const trainEnd   = _EX.s1.trainDataEnd   + 1;

  const rows = [];
  rows.push(['Statistik Normalisasi — dihitung dari Training Set saja']);
  rows.push(['(mencegah data leakage ke test set)']);
  rows.push([]);

  // Tambah info encoding jika ada
  const hasBool = r.boolCols && r.boolCols.length > 0;
  const hasCat  = r.catCols  && r.catCols.length  > 0;
  if (hasBool || hasCat) {
    rows.push(['Preprocessing sebelum normalisasi:']);
    if (hasBool) rows.push([`  Boolean Encoding: ${(r.boolCols||[]).join(', ')} → True=1, False=0`]);
    if (hasCat)  rows.push([`  Label Encoding  : ${(r.catCols||[]).join(', ')} → angka alfabetis`]);
    rows.push([]);
  }

  const STAT_HEADER_ROW = rows.length;
  // Kolom: A=Fitur, B=Min, C=Max, D=Range, E=Mean, F=StdDev, G=Metode Norm, H=Tipe Kolom
  rows.push(['Fitur', 'Min', 'Max', 'Range (Max-Min)', 'Mean', 'StdDev', 'Metode Norm', 'Tipe Kolom']);
  _EX.s2 = { sn: SN, statHeaderRow: STAT_HEADER_ROW, statDataStart: rows.length, featRow: {} };

  // Gunakan allNumericCols agar mencakup SEMUA kolom setelah encode
  // (numerik asli + boolean encoded + kategoris encoded)
  const allCols = r.allNumericCols || r.numericCols;

  // Pre-hitung mean & std dari trainNorm untuk plain mode
  // normStats hanya simpan { min, max } untuk minmax, atau { mean, std } untuk zscore
  // Tapi Excel S2 perlu KEDUA-DUANYA terisi agar informatif
  // Solusi: hitung manual dari trainNorm (sudah encoded, sebelum norm)
  // Kita ambil dari trainRaw yang sudah di-encode = trainNorm sebelum dinormalisasi
  // Cara paling akurat: hitung ulang dari data training yang sudah di-encode
  function calcColStats(col) {
    // Ambil nilai numerik dari training data yang sudah di-encode
    // trainNorm sudah ternormalisasi → kita tidak bisa pakai itu untuk mean/std asli
    // Gunakan normStats jika tersedia, fallback ke hitung dari trainNorm terbalik
    const ns = r.normStats?.[col];
    if (!ns) return { min: 0, max: 0, range: 0, mean: 0, std: 0 };

    const min = ns.min  ?? 0;
    const max = ns.max  ?? 0;
    const range = max - min;

    // mean & std: ambil dari normStats jika zscore (sudah ada)
    // Untuk minmax: hitung dari trainNorm dengan inverse: x_orig = x_norm * range + min
    let mean = ns.mean ?? 0;
    let std  = ns.std  ?? 0;

    if (r.normType === 'minmax' && (mean === 0 && std === 0)) {
      // Hitung mean & std dari trainNorm (inverse transform)
      const vals = r.trainNorm.map(row => {
        const v = row[col];
        return typeof v === 'number' && !isNaN(v) ? v * range + min : null;
      }).filter(v => v !== null);

      if (vals.length > 0) {
        mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const variance = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length;
        std = Math.sqrt(variance);
      }
    }

    return { min, max, range, mean, std };
  }

  allCols.forEach((c, fi) => {
    const s1Col  = col2l(_EX.s1.featCols[c]);  // kolom di S1
    const s1Rng  = `${xref(S1, s1Col + trainStart)}:${xref(S1, s1Col + trainEnd)}`;

    const rowIdx = rows.length;
    _EX.s2.featRow[c] = rowIdx;  // index baris statistik fitur ini

    const exRow = rowIdx + 1;

    let minCell, maxCell, rangeFm, meanCell, stdCell;

    if (fm) {
      // Formula mode: semua ref ke S1
      minCell  = fc(`MIN(${s1Rng})`);
      maxCell  = fc(`MAX(${s1Rng})`);
      rangeFm  = fc(`C${exRow}-B${exRow}`);
      meanCell = fc(`AVERAGE(${s1Rng})`);
      stdCell  = fc(`STDEV(${s1Rng})`);
    } else {
      // Plain mode: hitung nilai aktual (bukan 0)
      const st = calcColStats(c);
      minCell  = n8(st.min);
      maxCell  = n8(st.max);
      rangeFm  = n8(st.range);
      meanCell = n8(st.mean);
      stdCell  = n8(st.std);
    }

    // Label tipe kolom untuk kolom H
    const tipeKolom = (r.boolCols||[]).includes(c)
      ? 'Boolean (True/False→1/0)'
      : (r.catCols||[]).includes(c)
        ? 'Kategoris (Label Encoded)'
        : 'Numerik';

    rows.push([c, minCell, maxCell, rangeFm, meanCell, stdCell, r.normType, tipeKolom]);
  });

  _EX.s2.statDataEnd = rows.length - 1;

  rows.push([]);
  rows.push(['Keterangan:']);
  rows.push(['Min-Max norm: (x - Min) / Range']);
  rows.push(['Z-Score norm: (x - Mean) / StdDev']);
  rows.push(['Boolean col : True→1, False→0 sebelum normalisasi']);
  rows.push(['Kategoris   : Label Encoding (alfabetis) sebelum normalisasi']);

  addWS(WB, aoaToWS(rows), SN);
}

/* ============================================================
   S3 — NORMALISASI  (Train + Test)
   Formula mode: setiap cell norm = (S1_val - S2_min) / S2_range
                 atau          = (S1_val - S2_mean) / S2_std
   Layout:
     Bagian TRAINING:
       header: # | feat1..N_norm | Kelas
       data  : 1 baris per training row
     Bagian TEST:
       header + data test
   ============================================================ */
function s3_norm(WB, r, fm) {
  const SN  = '3_Norm';
  const S1  = _EX.s1.sn;
  const S2  = _EX.s2.sn;
  // allNumericCols = semua featureCols setelah encode (num + bool_enc + cat_enc)
  const nc  = r.allNumericCols || r.numericCols;

  // Semua featureCols sudah numerik setelah encode → semua di-norm
  const allFeat    = r.featureCols;
  const normHeader = ['#', ...allFeat.map(c => `${c}_norm`), classCol];

  const rows = [];
  rows.push(['Normalisasi Fitur — metode: ' + r.normType]);
  rows.push([]);

  /* ---- helper: buat cell normalisasi 1 nilai ---- */
  // Semua kolom sudah numerik di S1 (encoded), jadi semua bisa di-norm
  function normCell(c, s1DataRow /* Excel 1-based */, setType) {
    if (r.normType === 'none') {
      const s1ColL = col2l(_EX.s1.featCols[c]);
      return fm ? fc(`${xref(S1, s1ColL + s1DataRow)}`) : null;
    }
    const s2Row  = _EX.s2.featRow[c] + 1;  // Excel 1-based row di S2
    const s1ColL = col2l(_EX.s1.featCols[c]);
    const xVal   = xref(S1, s1ColL + s1DataRow);

    if (r.normType === 'minmax') {
      const minRef   = xref(S2, `B${s2Row}`);
      const rangeRef = xref(S2, `D${s2Row}`);
      return fm ? fc(`IF(${rangeRef}=0,0,(${xVal}-${minRef})/${rangeRef})`) : null;
    } else {
      const meanRef = xref(S2, `E${s2Row}`);
      const stdRef  = xref(S2, `F${s2Row}`);
      return fm ? fc(`IF(${stdRef}=0,0,(${xVal}-${meanRef})/${stdRef})`) : null;
    }
  }

  /* ---- TRAINING ---- */
  rows.push(['--- TRAINING SET (Ternormalisasi) ---']);
  const TRAIN_HEADER_ROW = rows.length;
  rows.push(normHeader);
  _EX.s3 = { sn: SN, trainHeaderRow: TRAIN_HEADER_ROW, trainDataStart: rows.length, featCols: {}, klasCol: 0 };
  allFeat.forEach((c, i) => { _EX.s3.featCols[c] = i + 1; });
  _EX.s3.klasCol = allFeat.length + 1;

  r.trainRaw.forEach((raw, i) => {
    const s1Row = _EX.s1.trainDataStart + 1 + i;  // Excel 1-based
    const cells = allFeat.map(c => {
      if (fm) {
        return normCell(c, s1Row, 'train');
      } else {
        return n8(r.trainNorm[i][c]);
      }
    });
    rows.push([i + 1, ...cells, raw[classCol]]);
  });

  _EX.s3.trainDataEnd = rows.length - 1;
  rows.push([]);

  /* ---- TEST ---- */
  rows.push(['--- TEST SET (Ternormalisasi) ---']);
  const TEST_HEADER_ROW = rows.length;
  rows.push(normHeader);
  _EX.s3.testHeaderRow = TEST_HEADER_ROW;
  _EX.s3.testDataStart = rows.length;

  r.testRaw.forEach((raw, i) => {
    const s1Row = _EX.s1.testDataStart + 1 + i;  // Excel 1-based
    const cells = allFeat.map(c => {
      if (fm) {
        return normCell(c, s1Row, 'test');
      } else {
        return n8(r.testNorm[i][c]);
      }
    });
    rows.push([i + 1, ...cells, raw[classCol]]);
  });
  _EX.s3.testDataEnd = rows.length - 1;

  addWS(WB, aoaToWS(rows), SN);
}

/* ============================================================
   S4 — PERHITUNGAN JARAK  (setiap test row vs setiap train row)
   Formula mode: jarak referensi ke cell S3
   Layout:
     Satu blok per test row:
       header: "Test #i" | nilai fitur (raw) | kelas aktual
       sub-header: Rank | Train# | feat1..N_train | Jarak | [Weight] | Tetangga?
       data: 1 baris per training row (sorted by dist)
       Voting tally
       Prediksi
       (blank)
   ============================================================ */
function s4_jarak(WB, r, fm) {
  const SN = '4_Jarak';
  const S3 = _EX.s3.sn;
  const nc = r.numericCols;

  /* ---- helper: formula jarak dari cell refs S3 ---- */
  function jarakFormula(testS3Row, trainS3Row) {
    // testS3Row, trainS3Row: Excel 1-based row di S3
    const terms = nc.map(c => {
      const col  = col2l(_EX.s3.featCols[c]);
      const tRef = xref(S3, col + testS3Row);
      const nRef = xref(S3, col + trainS3Row);
      if (r.metric === 'euclidean') return `(${tRef}-${nRef})^2`;
      if (r.metric === 'manhattan') return `ABS(${tRef}-${nRef})`;
      return `ABS(${tRef}-${nRef})^${r.p}`;
    });
    const inner = terms.join('+');
    if (r.metric === 'euclidean') return `SQRT(${inner})`;
    if (r.metric === 'manhattan') return inner;
    return `(${inner})^(1/${r.p})`;
  }

  const rows = [];
  const metricStr = { euclidean:'Euclidean √Σ(x-y)²', manhattan:'Manhattan Σ|x-y|', minkowski:`Minkowski (Σ|x-y|^p)^(1/p) p=${r.p}` };
  rows.push([`Perhitungan Jarak — ${metricStr[r.metric]}`]);
  rows.push([`Normalisasi: ${r.normType} | Weighting: ${r.weighting} | K=${r.k}`]);
  rows.push([]);

  // Simpan alamat cell jarak untuk S5 nanti
  _EX.s4 = { sn: SN, testBlocks: [] };

  const trainCount = r.trainRaw.length;

  r.predictions.forEach((pred, ti) => {
    const testS3Row = _EX.s3.testDataStart + 1 + ti;  // Excel 1-based di S3

    const blockStart = rows.length;

    // Header test row
    rows.push([`Test Row #${ti + 1}`,
      ...nc.map(c => `${c}=${n8(parseFloat(pred.queryRawRow[c]))}`),
      `Aktual: ${pred.actual}`
    ]);

    // Sub-header
    const subH = ['Rank', 'Train#', ...nc.map(c => `${c}_train_norm`), 'Jarak'];
    if (r.weighting === 'distance') subH.push('Weight(1/d)');
    subH.push('K-Tetangga?', 'Kelas_Train');
    rows.push(subH);

    const distRowStart = rows.length;

    // Satu baris per training row (sudah sorted di pred.dists)
    pred.dists.forEach((dn, di) => {
      const trainS3Row = _EX.s3.trainDataStart + 1 + dn.idx;  // Excel 1-based di S3
      const isNeighbor = di < r.k;

      const distExRow = rows.length + 1;  // Excel 1-based untuk baris ini

      const trainNormCells = nc.map(c => {
        const col = col2l(_EX.s3.featCols[c]);
        return fm ? fc(xref(S3, col + trainS3Row)) : n8(dn.row[c]);
      });

      // Kolom jarak: setelah train norm = kolom index (2 + nc.length)
      // rank=A, train#=B, nc cols start C, jarak = C+nc.length
      const jarakColIdx = 2 + nc.length;       // 0-based
      const jarakColL   = col2l(jarakColIdx);

      const jarakCell = fm
        ? fc(jarakFormula(testS3Row, trainS3Row))
        : n8(dn.dist);

      let weightCell = null;
      if (r.weighting === 'distance') {
        weightCell = fm
          ? fc(`IF(${jarakColL}${distExRow}=0,"Inf",1/${jarakColL}${distExRow})`)
          : (dn.dist === 0 ? 'Inf' : n8(1 / dn.dist));
      }

      const row = [di + 1, dn.idx + 1, ...trainNormCells, jarakCell];
      if (r.weighting === 'distance') row.push(weightCell);
      row.push(isNeighbor ? `K${di + 1} ✓` : '', dn.rawRow[classCol]);
      rows.push(row);
    });

    const distRowEnd = rows.length;

    // Voting tally
    rows.push([]);
    rows.push(['Voting Tally:']);
    rows.push(['Kelas', r.weighting === 'distance' ? 'Skor (Σ1/d)' : 'Jumlah Suara']);
    Object.entries(pred.tally).sort(([a],[b]) => a.localeCompare(b)).forEach(([cls, score]) => {
      rows.push([cls, typeof score === 'number' ? n8(score) : score]);
    });
    rows.push(['Prediksi:', pred.predicted, 'Aktual:', pred.actual, 'Status:', pred.correct ? 'BENAR ✓' : 'SALAH ✗']);
    rows.push([]);

    _EX.s4.testBlocks.push({
      testIdx: ti,
      distRowStart,  // index (0-based) baris data jarak pertama di `rows`
      distRowEnd,
      trainCount
    });
  });

  addWS(WB, aoaToWS(rows), SN);
}

/* ============================================================
   S5 / S6 — PREDIKSI  (test & train)
   Formula mode:
     feat norm → ref ke S3
     Jarak K tetangga → ref ke S4 (baris jarak ke-1..k)
     Status → =IF(Prediksi=Aktual,"BENAR","SALAH")
   Layout:
     header: # | feat_raw | feat_norm | K1_kelas..Kk_kelas | K1_jarak..Kk_jarak | Aktual | Prediksi | Status
   ============================================================ */
function s5_pred(WB, r, fm, setType) {
  const isTest = setType === 'test';
  const SN     = isTest ? '5_Pred_Test' : '6_Pred_Train';
  const S3     = _EX.s3.sn;
  const S4     = _EX.s4.sn;
  const preds  = isTest ? r.predictions : r.trainPredictions;
  const rawSet = isTest ? r.testRaw     : r.trainRaw;
  const nc     = r.numericCols;
  const allFeat= r.featureCols;

  const rows = [];
  rows.push([`Prediksi ${isTest ? 'TEST' : 'TRAINING'} Set — K=${r.k} | ${r.metric} | ${r.normType}`]);
  rows.push([]);

  // Header
  const header = [
    '#',
    ...allFeat.map(c => c + '_raw'),
    ...(r.normType !== 'none' ? allFeat.filter(c => nc.includes(c)).map(c => c + '_norm') : []),
    ...Array.from({length: r.k}, (_, i) => `K${i+1}_kelas`),
    ...Array.from({length: r.k}, (_, i) => `K${i+1}_jarak`),
    ...(r.weighting === 'distance' ? Array.from({length: r.k}, (_, i) => `K${i+1}_weight`) : []),
    'Aktual', 'Prediksi', 'Status'
  ];
  rows.push(header);

  _EX[isTest ? 's5' : 's6'] = { sn: SN, dataStart: rows.length, predCol: 0, aktualCol: 0 };

  preds.forEach((pred, i) => {
    const raw  = pred.queryRawRow;
    const norm = pred.queryNormRow;

    // Raw values (plain selalu)
    const rawVals = allFeat.map(c => isNaN(parseFloat(raw[c])) ? raw[c] : n8(parseFloat(raw[c])));

    // Norm values
    let normVals = [];
    if (r.normType !== 'none') {
      if (fm) {
        const s3Row = (isTest ? _EX.s3.testDataStart : _EX.s3.trainDataStart) + 1 + i;
        normVals = nc.map(c => {
          const col = col2l(_EX.s3.featCols[c]);
          return fc(xref(S3, col + s3Row));
        });
      } else {
        normVals = nc.map(c => n8(norm[c]));
      }
    }

    // K tetangga kelas (plain — nama kelas tidak bisa di-formula)
    const kClasses = pred.neighbors.map(n => n.rawRow[classCol]);

    // K tetangga jarak
    let kDists = [];
    if (fm && _EX.s4.testBlocks && isTest) {
      // Untuk test set: ref ke S4 kolom jarak, baris tetangga ke-1..k
      const block = _EX.s4.testBlocks[i];
      if (block) {
        // Dalam S4, setiap test block memiliki trainCount baris jarak
        // Kita butuh baris yang terurut (sudah sorted) → ambil baris distRowStart + rank
        kDists = pred.neighbors.map((n, ki) => {
          // Cari rank di dists (sudah sorted)
          const rank = pred.dists.findIndex(d => d.idx === n.idx);
          const s4DataRow = block.distRowStart + 1 + rank;  // Excel 1-based
          // Kolom jarak di S4: A=Rank,B=Train#, C..(2+nc.length-1)=norm, (2+nc.length)=Jarak
          const jarakColL = col2l(2 + nc.length);
          return fc(xref(S4, jarakColL + s4DataRow));
        });
      } else {
        kDists = pred.neighbors.map(n => n8(n.dist));
      }
    } else {
      kDists = pred.neighbors.map(n => n8(n.dist));
    }

    // Weight (1/jarak)
    let kWeights = [];
    if (r.weighting === 'distance') {
      const dataRowExcel = rows.length + 1;  // Excel 1-based untuk baris ini
      // Kolom K1_jarak mulai setelah: #+rawCols+normCols+kClasses = 1+allFeat+(normType?nc:0)+k
      const jarakStartColIdx = 1 + allFeat.length + (r.normType !== 'none' ? nc.length : 0) + r.k;
      kWeights = Array.from({length: r.k}, (_, ki) => {
        const jarakColL = col2l(jarakStartColIdx + ki);
        return fm
          ? fc(`IF(${jarakColL}${dataRowExcel}=0,"Inf",1/${jarakColL}${dataRowExcel})`)
          : (pred.neighbors[ki].dist === 0 ? 'Inf' : n8(1 / pred.neighbors[ki].dist));
      });
    }

    // Prediksi & aktual
    const aktualVal = raw[classCol];
    const predVal   = pred.predicted;

    // Status: =IF(Prediksi_cell=Aktual_cell,"BENAR","SALAH")
    let statusCell;
    if (fm) {
      const dataRowExcel = rows.length + 1;
      // Kolom Aktual & Prediksi
      const totalCols = 1 + allFeat.length
        + (r.normType !== 'none' ? nc.length : 0)
        + r.k + r.k
        + (r.weighting === 'distance' ? r.k : 0);
      const aktColL  = col2l(totalCols);       // Aktual
      const predColL = col2l(totalCols + 1);   // Prediksi
      statusCell = fc(`IF(${predColL}${dataRowExcel}=${aktColL}${dataRowExcel},"BENAR","SALAH")`);
    } else {
      statusCell = pred.correct ? 'BENAR' : 'SALAH';
    }

    rows.push([
      i + 1,
      ...rawVals,
      ...normVals,
      ...kClasses,
      ...kDists,
      ...kWeights,
      aktualVal,
      predVal,
      statusCell
    ]);
  });

  const dataEnd = rows.length - 1;

  // Simpan kolom penting untuk S7
  const totalCols = 1 + allFeat.length
    + (r.normType !== 'none' ? nc.length : 0)
    + r.k + r.k
    + (r.weighting === 'distance' ? r.k : 0);
  const aktColIdx  = totalCols;
  const predColIdx = totalCols + 1;
  const statColIdx = totalCols + 2;

  const key = isTest ? 's5' : 's6';
  _EX[key] = {
    sn: SN,
    dataStart: _EX[key].dataStart,
    dataEnd,
    aktColL:  col2l(aktColIdx),
    predColL: col2l(predColIdx),
    statColL: col2l(statColIdx)
  };

  addWS(WB, aoaToWS(rows), SN);
}

function s6_pred(WB, r, fm) { s5_pred(WB, r, fm, 'train'); }

/* ============================================================
   S7 — EVALUASI  (Training + Test + Perbandingan)
   Formula mode:
     TP  = COUNTIFS(aktual_col,"=cls", prediksi_col,"=cls")
     FP  = COUNTIFS(prediksi_col,"=cls") - TP
     FN  = COUNTIFS(aktual_col,"=cls")   - TP
     Benar = COUNTIF(status_col,"BENAR")
     Acc   = Benar / Total_baris
     Prec  = cell_TP / (cell_TP + cell_FP)
     Recall= cell_TP / (cell_TP + cell_FN)
     F1    = 2*Prec*Recall/(Prec+Recall)
     Macro = AVERAGE(prec_col_range)
     Gap   = cell_train - cell_test
   ============================================================ */
function s7_evaluasi(WB, r, fm) {
  const SN = '7_Evaluasi';
  const rows = [];

  rows.push(['Evaluasi Metrik — Training vs Test']);
  rows.push(['Formula: Precision=TP/(TP+FP) | Recall=TP/(TP+FN) | F1=2*P*R/(P+R) | Macro=AVERAGE(per kelas)']);
  rows.push([]);

  /* ---- Helper: render satu blok evaluasi ---- */
  // Mengembalikan { accCell, macroPrec, macroRec, macroF1 } untuk tabel perbandingan
  function evalBlock(metrics, cm, setKey, label) {
    const sx     = _EX[setKey];
    const predSN = sx.sn;
    const dStart = sx.dataStart + 1;  // Excel 1-based
    const dEnd   = sx.dataEnd   + 1;
    const aktL   = sx.aktColL;
    const predL  = sx.predColL;
    const statL  = sx.statColL;
    const total  = metrics.total;

    rows.push([`--- ${label} SET (${total} data) ---`]);
    rows.push([]);

    // Accuracy
    const accRowIdx = rows.length;  // index row di S7 (0-based)
    let benarCell, accCell;
    if (fm) {
      benarCell = fc(`COUNTIF(${xref(predSN, statL+dStart+':'+statL+dEnd)},"BENAR")`);
      // Accuracy = Benar / Total
      const benarColL = col2l(1);  // kolom B di S7 (Benar ada di baris accRowIdx, kolom B)
      accCell   = fc(`B${accRowIdx + 1}/${total}`);
    } else {
      benarCell = metrics.correct;
      accCell   = n8(metrics.accuracy);
    }
    rows.push(['Benar',   benarCell, '(dari', total, 'data)']);
    rows.push(['Accuracy', accCell]);
    rows.push([]);

    // Confusion Matrix
    rows.push(['Confusion Matrix (Baris=Aktual | Kolom=Prediksi)']);
    rows.push(['', ...r.classes]);
    r.classes.forEach(actual => {
      const cmRow = r.classes.map(pred => {
        if (fm) {
          return fc(`COUNTIFS(${xref(predSN, aktL+dStart+':'+aktL+dEnd)},"${actual}",${xref(predSN, predL+dStart+':'+predL+dEnd)},"${pred}")`);
        }
        return cm[actual][pred] || 0;
      });
      rows.push([actual, ...cmRow]);
    });
    rows.push([]);

    // Per-class table
    rows.push(['Metrik Per Kelas:']);
    const pcHeader = ['Kelas', 'TP', 'FP', 'FN', 'Precision', 'Recall', 'F1'];
    rows.push(pcHeader);

    const pcDataStart = rows.length;  // index baris pertama per-class data di S7
    const pcCellMap   = {};           // cls → { row (0-based), tpL, fpL, fnL, precL, recL, f1L }

    // Kolom dalam tabel per-class: A=Kelas,B=TP,C=FP,D=FN,E=Prec,F=Recall,G=F1
    // Tapi di S7 baris ini mulai dari kolom A → kita pakai offset 0
    const tpColL   = col2l(1);  // B
    const fpColL   = col2l(2);  // C
    const fnColL   = col2l(3);  // D
    const precColL = col2l(4);  // E
    const recColL  = col2l(5);  // F
    const f1ColL   = col2l(6);  // G

    r.classes.forEach((cls, ci) => {
      const m      = metrics.perClass[cls];
      const exRow  = pcDataStart + 1 + ci;  // Excel 1-based row di S7

      let tpCell, fpCell, fnCell, precCell, recCell, f1Cell;
      if (fm) {
        const aktRng  = xref(predSN, `${aktL}${dStart}:${aktL}${dEnd}`);
        const predRng = xref(predSN, `${predL}${dStart}:${predL}${dEnd}`);
        tpCell  = fc(`COUNTIFS(${aktRng},"${cls}",${predRng},"${cls}")`);
        fpCell  = fc(`COUNTIF(${predRng},"${cls}")-${tpColL}${exRow}`);
        fnCell  = fc(`COUNTIF(${aktRng},"${cls}")-${tpColL}${exRow}`);
        precCell= fc(`IF(${tpColL}${exRow}+${fpColL}${exRow}=0,0,${tpColL}${exRow}/(${tpColL}${exRow}+${fpColL}${exRow}))`);
        recCell = fc(`IF(${tpColL}${exRow}+${fnColL}${exRow}=0,0,${tpColL}${exRow}/(${tpColL}${exRow}+${fnColL}${exRow}))`);
        f1Cell  = fc(`IF(${precColL}${exRow}+${recColL}${exRow}=0,0,2*${precColL}${exRow}*${recColL}${exRow}/(${precColL}${exRow}+${recColL}${exRow}))`);
      } else {
        tpCell   = m.tp;
        fpCell   = m.fp;
        fnCell   = m.fn;
        precCell = n8(m.precision);
        recCell  = n8(m.recall);
        f1Cell   = n8(m.f1);
      }
      rows.push([cls, tpCell, fpCell, fnCell, precCell, recCell, f1Cell]);
      pcCellMap[cls] = { exRow, precColL, recColL, f1ColL };
    });

    const pcDataEnd = rows.length - 1;
    rows.push([]);

    // Macro Average
    const macroRowIdx = rows.length;
    let macroPrecCell, macroRecCell, macroF1Cell;
    if (fm) {
      const precRange = `${precColL}${pcDataStart + 1}:${precColL}${pcDataEnd + 1}`;
      const recRange  = `${recColL}${pcDataStart + 1}:${recColL}${pcDataEnd + 1}`;
      const f1Range   = `${f1ColL}${pcDataStart + 1}:${f1ColL}${pcDataEnd + 1}`;
      macroPrecCell = fc(`AVERAGE(${precRange})`);
      macroRecCell  = fc(`AVERAGE(${recRange})`);
      macroF1Cell   = fc(`AVERAGE(${f1Range})`);
    } else {
      macroPrecCell = n8(metrics.macro.precision);
      macroRecCell  = n8(metrics.macro.recall);
      macroF1Cell   = n8(metrics.macro.f1);
    }
    rows.push(['Macro Average', '', '', '', macroPrecCell, macroRecCell, macroF1Cell]);
    rows.push([]);

    // Return cell refs untuk tabel perbandingan
    return {
      accRow:       accRowIdx + 1 + 1,   // Excel 1-based: baris "Accuracy" = accRowIdx+1 (baris Benar) +1
      benarRow:     accRowIdx + 1,
      macroRow:     macroRowIdx + 1,
      precColL, recColL, f1ColL
    };
  }

  const trainRef = evalBlock(r.trainMetrics, r.trainCM, 's6', 'TRAINING');
  const testRef  = evalBlock(r.metrics,      r.cm,      's5', 'TEST');

  /* ---- Tabel Perbandingan ---- */
  rows.push(['--- PERBANDINGAN TRAINING vs TEST ---']);
  rows.push(['Metrik', 'Training', 'Test', 'Gap (Train - Test)', 'Interpretasi']);

  const metrics4compare = [
    { label: 'Accuracy',        trainFm: `B${trainRef.accRow}`,  testFm: `B${testRef.accRow}` },
    { label: 'Macro Precision', trainFm: `E${trainRef.macroRow}`, testFm: `E${testRef.macroRow}` },
    { label: 'Macro Recall',    trainFm: `F${trainRef.macroRow}`, testFm: `F${testRef.macroRow}` },
    { label: 'Macro F1',        trainFm: `G${trainRef.macroRow}`, testFm: `G${testRef.macroRow}` },
  ];

  const trainVals = [r.trainMetrics.accuracy, r.trainMetrics.macro.precision, r.trainMetrics.macro.recall, r.trainMetrics.macro.f1];
  const testVals  = [r.metrics.accuracy,      r.metrics.macro.precision,      r.metrics.macro.recall,      r.metrics.macro.f1];

  metrics4compare.forEach(({label, trainFm, testFm}, mi) => {
    let trainCell, testCell, gapCell;
    if (fm) {
      trainCell = fc(trainFm);
      testCell  = fc(testFm);
      gapCell   = fc(`${trainFm}-${testFm}`);
    } else {
      trainCell = n8(trainVals[mi]);
      testCell  = n8(testVals[mi]);
      gapCell   = n8(trainVals[mi] - testVals[mi]);
    }
    const gap = trainVals[mi] - testVals[mi];
    const interp = gap > 0.15 ? 'Kemungkinan Overfitting' : gap < -0.05 ? 'Periksa data' : 'Generalisasi baik';
    rows.push([label, trainCell, testCell, gapCell, interp]);
  });

  rows.push([]);
  rows.push(['Catatan: Gap > 15% → kemungkinan overfitting. Gap ≈ 0 → model generalisasi dengan baik.']);

  addWS(WB, aoaToWS(rows), SN);
}