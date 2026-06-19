/* =====================================================
   apriori_export.js
   Export to Excel: plain text values + formula version
   ===================================================== */

function exportAprioriExcel(useFormulas) {
  const result = APR.lastResult;
  if (!result) return alert('Jalankan proses Apriori terlebih dahulu.');
  const { frequentSets, rules, steps, n } = result;
  const transactions = APR.transactions;
  const tids = APR.tids;

  const wb = XLSX.utils.book_new();

  /* ================================================================
     SHEET 1: Dataset Transaksi
  ================================================================ */
  const ds1 = [['TID', 'Items', '# Items']];
  APR.rawRows.forEach(r => ds1.push([r.TID, r.items.join(', '), r.items.length]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ds1), '1_Dataset');

  /* ================================================================
     SHEET 2: Perhitungan Support (semua kandidat per iterasi)
  ================================================================ */
  const ds2 = [
    ['Iterasi', 'Itemset', 'Count', 'Support', 'Formula Support', 'Min Support', 'Status']
  ];
  steps.forEach(st => {
    st.candidates.forEach(c => {
      const supp = c.count / n;
      const ok   = supp >= APR.minSupport;
      ds2.push([
        `L${st.k}`,
        `{${c.items.join(', ')}}`,
        c.count,
        useFormulas ? { f: `C${ds2.length + 1}/${n}` } : parseFloat(supp.toFixed(6)),
        `=C${ds2.length + 1}/${n}`,
        APR.minSupport,
        ok ? 'Frequent' : 'Pruned'
      ]);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ds2), '2_Perhitungan');

  /* ================================================================
     SHEET 3: Frequent Itemsets Summary
  ================================================================ */
  const ds3 = [
    ['#', 'K', 'Itemset', 'Count', 'Support', 'Formula']
  ];
  frequentSets.forEach((fs, i) => {
    const supp = fs.count / n;
    ds3.push([
      i + 1,
      fs.items.length,
      `{${fs.items.join(', ')}}`,
      fs.count,
      useFormulas ? { f: `D${ds3.length + 1}/${n}` } : parseFloat(supp.toFixed(6)),
      `=D${ds3.length + 1}/${n}`
    ]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ds3), '3_FrequentItemsets');

  /* ================================================================
     SHEET 4: Association Rules
  ================================================================ */
  const ds4h = [
    '#', 'Antecedent (X)', 'Consequent (Y)',
    'count(X∪Y)', 'count(X)', 'count(Y)',
    'supp(X∪Y)', 'supp(X)', 'supp(Y)',
    'Confidence', 'Lift', 'Interpretasi',
    'Formula Confidence', 'Formula Lift'
  ];
  const ds4 = [ds4h];
  rules.forEach((r, i) => {
    const row = i + 2; // data starts at row 2
    const colSuppXY  = 'G'; // col index 7 (0-based) = G
    const colSuppX   = 'H';
    const colSuppY   = 'I';
    const colConf    = 'J';
    ds4.push([
      i + 1,
      r.antecedent.join(', '),
      r.consequent.join(', '),
      r.count,
      Math.round(r.suppX * n),
      Math.round(r.suppY * n),
      useFormulas ? { f: `D${row}/${n}` } : parseFloat(r.suppXY.toFixed(6)),
      useFormulas ? { f: `E${row}/${n}` } : parseFloat(r.suppX.toFixed(6)),
      useFormulas ? { f: `F${row}/${n}` } : parseFloat(r.suppY.toFixed(6)),
      useFormulas ? { f: `${colSuppXY}${row}/${colSuppX}${row}` } : parseFloat(r.confidence.toFixed(6)),
      useFormulas ? { f: `${colConf}${row}/${colSuppY}${row}` }   : parseFloat(r.lift.toFixed(6)),
      r.lift > 1 ? 'Positif' : r.lift < 1 ? 'Negatif' : 'Independen',
      `=${colSuppXY}${row}/${colSuppX}${row}`,
      `=${colConf}${row}/${colSuppY}${row}`
    ]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ds4), '4_Rules');

  /* ================================================================
     SHEET 5: Evaluasi Metrik
  ================================================================ */
  const topRule = rules[0];
  const ds5 = [
    ['Metrik', 'Nilai', 'Formula/Keterangan'],
    ['Total Transaksi', n, '=COUNTA(Sheet1!A:A)-1'],
    ['Total Item Unik', APR.allItems.length, APR.allItems.join(', ')],
    ['Min Support (threshold)', APR.minSupport, `${(APR.minSupport * 100).toFixed(0)}%`],
    ['Min Confidence (threshold)', APR.minConfidence, `${(APR.minConfidence * 100).toFixed(0)}%`],
    ['Jumlah Frequent Itemsets', frequentSets.length, ''],
    ['Jumlah Association Rules', rules.length, ''],
    ['', '', ''],
    ['=== TOP RULES ===', '', ''],
    ['Rule', 'Confidence', 'Lift'],
  ];
  rules.slice(0, 5).forEach(r => {
    ds5.push([
      `{${r.antecedent.join(',')}} → {${r.consequent.join(',')}}`,
      useFormulas ? { f: `${r.suppXY.toFixed(6)}/${r.suppX.toFixed(6)}` } : parseFloat(r.confidence.toFixed(4)),
      useFormulas ? { f: `${r.confidence.toFixed(6)}/${r.suppY.toFixed(6)}` } : parseFloat(r.lift.toFixed(4))
    ]);
  });

  ds5.push(['', '', '']);
  ds5.push(['=== FORMULA REFERENSI ===', '', '']);
  ds5.push(['supp(X)', '= count(X) / |T|', `count(X) dibagi total ${n} transaksi`]);
  ds5.push(['conf(X→Y)', '= supp(X∪Y) / supp(X)', 'Proporsi X yang juga mengandung Y']);
  ds5.push(['lift(X→Y)', '= conf(X→Y) / supp(Y)', '>1 positif, =1 independen, <1 negatif']);

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ds5), '5_EvaluasiMetrik');

  /* ---- Download ---- */
  const fname = useFormulas ? 'apriori_formula.xlsx' : 'apriori_plain.xlsx';
  XLSX.writeFile(wb, fname);
}
