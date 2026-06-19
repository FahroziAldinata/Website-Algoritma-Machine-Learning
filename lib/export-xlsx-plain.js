/* ============================================
   SPK MODULES — export-xlsx-plain.js
   Export hasil SPK ke file .xlsx dengan:
   - Sheet 1: Dataset asli
   - Sheet 2: Matriks normalisasi + perhitungan
   - Sheet 3: Ranking final
   Semua nilai plain text / angka biasa,
   TANPA formula Excel, TANPA styling kompleks.
   Dependensi: SheetJS (xlsx.full.min.js)
   ============================================ */

   'use strict';

   /**
    * Export hasil SPK ke Excel plain (tanpa formula).
    * @param {Object} R - payload lengkap dari sessionStorage (sama seperti exportXLSX)
    */
   function exportXLSXPlain(R) {
     if (typeof XLSX === 'undefined') {
       if (window.Toast) window.Toast.show('Library SheetJS belum dimuat. Tidak dapat export.');
       return;
     }
   
     try {
       const wb = XLSX.utils.book_new();
       const METHOD_LABELS = { saw: 'SAW', topsis: 'TOPSIS', waspas: 'WASPAS', moora: 'MOORA', edas: 'EDAS' };
   
       // ── Sheet 1: Dataset Asli ──
       const ws1 = buildPlainSheet1(R);
       XLSX.utils.book_append_sheet(wb, ws1, '1. Dataset');
   
       // ── Sheet 2: Perhitungan ──
       const ws2 = buildPlainSheet2(R);
       XLSX.utils.book_append_sheet(wb, ws2, '2. Perhitungan');
   
       // ── Sheet 3: Ranking ──
       const ws3 = buildPlainSheet3(R);
       XLSX.utils.book_append_sheet(wb, ws3, '3. Ranking');
   
       const fileName = `SPK_${METHOD_LABELS[R.method] || R.method.toUpperCase()}_${R.fileName || 'hasil'}_plain.xlsx`;
       XLSX.writeFile(wb, fileName);
   
       if (window.Toast) window.Toast.show('✓ File Excel (plain) berhasil diunduh.');
     } catch (err) {
       console.error('Export plain XLSX error:', err);
       if (window.Toast) window.Toast.show('Gagal export: ' + err.message);
     }
   }
   
   
   /* ══════════════════════════════════════════
      HELPER — ambil matrix numerik dari rawData
   ══════════════════════════════════════════ */
   function _plainGetMatrix(R) {
     const { rawData, labelCol, selectedCols } = R;
     const headers  = rawData[0];
     const dataRows = rawData.slice(1);
     const labelIdx = headers.indexOf(labelCol);
     const labels   = dataRows.map((r, i) => labelIdx >= 0 ? String(r[labelIdx]) : `A${i + 1}`);
     const matrix   = dataRows.map(row =>
       selectedCols.map(col => parseFloat(row[headers.indexOf(col)]) || 0)
     );
     return { labels, matrix };
   }
   
   
   /* ══════════════════════════════════════════
      SHEET 1 — DATASET ASLI
      Kolom: Label | Kriteria1 | Kriteria2 | ...
      Baris info: bobot (%), tipe (Benefit/Cost)
   ══════════════════════════════════════════ */
   function buildPlainSheet1(R) {
     const { rawData, labelCol, selectedCols, criteriaTypes, weights } = R;
     const headers  = rawData[0];
     const dataRows = rawData.slice(1);
     const labelIdx = headers.indexOf(labelCol);
   
     const aoa = [];
   
     // ── Judul section ──
     aoa.push(['DATASET ASLI']);
     aoa.push([]); // baris kosong
   
     // ── Baris bobot ──
     aoa.push([
       'Bobot →',
       ...selectedCols.map(col => {
         const w = weights[col] || 0;
         return parseFloat((w * 100).toFixed(2)) + '%';
       }),
     ]);
   
     // ── Baris tipe ──
     aoa.push([
       'Tipe →',
       ...selectedCols.map(col =>
         (criteriaTypes[col] || 'benefit') === 'benefit' ? 'Benefit (+)' : 'Cost (-)'
       ),
     ]);
   
     // ── Header kolom ──
     aoa.push([labelCol, ...selectedCols]);
   
     // ── Baris data ──
     dataRows.forEach((row, i) => {
       const label = labelIdx >= 0 ? row[labelIdx] : `A${i + 1}`;
       const vals  = selectedCols.map(col => parseFloat(row[headers.indexOf(col)]) || 0);
       aoa.push([label, ...vals]);
     });
   
     const ws = XLSX.utils.aoa_to_sheet(aoa);
     _setColWidths(ws, selectedCols.length + 1);
     return ws;
   }
   
   
   /* ══════════════════════════════════════════
      SHEET 2 — PERHITUNGAN PER METODE
      Semua nilai langsung (angka), tanpa formula
   ══════════════════════════════════════════ */
   function buildPlainSheet2(R) {
     const builders = {
       saw:    _plainCalcSAW,
       topsis: _plainCalcTOPSIS,
       waspas: _plainCalcWASPAS,
       moora:  _plainCalcMOORA,
       edas:   _plainCalcEDAS,
     };
   
     const builder = builders[R.method];
     if (!builder) return XLSX.utils.aoa_to_sheet([['Metode tidak dikenal.']]);
   
     const aoa = builder(R);
     const ws  = XLSX.utils.aoa_to_sheet(aoa);
     _setColWidths(ws, R.selectedCols.length + 3);
     return ws;
   }
   
   
   /* ──────────────────────────────────────────
      Helper: tambahkan blok tabel ke aoa
      Mengembalikan aoa yang sudah ditambah
   ────────────────────────────────────────── */
   function _addBlock(aoa, title, desc, headerRow, dataRows) {
     aoa.push([title]);
     if (desc) aoa.push([desc]);
     aoa.push(headerRow);
     dataRows.forEach(row => aoa.push(row));
     aoa.push([]); // baris kosong pemisah
     return aoa;
   }
   
   
   /* ── SAW ── */
   function _plainCalcSAW(R) {
     const { selectedCols, criteriaTypes, weights } = R;
     const { labels, matrix } = _plainGetMatrix(R);
     const m = matrix.length;
     const n = selectedCols.length;
     const aoa = [];
   
     // Tahap 1: Matriks asli
     _addBlock(aoa,
       'TAHAP 1 — Matriks Keputusan Awal (X)',
       'Nilai asli setiap alternatif pada setiap kriteria.',
       ['Alternatif', ...selectedCols],
       labels.map((lbl, i) => [lbl, ...matrix[i]])
     );
   
     // Tahap 2: Normalisasi
     const normalized = matrix.map(row => row.slice());
     for (let j = 0; j < n; j++) {
       const vals = matrix.map(r => r[j]);
       const max  = Math.max(...vals);
       const min  = Math.min(...vals);
       const type = criteriaTypes[selectedCols[j]] || 'benefit';
       for (let i = 0; i < m; i++) {
         normalized[i][j] = type === 'benefit'
           ? (max === 0 ? 0 : matrix[i][j] / max)
           : (matrix[i][j] === 0 ? 0 : min / matrix[i][j]);
       }
     }
   
     _addBlock(aoa,
       'TAHAP 2 — Normalisasi Linear (r)',
       'Benefit: r = x / MAX(kolom) | Cost: r = MIN(kolom) / x',
       ['Alternatif', ...selectedCols],
       labels.map((lbl, i) => [lbl, ...normalized[i].map(v => _round(v))])
     );
   
     // Tahap 3: Skor akhir
     const scores = matrix.map((_, i) =>
       selectedCols.reduce((s, col, j) => s + (weights[col] || 0) * normalized[i][j], 0)
     );
     const ranked = labels
       .map((lbl, i) => ({ lbl, score: scores[i] }))
       .sort((a, b) => b.score - a.score)
       .map((item, ri) => ({ ...item, rank: ri + 1 }));
   
     _addBlock(aoa,
       'TAHAP 3 — Skor Akhir SAW (V)',
       'V = Σ (wj × rij) | Semakin besar V semakin baik.',
       ['Rank', 'Alternatif', 'Skor V'],
       ranked.map(item => [item.rank, item.lbl, _round(item.score)])
     );
   
     return aoa;
   }
   
   
   /* ── TOPSIS ── */
   function _plainCalcTOPSIS(R) {
     const { selectedCols, criteriaTypes, weights } = R;
     const { labels, matrix } = _plainGetMatrix(R);
     const m = matrix.length;
     const n = selectedCols.length;
     const aoa = [];
   
     // Tahap 1
     _addBlock(aoa,
       'TAHAP 1 — Matriks Keputusan Awal',
       null,
       ['Alternatif', ...selectedCols],
       labels.map((lbl, i) => [lbl, ...matrix[i]])
     );
   
     // Tahap 2: Normalisasi vektor
     const norm = matrix.map(r => r.slice());
     for (let j = 0; j < n; j++) {
       const d = Math.sqrt(matrix.reduce((s, r) => s + r[j] ** 2, 0));
       for (let i = 0; i < m; i++) norm[i][j] = d === 0 ? 0 : matrix[i][j] / d;
     }
     _addBlock(aoa,
       'TAHAP 2 — Normalisasi Vektor (r)',
       'rij = xij / SQRT(SUM(xij^2))',
       ['Alternatif', ...selectedCols],
       labels.map((lbl, i) => [lbl, ...norm[i].map(v => _round(v))])
     );
   
     // Tahap 3: Weighted
     const weighted = norm.map(row => row.map((v, j) => v * (weights[selectedCols[j]] || 0)));
     _addBlock(aoa,
       'TAHAP 3 — Matriks Ternormalisasi Terbobot (v)',
       'vij = wj x rij',
       ['Alternatif', ...selectedCols],
       labels.map((lbl, i) => [lbl, ...weighted[i].map(v => _round(v))])
     );
   
     // Tahap 4: Ideal
     const idealPos = selectedCols.map((col, j) => {
       const vals = weighted.map(r => r[j]);
       return (criteriaTypes[col] || 'benefit') === 'benefit' ? Math.max(...vals) : Math.min(...vals);
     });
     const idealNeg = selectedCols.map((col, j) => {
       const vals = weighted.map(r => r[j]);
       return (criteriaTypes[col] || 'benefit') === 'benefit' ? Math.min(...vals) : Math.max(...vals);
     });
     _addBlock(aoa,
       'TAHAP 4 — Solusi Ideal Positif (A+) dan Negatif (A-)',
       'A+: MAX untuk Benefit, MIN untuk Cost | A-: sebaliknya',
       ['Solusi', ...selectedCols],
       [
         ['A+ (Ideal Positif)', ...idealPos.map(v => _round(v))],
         ['A- (Ideal Negatif)', ...idealNeg.map(v => _round(v))],
       ]
     );
   
     // Tahap 5: Jarak
     const dPos = weighted.map(row => Math.sqrt(row.reduce((s, v, j) => s + (v - idealPos[j]) ** 2, 0)));
     const dNeg = weighted.map(row => Math.sqrt(row.reduce((s, v, j) => s + (v - idealNeg[j]) ** 2, 0)));
     _addBlock(aoa,
       'TAHAP 5 — Jarak Euclidean (D+ dan D-)',
       'D+ = SQRT(SUM((vij - A+j)^2)) | D- = SQRT(SUM((vij - A-j)^2))',
       ['Alternatif', 'D+ (ke ideal positif)', 'D- (ke ideal negatif)'],
       labels.map((lbl, i) => [lbl, _round(dPos[i]), _round(dNeg[i])])
     );
   
     // Tahap 6: CC
     const scores = dPos.map((dp, i) => (dp + dNeg[i]) === 0 ? 0 : dNeg[i] / (dp + dNeg[i]));
     const ranked = labels
       .map((lbl, i) => ({ lbl, score: scores[i], dPos: dPos[i], dNeg: dNeg[i] }))
       .sort((a, b) => b.score - a.score)
       .map((item, ri) => ({ ...item, rank: ri + 1 }));
   
     _addBlock(aoa,
       'TAHAP 6 — Closeness Coefficient (CC)',
       'CCi = D- / (D+ + D-) | Mendekati 1 = terbaik',
       ['Rank', 'Alternatif', 'D+', 'D-', 'CC (Skor Akhir)'],
       ranked.map(item => [item.rank, item.lbl, _round(item.dPos), _round(item.dNeg), _round(item.score)])
     );
   
     return aoa;
   }
   
   
   /* ── WASPAS ── */
   function _plainCalcWASPAS(R) {
     const { selectedCols, criteriaTypes, weights, lambda } = R;
     const { labels, matrix } = _plainGetMatrix(R);
     const m   = matrix.length;
     const n   = selectedCols.length;
     const lam = lambda ?? 0.5;
     const aoa = [];
   
     // Tahap 1
     _addBlock(aoa,
       'TAHAP 1 — Matriks Keputusan Awal',
       null,
       ['Alternatif', ...selectedCols],
       labels.map((lbl, i) => [lbl, ...matrix[i]])
     );
   
     // Normalisasi
     const normalized = matrix.map(r => r.slice());
     for (let j = 0; j < n; j++) {
       const vals = matrix.map(r => r[j]);
       const max  = Math.max(...vals);
       const min  = Math.min(...vals);
       const type = criteriaTypes[selectedCols[j]] || 'benefit';
       for (let i = 0; i < m; i++) {
         normalized[i][j] = type === 'benefit'
           ? (max === 0 ? 0 : matrix[i][j] / max)
           : (matrix[i][j] === 0 ? 0 : min / matrix[i][j]);
       }
     }
     _addBlock(aoa,
       'TAHAP 2 — Normalisasi Linear (r)',
       'Benefit: r = x/MAX | Cost: r = MIN/x',
       ['Alternatif', ...selectedCols],
       labels.map((lbl, i) => [lbl, ...normalized[i].map(v => _round(v))])
     );
   
     // WSM
     const wsm = matrix.map((_, i) =>
       selectedCols.reduce((s, col, j) => s + (weights[col] || 0) * normalized[i][j], 0)
     );
     _addBlock(aoa,
       'TAHAP 3 — Weighted Sum Model (Q1)',
       'Q1 = SUM(wj x rij)',
       ['Alternatif', 'Q1 (WSM Score)'],
       labels.map((lbl, i) => [lbl, _round(wsm[i])])
     );
   
     // WPM
     const wpm = matrix.map((_, i) =>
       selectedCols.reduce((p, col, j) => p * (normalized[i][j] ** (weights[col] || 0)), 1)
     );
     _addBlock(aoa,
       'TAHAP 4 — Weighted Product Model (Q2)',
       'Q2 = PRODUCT(rij ^ wj)',
       ['Alternatif', 'Q2 (WPM Score)'],
       labels.map((lbl, i) => [lbl, _round(wpm[i])])
     );
   
     // Skor akhir
     const scores = wsm.map((w, i) => lam * w + (1 - lam) * wpm[i]);
     const ranked = labels
       .map((lbl, i) => ({ lbl, score: scores[i], wsm: wsm[i], wpm: wpm[i] }))
       .sort((a, b) => b.score - a.score)
       .map((item, ri) => ({ ...item, rank: ri + 1 }));
   
     _addBlock(aoa,
       `TAHAP 5 — Skor Akhir WASPAS (lambda=${lam})`,
       `Q = lambda x Q1 + (1-lambda) x Q2 | lambda=${lam}`,
       ['Rank', 'Alternatif', 'Q1 (WSM)', 'Q2 (WPM)', `Skor Q (lambda=${lam})`],
       ranked.map(item => [item.rank, item.lbl, _round(item.wsm), _round(item.wpm), _round(item.score)])
     );
   
     return aoa;
   }
   
   
   /* ── MOORA ── */
   function _plainCalcMOORA(R) {
     const { selectedCols, criteriaTypes, weights } = R;
     const { labels, matrix } = _plainGetMatrix(R);
     const m = matrix.length;
     const n = selectedCols.length;
     const aoa = [];
   
     _addBlock(aoa,
       'TAHAP 1 — Matriks Keputusan Awal',
       null,
       ['Alternatif', ...selectedCols],
       labels.map((lbl, i) => [lbl, ...matrix[i]])
     );
   
     // Normalisasi vektor
     const norm = matrix.map(r => r.slice());
     for (let j = 0; j < n; j++) {
       const d = Math.sqrt(matrix.reduce((s, r) => s + r[j] ** 2, 0));
       for (let i = 0; i < m; i++) norm[i][j] = d === 0 ? 0 : matrix[i][j] / d;
     }
     _addBlock(aoa,
       'TAHAP 2 — Normalisasi Vektor Rasio',
       'x*ij = xij / SQRT(SUM(xij^2))',
       ['Alternatif', ...selectedCols],
       labels.map((lbl, i) => [lbl, ...norm[i].map(v => _round(v))])
     );
   
     // Weighted
     const weighted = norm.map(row => row.map((v, j) => v * (weights[selectedCols[j]] || 0)));
     _addBlock(aoa,
       'TAHAP 3 — Matriks Ternormalisasi Terbobot',
       'wj x x*ij',
       ['Alternatif', ...selectedCols],
       labels.map((lbl, i) => [lbl, ...weighted[i].map(v => _round(v))])
     );
   
     // Yi
     const scores = weighted.map(row =>
       selectedCols.reduce((s, col, j) =>
         (criteriaTypes[col] || 'benefit') === 'benefit' ? s + row[j] : s - row[j], 0)
     );
     const ranked = labels
       .map((lbl, i) => ({ lbl, score: scores[i] }))
       .sort((a, b) => b.score - a.score)
       .map((item, ri) => ({ ...item, rank: ri + 1 }));
   
     _addBlock(aoa,
       'TAHAP 4 — Skor Yi (Ratio System)',
       'Yi = SUM(wj x x*ij) [Benefit] - SUM(wj x x*ij) [Cost]',
       ['Rank', 'Alternatif', 'Skor Yi'],
       ranked.map(item => [item.rank, item.lbl, _round(item.score)])
     );
   
     return aoa;
   }
   
   
   /* ── EDAS ── */
   function _plainCalcEDAS(R) {
     const { selectedCols, criteriaTypes, weights } = R;
     const { labels, matrix } = _plainGetMatrix(R);
     const m = matrix.length;
     const aoa = [];
   
     // Avg solution
     const avg = selectedCols.map((_, j) => matrix.reduce((s, r) => s + r[j], 0) / m);
   
     _addBlock(aoa,
       'TAHAP 1 — Matriks Keputusan & Rata-rata Solusi (AV)',
       'AVj = (1/n) x SUM(xij)',
       ['Alternatif', ...selectedCols],
       [
         ...labels.map((lbl, i) => [lbl, ...matrix[i]]),
         ['Rata-rata (AV)', ...avg.map(v => _round(v))],
       ]
     );
   
     // PDA
     const PDA = matrix.map(row =>
       selectedCols.map((col, j) => {
         const type = criteriaTypes[col] || 'benefit';
         const diff = type === 'benefit'
           ? Math.max(0, row[j] - avg[j])
           : Math.max(0, avg[j] - row[j]);
         return avg[j] === 0 ? 0 : diff / avg[j];
       })
     );
     _addBlock(aoa,
       'TAHAP 2 — Positive Distance from Average (PDA)',
       'Benefit: MAX(0, xij-AVj)/AVj | Cost: MAX(0, AVj-xij)/AVj',
       ['Alternatif', ...selectedCols],
       labels.map((lbl, i) => [lbl, ...PDA[i].map(v => _round(v))])
     );
   
     // NDA
     const NDA = matrix.map(row =>
       selectedCols.map((col, j) => {
         const type = criteriaTypes[col] || 'benefit';
         const diff = type === 'benefit'
           ? Math.max(0, avg[j] - row[j])
           : Math.max(0, row[j] - avg[j]);
         return avg[j] === 0 ? 0 : diff / avg[j];
       })
     );
     _addBlock(aoa,
       'TAHAP 3 — Negative Distance from Average (NDA)',
       'Benefit: MAX(0, AVj-xij)/AVj | Cost: MAX(0, xij-AVj)/AVj',
       ['Alternatif', ...selectedCols],
       labels.map((lbl, i) => [lbl, ...NDA[i].map(v => _round(v))])
     );
   
     // SP, SN, NSP, NSN, AS
     const SP   = PDA.map(row => selectedCols.reduce((s, col, j) => s + (weights[col] || 0) * row[j], 0));
     const SN   = NDA.map(row => selectedCols.reduce((s, col, j) => s + (weights[col] || 0) * row[j], 0));
     const mxSP = Math.max(...SP);
     const mxSN = Math.max(...SN);
     const NSP  = SP.map(v => mxSP === 0 ? 0 : v / mxSP);
     const NSN  = SN.map(v => mxSN === 0 ? 1 : 1 - v / mxSN);
     const scores = NSP.map((v, i) => 0.5 * (v + NSN[i]));
     const ranked = labels
       .map((lbl, i) => ({ lbl, score: scores[i], SP: SP[i], SN: SN[i], NSP: NSP[i], NSN: NSN[i] }))
       .sort((a, b) => b.score - a.score)
       .map((item, ri) => ({ ...item, rank: ri + 1 }));
   
     _addBlock(aoa,
       'TAHAP 4 — Appraisal Score (AS)',
       'SP=SUM(wj*PDA) | SN=SUM(wj*NDA) | NSP=SP/max(SP) | NSN=1-SN/max(SN) | AS=0.5*(NSP+NSN)',
       ['Rank', 'Alternatif', 'SP', 'SN', 'NSP', 'NSN', 'AS (Skor Akhir)'],
       ranked.map(item => [
         item.rank, item.lbl,
         _round(item.SP), _round(item.SN),
         _round(item.NSP), _round(item.NSN),
         _round(item.score),
       ])
     );
   
     return aoa;
   }
   
   
   /* ══════════════════════════════════════════
      SHEET 3 — RANKING FINAL
   ══════════════════════════════════════════ */
   function buildPlainSheet3(R) {
     const { result, method, weightMethod, selectedCols, weights, criteriaTypes, lambda } = R;
     const ranked = result.ranked;
     const METHOD_LABELS = { saw: 'SAW', topsis: 'TOPSIS', waspas: 'WASPAS', moora: 'MOORA', edas: 'EDAS' };
     const aoa = [];
   
     // Info konfigurasi
     aoa.push(['KONFIGURASI ANALISIS']);
     aoa.push(['Metode SPK',       METHOD_LABELS[method] || method.toUpperCase()]);
     aoa.push(['Pembobotan',       weightMethod]);
     aoa.push(['Jumlah Kriteria',  selectedCols.length]);
     aoa.push(['Jumlah Alternatif', ranked.length]);
     if (method === 'waspas') aoa.push(['Lambda', lambda ?? 0.5]);
     aoa.push([]);
   
     // Bobot kriteria
     aoa.push(['BOBOT & TIPE KRITERIA']);
     aoa.push(['No', 'Kriteria', 'Tipe', 'Bobot', 'Bobot (%)']);
     selectedCols.forEach((col, idx) => {
       const type = criteriaTypes[col] || 'benefit';
       const w    = weights[col] || 0;
       aoa.push([
         idx + 1,
         col,
         type === 'benefit' ? 'Benefit (+)' : 'Cost (-)',
         _round(w),
         parseFloat((w * 100).toFixed(2)) + '%',
       ]);
     });
     aoa.push([]);
   
     // Ranking final
     aoa.push(['HASIL RANKING FINAL']);
     aoa.push(['Rank', 'Alternatif', 'Skor Akhir', 'Persentil (%)']);
     const maxScore = ranked[0].score;
     ranked.forEach(item => {
       const pct = maxScore > 0 ? (item.score / maxScore * 100) : 0;
       aoa.push([item.rank, item.label, _round(item.score), _round(pct)]);
     });
   
     const ws = XLSX.utils.aoa_to_sheet(aoa);
     _setColWidths(ws, 5);
     return ws;
   }
   
   
   /* ══════════════════════════════════════════
      UTILITIES
   ══════════════════════════════════════════ */
   
   /** Bulatkan ke 6 desimal untuk menghindari floating point noise */
   function _round(v) {
     if (v === null || v === undefined || isNaN(v)) return 0;
     return Math.round(parseFloat(v) * 1000000) / 1000000;
   }
   
   /** Set lebar kolom default agar tidak terlalu sempit */
   function _setColWidths(ws, colCount) {
     ws['!cols'] = [{ wch: 20 }, ...Array(colCount - 1).fill({ wch: 14 })];
   }