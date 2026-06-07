/**
 * km_export.js — Export results for K-Means
 *
 * 2 fungsi export:
 *   exportFormulaXLSX()   → kmeans_formula.xlsx   (formula Excel di semua sheet)
 *   exportPlainTextXLSX() → kmeans_plaintext.xlsx  (semua nilai angka / teks biasa)
 */

'use strict';

/* ============================================================
   HELPER INTERNAL
   ============================================================ */

/** Konversi index kolom 0-based ke huruf Excel (0=A, 25=Z, 26=AA, ...) */
function _colLetter(idx) {
  let letter = '';
  let n = idx;
  do {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}

/** Download file teks */
function downloadText(content, filename, mimeType) {
  const blob = new Blob(['\uFEFF' + content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

function _checkXLSX() {
  if (typeof XLSX === 'undefined') {
    alert('Library XLSX tidak tersedia.');
    return false;
  }
  return true;
}

/* ============================================================
   SHARED — bangun data sheet (dipakai kedua export)
   ============================================================ */

/**
 * Bangun semua konten sheet sebagai object { s1, s2, s3, s4, meta }
 * useFormula: true  → sel berisi { f: '=...' }
 * useFormula: false → sel berisi nilai angka/string biasa
 */
function _buildSheets(R, useFormula) {
  const activeCols  = R.rawHeaders.map((_, i) => i).filter(i => R.selectedCols[i]);
  const featureCols = activeCols.map(i => R.rawHeaders[i]);
  const nF          = featureCols.length;
  const rawNumeric  = R.rawRows.map(row => activeCols.map(ci => parseFloat(row[ci])));
  const nData       = rawNumeric.length;
  const isEuc       = R.distMetric !== 'manhattan';

  /* ── pra-hitung min/max tiap fitur (untuk plain text dan referensi) ── */
  const colMins = featureCols.map((_, fi) => Math.min(...rawNumeric.map(r => r[fi])));
  const colMaxs = featureCols.map((_, fi) => Math.max(...rawNumeric.map(r => r[fi])));

  /* ════════════════════════════════════════════════════════════
     SHEET 1 — DATASET
     Kolom: A=No | B..B+nF-1=Asli | B+nF..=Norm
     Baris Min : ROW_MIN
     Baris Max : ROW_MAX
     ════════════════════════════════════════════════════════════ */
  const S1_ROW_HDR   = 1;
  const S1_ROW_DATA  = 2;
  const S1_ROW_END   = S1_ROW_DATA + nData - 1;
  const S1_ROW_MIN   = S1_ROW_END + 2;
  const S1_ROW_MAX   = S1_ROW_MIN + 1;
  const S1_COL_RAW   = 1;          // 0-based: B
  const S1_COL_NORM  = 1 + nF;     // 0-based: B+nF

  const s1 = [];

  // Header
  s1.push([
    'No',
    ...featureCols.map(f => `${f} (Asli)`),
    ...featureCols.map(f => `${f} (Norm)`),
  ]);

  // Baris data
  rawNumeric.forEach((row, ri) => {
    const excelRow = S1_ROW_DATA + ri;
    const normVals = featureCols.map((_, fi) => {
      const mn = colMins[fi], mx = colMaxs[fi];
      if (useFormula) {
        const rawCol  = _colLetter(S1_COL_RAW + fi);
        const minCell = `$${rawCol}$${S1_ROW_MIN}`;
        const maxCell = `$${rawCol}$${S1_ROW_MAX}`;
        const xCell   = `${rawCol}${excelRow}`;
        return { f: `=IF(${maxCell}-${minCell}=0,0,(${xCell}-${minCell})/(${maxCell}-${minCell}))` };
      }
      return mx === mn ? 0 : parseFloat(fmt((row[fi] - mn) / (mx - mn)));
    });
    s1.push([ri + 1, ...row.map(v => parseFloat(fmtShort(v))), ...normVals]);
  });

  // Baris kosong
  s1.push([]);

  // Baris Min
  s1.push([
    'Min',
    ...featureCols.map((_, fi) => {
      if (useFormula) {
        const c = _colLetter(S1_COL_RAW + fi);
        return { f: `=MIN(${c}${S1_ROW_DATA}:${c}${S1_ROW_END})` };
      }
      return parseFloat(fmtShort(colMins[fi]));
    }),
    ...featureCols.map(() => 0),
  ]);

  // Baris Max
  s1.push([
    'Max',
    ...featureCols.map((_, fi) => {
      if (useFormula) {
        const c = _colLetter(S1_COL_RAW + fi);
        return { f: `=MAX(${c}${S1_ROW_DATA}:${c}${S1_ROW_END})` };
      }
      return parseFloat(fmtShort(colMaxs[fi]));
    }),
    ...featureCols.map(() => 1),
  ]);

  // Keterangan rumus
  s1.push([
    'Rumus Norm',
    ...featureCols.map(() => ''),
    ...featureCols.map((_, fi) => {
      const rc = _colLetter(S1_COL_RAW + fi);
      return `=(${rc}n - $${rc}$${S1_ROW_MIN}) / ($${rc}$${S1_ROW_MAX} - $${rc}$${S1_ROW_MIN})`;
    }),
  ]);

  /* ════════════════════════════════════════════════════════════
     SHEET 2 — PERHITUNGAN JARAK (semua iterasi)

     Layout per iterasi (blok):
       Baris judul      : "ITERASI n"  |  |  | "Konvergen: ..."
       Baris centroid   : "C1 = [...]"
       Baris header     : No | F1..Fn | JrkC1 | JrkC2.. | Cluster
       Baris data       : angka / formula jarak
       Baris update     : "C1 baru" | nilai centroid baru
       2 baris kosong

     Untuk formula Euclidean per baris data ri ke centroid ki:
       =SQRT( (Fx - Ckx)^2 + ... )   dimana Fx = sel fitur baris ini, Ckx = nilai centroid (hardcode angka)

     Untuk manhattan:
       =ABS(Fx-Ckx) + ABS(Fy-Cky) + ...

     Assignment (formula):
       =IF(MIN(JrkC1,JrkC2,...)=JrkCx, "Cluster x", ...)  — nested IF

     Update centroid (formula):
       =IFERROR(AVERAGEIF(ClusterCol, "Cluster ki", FiturCol), centroid_lama)
     ════════════════════════════════════════════════════════════ */
  const s2 = [];

  // Rekam posisi baris tiap blok iterasi untuk keperluan referensi silang
  // (tidak perlu cross-ref antar iterasi, cukup dalam blok sendiri)

  R.iterations.forEach(it => {
    const blockStart = s2.length + 1; // baris Excel saat blok ini dimulai (1-indexed)

    // ── Judul iterasi ──
    s2.push([
      `ITERASI ${it.iter}`,
      ...Array(nF - 1).fill(''),
      '',
      `Konvergen: ${it.converged ? 'Ya' : 'Tidak'}`,
    ]);

    // ── Info centroid awal ──
    it.centroidsOld.forEach((c, ki) => {
      s2.push([`C${ki + 1} = [${c.map(fmt).join(', ')}]`]);
    });
    s2.push([]); // spasi

    // ── Header kolom data ──
    // Kolom: A=No | B..=Fitur | lalu JrkC1, JrkC2,... | Cluster
    // Index kolom 0-based:
    const S2_COL_NO    = 0;                  // A
    const S2_COL_F     = 1;                  // B..B+nF-1
    const S2_COL_JRK   = 1 + nF;            // B+nF .. B+nF+K-1
    const S2_COL_CLS   = 1 + nF + R.K;      // kolom Cluster

    s2.push([
      'No',
      ...R.featureNames,
      ...Array.from({ length: R.K }, (_, ki) => `Jarak ke C${ki + 1}`),
      'Cluster',
    ]);

    const headerExcelRow = s2.length; // baris Excel header (1-indexed)
    const dataStartRow   = headerExcelRow + 1;

    // ── Baris data ──
    R.data.forEach((row, ri) => {
      const excelRow = dataStartRow + ri;

      // Sel fitur (selalu angka)
      const featVals = row.map(v => parseFloat(fmt(v)));

      // Sel jarak
      const jrkVals = it.centroidsOld.map((c, ki) => {
        if (!useFormula) {
          const d = window._buildDistDetail(row, c, R.distMetric, R.featureNames);
          return parseFloat(fmt(d.result));
        }
        // Formula jarak
        const terms = R.featureNames.map((_, fi) => {
          const fCol = _colLetter(S2_COL_F + fi);
          const cv   = parseFloat(fmt(c[fi]));
          return isEuc
            ? `(${fCol}${excelRow}-${cv})^2`
            : `ABS(${fCol}${excelRow}-${cv})`;
        });
        return isEuc
          ? { f: `=SQRT(${terms.join('+')})` }
          : { f: `=${terms.join('+')}` };
      });

      // Sel Cluster
      let clsVal;
      if (!useFormula) {
        clsVal = `Cluster ${it.labels[ri] + 1}`;
      } else {
        // =IF(jrkC1=MIN(jrkC1..CK),"Cluster 1",IF(jrkC2=MIN(...),"Cluster 2",...))
        const minFormula = `MIN(${Array.from({ length: R.K }, (_, ki) => {
          return _colLetter(S2_COL_JRK + ki) + excelRow;
        }).join(',')})`;

        let nested = `"Cluster ${R.K}"`;
        for (let ki = R.K - 2; ki >= 0; ki--) {
          const jrkCell = _colLetter(S2_COL_JRK + ki) + excelRow;
          nested = `IF(${jrkCell}=${minFormula},"Cluster ${ki + 1}",${nested})`;
        }
        clsVal = { f: `=${nested}` };
      }

      s2.push([ri + 1, ...featVals, ...jrkVals, clsVal]);
    });

    // ── Update centroid baru ──
    s2.push([]);
    s2.push(['Update Centroid:']);

    const clsColLetter = _colLetter(S2_COL_CLS);
    const featColStart = S2_COL_F;

    it.centroidsNew.forEach((c, ki) => {
      const changed = !it.centroidsOld[ki].every((v, i) => Math.abs(v - c[i]) < 1e-9);
      const newVals = c.map((v, fi) => {
        if (!useFormula) return parseFloat(fmt(v));
        // =IFERROR(AVERAGEIF(ClusterCol, "Cluster ki+1", FiturCol), nilai_lama)
        const fCol    = _colLetter(featColStart + fi);
        const clsRange = `${clsColLetter}${dataStartRow}:${clsColLetter}${dataStartRow + nData - 1}`;
        const fRange   = `${fCol}${dataStartRow}:${fCol}${dataStartRow + nData - 1}`;
        const fallback = parseFloat(fmt(it.centroidsOld[ki][fi]));
        return { f: `=IFERROR(AVERAGEIF(${clsRange},"Cluster ${ki + 1}",${fRange}),${fallback})` };
      });
      s2.push([
        `C${ki + 1} baru`,
        ...newVals,
        ...Array(R.K).fill(''),
        changed ? 'berubah' : 'tetap',
      ]);
    });

    // Spasi antar iterasi
    s2.push([]);
    s2.push([]);
  });

  /* ════════════════════════════════════════════════════════════
     SHEET 3 — HASIL CLUSTERING
     Kolom: A=No | B..=Fitur(Norm) | Cluster | Centroid...
     Ringkasan di bawah: AVERAGEIF / MINIFS / MAXIFS / COUNTIF / SUMIF
     ════════════════════════════════════════════════════════════ */
  const s3 = [];

  // Header
  s3.push([
    'No',
    ...R.featureNames.map(f => `${f} (Norm)`),
    'Cluster',
    ...R.featureNames.map(f => `Centroid_${f}`),
  ]);

  const S3_ROW_HDR    = 1;
  const S3_ROW_DATA   = 2;
  const S3_ROW_END    = S3_ROW_DATA + nData - 1;
  const S3_COL_NO     = 0;   // A
  const S3_COL_F      = 1;   // B..
  const S3_COL_CLS    = 1 + nF;             // kolom Cluster
  const S3_COL_CENT   = 1 + nF + 1;         // kolom Centroid mulai
  const clsColS3      = _colLetter(S3_COL_CLS);
  const clsRangeS3    = `${clsColS3}${S3_ROW_DATA}:${clsColS3}${S3_ROW_END}`;

  // Baris data
  R.data.forEach((row, ri) => {
    const label    = R.finalLabels[ri];
    const centroid = R.finalCentroids[label];
    s3.push([
      ri + 1,
      ...row.map(v => parseFloat(fmt(v))),
      `Cluster ${label + 1}`,
      ...centroid.map(v => parseFloat(fmt(v))),
    ]);
  });

  // Spasi + judul ringkasan
  s3.push([]);
  s3.push(['RINGKASAN PER CLUSTER']);

  // Header ringkasan
  s3.push([
    'Cluster',
    ...R.featureNames.map(f => `Mean_${f}`),
    ...R.featureNames.map(f => `Min_${f}`),
    ...R.featureNames.map(f => `Max_${f}`),
    'Jumlah Data',
    'SSE',
  ]);

  const S3_SUMM_DATA_START = s3.length + 1; // baris Excel baris pertama ringkasan

  R.clusterSummary.forEach((c, ki) => {
    const clsLabel = `Cluster ${c.clusterIdx + 1}`;

    const meanVals = R.featureNames.map((_, fi) => {
      if (!useFormula) return parseFloat(fmt(c.stats[fi].mean));
      const fCol = _colLetter(S3_COL_F + fi);
      return { f: `=IFERROR(AVERAGEIF(${clsRangeS3},"${clsLabel}",${fCol}${S3_ROW_DATA}:${fCol}${S3_ROW_END}),0)` };
    });

    const minVals = R.featureNames.map((_, fi) => {
      if (!useFormula) return parseFloat(fmt(c.stats[fi].min));
      const fCol = _colLetter(S3_COL_F + fi);
      return { f: `=IFERROR(MINIFS(${fCol}${S3_ROW_DATA}:${fCol}${S3_ROW_END},${clsRangeS3},"${clsLabel}"),0)` };
    });

    const maxVals = R.featureNames.map((_, fi) => {
      if (!useFormula) return parseFloat(fmt(c.stats[fi].max));
      const fCol = _colLetter(S3_COL_F + fi);
      return { f: `=IFERROR(MAXIFS(${fCol}${S3_ROW_DATA}:${fCol}${S3_ROW_END},${clsRangeS3},"${clsLabel}"),0)` };
    });

    const countVal = useFormula
      ? { f: `=COUNTIF(${clsRangeS3},"${clsLabel}")` }
      : c.count;

    // SSE = SUMPRODUCT dari jarak kuadrat ke centroid — disederhanakan per fitur
    // SSE = Σ [ (fi - centroid_fi)^2 + ... ] untuk anggota cluster ini
    // Pakai formula array: =SUMPRODUCT((ClsRange="Cluster x")*((F1-c1)^2+(F2-c2)^2+...))
    let sseVal;
    if (!useFormula) {
      sseVal = parseFloat(fmtShort(c.sse));
    } else {
      const cond = `(${clsRangeS3}="${clsLabel}")`;
      const squaredTerms = R.featureNames.map((_, fi) => {
        const fCol = _colLetter(S3_COL_F + fi);
        const cv   = parseFloat(fmt(c.centroid[fi]));
        return `(${fCol}${S3_ROW_DATA}:${fCol}${S3_ROW_END}-${cv})^2`;
      });
      sseVal = { f: `=SUMPRODUCT(${cond}*(${squaredTerms.join('+')}))` };
    }

    s3.push([clsLabel, ...meanVals, ...minVals, ...maxVals, countVal, sseVal]);
  });

  /* ════════════════════════════════════════════════════════════
     SHEET 4 — EVALUASI METRIK
     SSE, Silhouette, Davies-Bouldin, Distribusi

     Formula: referensi ke Sheet 3 ringkasan untuk SSE dan Jumlah Data
     Silhouette & DB: dihitung JS (tidak bisa direpresentasikan formula
     sederhana Excel), nilainya ditulis sebagai angka di kedua mode.
     ════════════════════════════════════════════════════════════ */
  const silAvg        = computeSilhouette(R.data, R.finalLabels, R.K, R.distMetric);
  const silPerCluster = computeSilhouettePerCluster(R.data, R.finalLabels, R.K, R.distMetric);
  const dbIndex       = computeDaviesBouldin(R.data, R.finalLabels, R.finalCentroids, R.K, R.distMetric);

  const interpSil = (v) => {
    if (v === null || v === undefined) return '-';
    if (v >= 0.71) return 'Struktur kuat';
    if (v >= 0.51) return 'Struktur wajar';
    if (v >= 0.26) return 'Struktur lemah';
    return 'Tidak terstruktur';
  };

  // Posisi baris ringkasan Sheet 3 untuk referensi
  // Baris ringkasan cluster di Sheet 3 = S3_SUMM_DATA_START .. +K-1
  // Kolom Jumlah Data di Sheet 3 ringkasan = kolom (1 + 3*nF + 1) = S3_COL_SUMM_COUNT
  const S3_COL_SUMM_COUNT = 1 + 3 * nF + 1; // 0-based
  const S3_COL_SUMM_SSE   = S3_COL_SUMM_COUNT + 1;

  const s4 = [];

  s4.push(['EVALUASI METRIK K-MEANS']);
  s4.push([]);

  // 1. SSE
  s4.push(['1. SSE / INERTIA']);
  s4.push(['Metrik', 'Nilai', 'Keterangan']);

  const sseTotalVal = useFormula
    ? { f: `=SUM(${_colLetter(S3_COL_SUMM_SSE)}${S3_SUMM_DATA_START}:${_colLetter(S3_COL_SUMM_SSE)}${S3_SUMM_DATA_START + R.K - 1})` }
    : parseFloat(fmtShort(R.sse));

  // Catatan: formula referensi sheet lain di SheetJS menggunakan prefix nama sheet
  // Namun karena SheetJS aoa_to_sheet tidak support cross-sheet formula dengan mudah,
  // untuk SSE kita pakai nilai langsung (formula sumproduct sudah ada di Sheet 3)
  s4.push([
    'SSE Total',
    parseFloat(fmtShort(R.sse)),
    'Semakin kecil semakin baik. Mengukur kepadatan anggota dalam cluster.',
  ]);
  s4.push([]);

  // 2. Silhouette
  s4.push(['2. SILHOUETTE SCORE']);
  s4.push(['Metrik', 'Nilai', 'Keterangan']);
  s4.push([
    'Rata-rata Global',
    silAvg !== null ? parseFloat(fmt(silAvg)) : '-',
    'Range -1 s/d 1. Mendekati 1 = cluster terpisah dengan baik.',
  ]);
  s4.push([]);
  s4.push(['Silhouette per Cluster:']);
  s4.push(['Cluster', 'Score', 'Jumlah Data', 'Interpretasi']);

  const S4_SIL_DATA_START = s4.length + 1;
  silPerCluster.forEach(s => {
    s4.push([
      `Cluster ${s.cluster + 1}`,
      s.score !== null ? parseFloat(fmt(s.score)) : '-',
      s.count,
      interpSil(s.score),
    ]);
  });
  s4.push([]);

  // Rata-rata silhouette (formula dari baris di atas)
  const silScoreCol = _colLetter(1); // kolom B = index 1
  const silAvgVal = useFormula
    ? { f: `=AVERAGE(${silScoreCol}${S4_SIL_DATA_START}:${silScoreCol}${S4_SIL_DATA_START + R.K - 1})` }
    : (silAvg !== null ? parseFloat(fmt(silAvg)) : '-');

  s4.push(['Rata-rata (formula)', silAvgVal, '← verifikasi dari baris per cluster']);
  s4.push([]);

  // 3. Davies-Bouldin
  s4.push(['3. DAVIES-BOULDIN INDEX']);
  s4.push(['Metrik', 'Nilai', 'Keterangan']);
  s4.push([
    'Davies-Bouldin Index',
    dbIndex !== null ? parseFloat(fmt(dbIndex)) : '-',
    'Semakin kecil semakin baik. 0 = sempurna. Mengukur separasi antar cluster.',
  ]);
  s4.push([]);

  // 4. Distribusi
  s4.push(['4. DISTRIBUSI ANGGOTA PER CLUSTER']);
  s4.push(['Cluster', 'Jumlah Data', '% dari Total', 'SSE Cluster']);

  const S4_DIST_START = s4.length + 1;
  const totalDataVal  = nData;

  R.clusterSummary.forEach((c, ki) => {
    const countVal = c.count;
    const pctVal = useFormula
      ? { f: `=B${S4_DIST_START + ki}/${totalDataVal}*100` }
      : parseFloat(((c.count / nData) * 100).toFixed(2));
    s4.push([
      `Cluster ${c.clusterIdx + 1}`,
      countVal,
      pctVal,
      parseFloat(fmtShort(c.sse)),
    ]);
  });

  // Total row
  const distCountCol  = _colLetter(1);  // B
  const distPctCol    = _colLetter(2);  // C
  const distSseCol    = _colLetter(3);  // D
  const distRangeEnd  = S4_DIST_START + R.K - 1;

  s4.push([
    'Total',
    useFormula
      ? { f: `=SUM(${distCountCol}${S4_DIST_START}:${distCountCol}${distRangeEnd})` }
      : nData,
    useFormula
      ? { f: `=SUM(${distPctCol}${S4_DIST_START}:${distPctCol}${distRangeEnd})` }
      : 100,
    useFormula
      ? { f: `=SUM(${distSseCol}${S4_DIST_START}:${distSseCol}${distRangeEnd})` }
      : parseFloat(fmtShort(R.sse)),
  ]);
  s4.push([]);

  // 5. Info Run
  s4.push(['5. INFO RUN']);
  s4.push(['Parameter', 'Nilai']);
  s4.push(['K (Jumlah Cluster)',   R.K]);
  s4.push(['Total Data',           nData]);
  s4.push(['Metrik Jarak',         R.distMetric]);
  s4.push(['Metode Inisialisasi',  R.initMethod]);
  s4.push(['Total Iterasi',        R.totalIter]);
  s4.push(['Konvergen',            R.converged ? 'Ya' : 'Tidak']);
  s4.push(['Strategi Missing Val', R.mvStrategy || '-']);
  s4.push(['Fitur Digunakan',      R.featureNames.join(', ')]);
  s4.push(['Tanggal Export',       new Date().toLocaleString('id-ID')]);

  return { s1, s2, s3, s4, nF, nData, R };
}

/* ════════════════════════════════════════════════════════════
   BUAT WORKBOOK dari sheet data
   ════════════════════════════════════════════════════════════ */
function _buildWorkbook(sheets) {
  const { s1, s2, s3, s4, nF, nData, R } = sheets;
  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.aoa_to_sheet(s1);
  ws1['!cols'] = [{ wch: 5 }, ...Array(nF * 2).fill(null).map(() => ({ wch: 18 }))];
  XLSX.utils.book_append_sheet(wb, ws1, 'Dataset');

  const ws2 = XLSX.utils.aoa_to_sheet(s2);
  ws2['!cols'] = [
    { wch: 18 },
    ...Array(nF).fill(null).map(() => ({ wch: 14 })),
    ...Array(R.K).fill(null).map(() => ({ wch: 16 })),
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Perhitungan');

  const ws3 = XLSX.utils.aoa_to_sheet(s3);
  ws3['!cols'] = Array(1 + nF + 1 + nF).fill(null).map(() => ({ wch: 16 }));
  XLSX.utils.book_append_sheet(wb, ws3, 'Hasil_Clustering');

  const ws4 = XLSX.utils.aoa_to_sheet(s4);
  ws4['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 58 }];
  XLSX.utils.book_append_sheet(wb, ws4, 'Evaluasi_Metrik');

  return wb;
}

/* ============================================================
   EXPORT A — FORMULA XLSX
   ============================================================ */
function exportFormulaXLSX() {
  const R = window.KM_RESULT;
  if (!R) { alert('Tidak ada hasil untuk diekspor.'); return; }
  if (!_checkXLSX()) return;

  const sheets = _buildSheets(R, true);
  const wb     = _buildWorkbook(sheets);
  XLSX.writeFile(wb, 'kmeans_formula.xlsx');
}

/* ============================================================
   EXPORT B — PLAIN TEXT XLSX (semua nilai, tidak ada formula)
   ============================================================ */
function exportPlainTextXLSX() {
  const R = window.KM_RESULT;
  if (!R) { alert('Tidak ada hasil untuk diekspor.'); return; }
  if (!_checkXLSX()) return;

  const sheets = _buildSheets(R, false);
  const wb     = _buildWorkbook(sheets);
  XLSX.writeFile(wb, 'kmeans_plaintext.xlsx');
}