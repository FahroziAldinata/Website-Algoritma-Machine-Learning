/* ============================================================
   c45_export.js  —  Export hasil C4.5
   Fungsi publik:
     exportExcelPlainText() : semua nilai nyata, tanpa formula
     exportExcelFormula()   : sh2+sh3+sh4 pakai formula Excel aktif
     goBack()               : kembali ke halaman input
     goHome()               : kembali ke beranda

   Fix v4:
     [1] Entropy Parent — COUNTIF tidak lagi pakai -1 karena
         Dataset sheet baris 1 = header, data mulai baris 2.
         Formula yang benar: COUNTIF(kol$2:kol$N+1,"kelas")
         dan COUNTA(kol$2:kol$N+1) tanpa -1.
     [2] Akurasi Training — diambil dari C45_Core.getAcc() yang
         dihitung setelah tree selesai, bukan dari cm lokal.
     [3] Tabel TP/FP/FN/TN — kolom TN ditambahkan kembali,
         header dan data diselaraskan (10 kolom lengkap).

   Fix v6:
     [E4] _predict wrapper dihapus — semua pemanggilan diganti langsung
          C45_Core.predict(row). Parameter _node yang tidak pernah dipakai
          juga ikut hilang (BUG-X1).
     [E5] goHome() diperbaiki — tidak lagi merujuk #page-home yang tidak
          ada di c45.html, melainkan redirect ke ../index.html (BUG-X2).
     [E6] _getDepth dan _countLeaves dihapus — dead code duplikat dari
          c45_render.js. Semua pemanggilan dalam file ini diganti langsung
          ke perhitungan inline karena konteksnya sederhana (DEAD-X1).
   ============================================================ */

   const C45_Export = (() => {

    /* ============================================================
       NAVIGASI
       ============================================================ */
    function goBack() {
      document.getElementById('page-result').style.display = 'none';
      document.getElementById('page-input').style.display  = 'block';
    }
  
    function goHome() {
      // [E5] #page-home tidak ada di c45.html — redirect ke beranda
      window.location.href = '../index.html';
    }
  
    /* ============================================================
       SHARED HELPERS
       ============================================================ */
  
    // [E4] _predict wrapper dihapus — dipanggil langsung C45_Core.predict(row)
    // di titik penggunaan (sheet 3). Parameter _node tidak pernah dipakai.
  
    function _extractRules(node, conditions, rules) {
      if (node.type === 'leaf') {
        rules.push({ conditions: [...conditions], label: node.label, n: node.n });
        return;
      }
      for (const [branchVal, child] of Object.entries(node.children)) {
        const cond = node.isNum
          ? `${node.attrName} ${branchVal}`
          : `${node.attrName} = "${branchVal}"`;
        _extractRules(child, [...conditions, cond], rules);
      }
    }
  
    // [E6] _getDepth dan _countLeaves dihapus (dead code duplikat dari c45_render.js).
    // Nilai kedalaman dan jumlah daun dihitung inline di sh4 via helper lokal ringkas.
  
    function _buildGroups(step) {
      const { best, rows, labels } = step;
      if (best.isNum) {
        const left = [], right = [];
        rows.forEach((r, i) => {
          (parseFloat(r[best.fi]) <= best.threshold ? left : right).push(labels[i]);
        });
        return [
          [`≤${C45_Utils.fmt(best.threshold)}`, left],
          [`>${C45_Utils.fmt(best.threshold)}`, right]
        ].filter(([, lb]) => lb.length > 0);
      }
      const map = {};
      rows.forEach((r, i) => {
        const v = r[best.fi];
        if (!map[v]) map[v] = [];
        map[v].push(labels[i]);
      });
      return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
    }
  
    // index kolom 0-based → huruf Excel
    function _col(idx) {
      let s = ''; idx++;
      while (idx > 0) {
        s = String.fromCharCode(65 + ((idx - 1) % 26)) + s;
        idx = Math.floor((idx - 1) / 26);
      }
      return s;
    }
  
    function _autoWidth(ws, data) {
      if (!data || !data.length) return;
      const w = [];
      data.forEach(row => {
        (row || []).forEach((cell, ci) => {
          const len = String(cell ?? '').length;
          if (!w[ci] || len > w[ci]) w[ci] = len;
        });
      });
      ws['!cols'] = w.map(v => ({ wch: Math.min(Math.max(v + 2, 10), 80) }));
    }
  
    function _activateFormulas(ws) {
      if (!ws) return;
      Object.keys(ws).forEach(addr => {
        if (addr.startsWith('!')) return;
        const cell = ws[addr];
        if (cell && cell.t === 's' && typeof cell.v === 'string' && cell.v.startsWith('=')) {
          cell.f = cell.v.slice(1);
          // [E2] Tidak lagi hardcode cell.t = 'n' — formula bisa menghasilkan string
          // (contoh: IF(...,"Ya","Tidak")). Biarkan SheetJS inferensi tipe dari formula.
          delete cell.t;
          delete cell.v;
          delete cell.w;
        }
      });
    }
  
    function _makeWs(data, doFormula) {
      const ws = XLSX.utils.aoa_to_sheet(data);
      if (doFormula) _activateFormulas(ws);
      _autoWidth(ws, data);
      return ws;
    }
  
    /* ============================================================
       BANGUN 4 SHEET
       mode: 'plain'   → semua nilai nyata
             'formula' → sh2+sh3+sh4 pakai formula Excel aktif
       ============================================================ */
    function _buildSheets(mode) {
      const state      = C45_IO.getState();
      const tree       = C45_Core.getTree();
      const steps      = C45_Core.getSteps();
      const cm         = C45_Core.getCM        ? C45_Core.getCM()         : null;
      const acc        = C45_Core.getAcc       ? C45_Core.getAcc()        : null;
      const allClasses = C45_Core.getAllClasses ? C45_Core.getAllClasses() : [];
      const { headers, cleanRows, classCol, featCols } = state;
      const n     = cleanRows.length;
      const rules = [];
      _extractRules(tree, [], rules);
      const F = (mode === 'formula');

      // [E6] Helper lokal ringkas — mengganti _getDepth/_countLeaves yang dihapus
      function _depth(node) {
        if (!node || node.type === 'leaf') return 0;
        const kids = Object.values(node.children);
        return kids.length === 0 ? 1 : 1 + Math.max(...kids.map(_depth));
      }
      function _leaves(node) {
        if (!node || node.type === 'leaf') return 1;
        return Object.values(node.children).reduce((s, c) => s + _leaves(c), 0);
      }
  
      /* ----------------------------------------------------------
         SHEET 1 — Dataset
      ---------------------------------------------------------- */
      const sh1 = [[...headers]];
      cleanRows.forEach(r => sh1.push([...r]));
  
      /* ----------------------------------------------------------
         SHEET 2 — Perhitungan
  
         FIX [1]: Range COUNTIF tidak pakai seluruh kolom (:) tapi
         dibatasi ke baris data saja: $2:$(n+1), sehingga tidak
         perlu -1 lagi. Ini menghindari penghitungan baris header.
  
         Layout baris:
           R1        : judul
           R2        : kosong
           R3        : === ENTROPY PARENT ===
           R4        : header kolom
           R5…R(4+K) : data per kelas   ← efdr = 5
           R(5+K)    : H(parent)
           R(6+K)    : kosong
      ---------------------------------------------------------- */
      const sh2     = [];
      const clsColL = _col(classCol); // huruf kolom kelas di Dataset
  
      // Range data kelas di sheet Dataset (baris 2 … n+1, tanpa header)
      const dsClsRng = `Dataset!${clsColL}$2:${clsColL}$${n + 1}`;
  
      sh2.push(['C4.5 — Langkah Perhitungan Entropy & Information Gain']);
      sh2.push(['']);
      sh2.push([`=== ENTROPY PARENT (Seluruh Dataset, n=${n}) ===`]);
      sh2.push(['Kelas', 'Jumlah (n_i)', 'Total (N)', 'Proporsi p_i', '-p*log2(p)', 'Entropy H']);
  
      const freq = {};
      allClasses.forEach(c => { freq[c] = 0; });
      cleanRows.forEach(r => { if (freq[r[classCol]] !== undefined) freq[r[classCol]]++; });
  
      let parentH_global = 0;
      const efdr = sh2.length + 1; // entropyFirstDataRow = 5
  
      allClasses.forEach((cls, ci) => {
        const ni  = freq[cls] || 0;
        const pi  = ni / n;
        const neg = pi > 0 ? -(pi) * Math.log2(pi) : 0;
        parentH_global += neg;
        const er = efdr + ci;
        if (F) {
          sh2.push([
            cls,
            `=COUNTIF(${dsClsRng},"${cls}")`,   // ← FIX: tanpa -1, range sudah tanpa header
            `=COUNTA(${dsClsRng})`,              // ← FIX: tanpa -1
            `=B${er}/C${er}`,
            `=IF(D${er}=0,0,-(D${er})*LOG(D${er},2))`,
            ''
          ]);
        } else {
          sh2.push([cls, ni, n, +pi.toFixed(6), +neg.toFixed(6), '']);
        }
      });
  
      const eldr = efdr + allClasses.length - 1;
      if (F) {
        sh2.push(['', '', '', '', 'H(parent) =', `=SUM(E${efdr}:E${eldr})`]);
      } else {
        sh2.push(['', '', '', '', 'H(parent) =', +parentH_global.toFixed(6)]);
      }
      sh2.push(['']);
  
      // ── Per node split ──
      let nodeNum = 0;
      steps.forEach(step => {
        if (step.type !== 'split') return;
        nodeNum++;
        const best    = step.best;
        const nNode   = step.rows.length;
        const parentH = step.parentH;
        const groups  = _buildGroups(step);
        const hPval   = +parentH.toFixed(6);
  
        sh2.push([`=== NODE #${nodeNum} | Atribut Terpilih: ${headers[best.fi]} | n=${nNode} | Depth=${step.depth} ===`]);
        sh2.push(['']);
        sh2.push([`Entropy Node (H_parent) = ${hPval}`]);
        sh2.push(['']);
  
        // Evaluasi semua fitur
        sh2.push(['--- Evaluasi Semua Fitur ---']);
        sh2.push(['Fitur', 'Info Gain', 'Split Info', 'Gain Ratio', 'Terpilih?']);
        const gainTableFirstRow = sh2.length + 1;
        step.gains.forEach((g, gi) => {
          const gr = gainTableFirstRow + gi;
          if (F) {
            sh2.push([
              headers[g.fi],
              +g.gain.toFixed(6),
              g.splitInfo != null ? +g.splitInfo.toFixed(6) : '-',
              g.gainRatio != null ? `=IF(C${gr}=0,0,B${gr}/C${gr})` : '-',
              g.fi === best.fi ? '✓ TERPILIH' : ''
            ]);
          } else {
            sh2.push([
              headers[g.fi],
              +g.gain.toFixed(6),
              g.splitInfo != null ? +g.splitInfo.toFixed(6) : '-',
              g.gainRatio != null ? +g.gainRatio.toFixed(6) : '-',
              g.fi === best.fi ? '✓ TERPILIH' : ''
            ]);
          }
        });
        sh2.push(['']);
  
        // Detail cabang
        sh2.push([`--- Detail Perhitungan: ${headers[best.fi]} ---`]);
        sh2.push(['Cabang (nilai)', 'n_v', 'n_v / n', 'H(cabang)', '(n_v/n)*H(v)']);
  
        const detailFirstRow = sh2.length + 1;
        let sigmaWH = 0;
        groups.forEach(([val, lbls], gi) => {
          const cnt     = lbls.length;
          const prop    = cnt / nNode;
          const H_v     = C45_Utils.entropyFromLabels(lbls);
          const contrib = prop * H_v;
          sigmaWH      += contrib;
          const er = detailFirstRow + gi;
          if (F) {
            sh2.push([val, cnt, `=B${er}/${nNode}`, +H_v.toFixed(6), `=C${er}*D${er}`]);
          } else {
            sh2.push([val, cnt, +prop.toFixed(6), +H_v.toFixed(6), +contrib.toFixed(6)]);
          }
        });
  
        const detailLastRow = detailFirstRow + groups.length - 1;
        const sigmaRow = detailLastRow + 1;
        const gainRow  = detailLastRow + 2;
        const siRow    = detailLastRow + 3;
  
        if (F) {
          sh2.push(['', '', '', 'Σ(n_v/n)*H(v) =', `=SUM(E${detailFirstRow}:E${detailLastRow})`]);
          sh2.push(['', '', '', 'Info Gain =',      `=${hPval}-E${sigmaRow}`]);
          if (best.splitInfo != null) {
            sh2.push(['', '', '', 'Split Info =',   +best.splitInfo.toFixed(6)]);
            sh2.push(['', '', '', 'Gain Ratio =',   `=IF(E${siRow}=0,0,E${gainRow}/E${siRow})`]);
          }
        } else {
          sh2.push(['', '', '', 'Σ(n_v/n)*H(v) =', +sigmaWH.toFixed(6)]);
          sh2.push(['', '', '', 'Info Gain =',      +best.gain.toFixed(6)]);
          if (best.splitInfo != null) {
            sh2.push(['', '', '', 'Split Info =',   +best.splitInfo.toFixed(6)]);
            sh2.push(['', '', '', 'Gain Ratio =',   +best.gainRatio.toFixed(6)]);
          }
        }
        if (best.isNum) sh2.push(['', '', '', 'Threshold =', best.threshold]);
        sh2.push(['']);
      });
  
      /* ----------------------------------------------------------
         SHEET 3 — Prediksi
      ---------------------------------------------------------- */
      const H         = headers.length;
      const predColL  = _col(H);
      const aktColL   = _col(H + 1);
      const benarColL = _col(H + 2);
      const dsClsColL = _col(classCol); // kolom kelas di Dataset (tanpa kolom No)
  
      const sh3 = [['No', ...headers, 'Prediksi_C45', 'Aktual', 'Benar?']];
      cleanRows.forEach((row, i) => {
        const pred   = C45_Core.predict(row); // [E4] langsung, tanpa wrapper
        const actual = row[classCol];
        const er     = i + 2;
        if (F) {
          sh3.push([
            i + 1,
            ...row,
            pred,
            `=Dataset!${dsClsColL}${er}`,
            `=IF(${predColL}${er}=${aktColL}${er},"Ya","Tidak")`
          ]);
        } else {
          sh3.push([i + 1, ...row, pred, actual, pred === actual ? 'Ya' : 'Tidak']);
        }
      });
  
      /* ----------------------------------------------------------
         SHEET 4 — IF-THEN + Evaluasi Metrik
  
         FIX [2]: Akurasi diambil dari C45_Core.getAcc() yang sudah
         dihitung setelah tree selesai — bukan dihitung ulang di sini.
  
         FIX [3]: Tabel metrik per kelas memiliki 10 kolom lengkap:
         Kelas | TP | FP | FN | TN | Precision | Recall | F1 | AkuKelas | Support
      ---------------------------------------------------------- */
      const predRng  = `Prediksi!${predColL}$2:${predColL}$${n + 1}`;
      const aktRng   = `Prediksi!${aktColL}$2:${aktColL}$${n + 1}`;
      const benarRng = `Prediksi!${benarColL}$2:${benarColL}$${n + 1}`;
  
      const sh4 = [];
  
      // IF-THEN Rules
      sh4.push(['=== IF-THEN RULES ===']);
      sh4.push(['No', 'Kondisi (JIKA ... DAN ...)', 'MAKA (Kelas)', 'Support (n)']);
      rules.forEach((rule, i) => {
        sh4.push([i + 1, rule.conditions.join(' DAN '), rule.label, rule.n]);
      });
      sh4.push(['']);
  
      // Ringkasan Pohon
      sh4.push(['=== RINGKASAN POHON ===']);
      sh4.push(['Parameter', 'Nilai']);
      sh4.push(['Kedalaman Pohon',     _depth(tree)]);
      sh4.push(['Jumlah Leaf (Daun)',  _leaves(tree)]);
      sh4.push(['Jumlah Aturan',       rules.length]);
      sh4.push(['Jumlah Kelas',        allClasses.length]);
      sh4.push(['Jumlah Fitur',        featCols.length]);
      sh4.push(['Total Data Training', n]);
      sh4.push(['Kriteria Split',      C45_Core.getCriterion()]); // [E3] getCriterion() sudah public di core v5
      sh4.push(['']);
  
      // FIX [2]: Akurasi — formula merujuk sheet Prediksi, nilai dari getAcc()
      sh4.push(['=== EVALUASI METRIK ===']);
      if (F) {
        sh4.push(['Akurasi Training', `=COUNTIF(${benarRng},"Ya")/${n}`]);
      } else {
        // Gunakan acc dari C45_Core (dihitung setelah tree selesai) — nilai pasti benar
        sh4.push(['Akurasi Training',
          acc !== null ? +acc.toFixed(6) : '-'
        ]);
      }
      sh4.push(['']);
  
      if (allClasses.length && cm) {
        const { metrics, macro, weighted } = C45_Utils.precisionRecallF1(cm, allClasses);
  
        // FIX [3]: 10 kolom — tambah TN
        sh4.push(['--- Metrik Per Kelas ---']);
        sh4.push([
          'Kelas', 'TP', 'FP', 'FN', 'TN',
          'Precision', 'Recall', 'F1-Score', 'Akurasi Kelas', 'Support (n)'
        ]);
        const mfdr = sh4.length + 1;
  
        allClasses.forEach((cls, i) => {
          const er = mfdr + i;
          if (F) {
            sh4.push([
              cls,
              `=COUNTIFS(${aktRng},"${cls}",${predRng},"${cls}")`,
              `=COUNTIFS(${predRng},"${cls}",${aktRng},"<>${cls}")`,
              `=COUNTIFS(${aktRng},"${cls}",${predRng},"<>${cls}")`,
              `=${n}-B${er}-C${er}-D${er}`,
              `=IF(B${er}+C${er}=0,0,B${er}/(B${er}+C${er}))`,
              `=IF(B${er}+D${er}=0,0,B${er}/(B${er}+D${er}))`,
              `=IF(F${er}+G${er}=0,0,2*F${er}*G${er}/(F${er}+G${er}))`,
              `=IF(B${er}+C${er}+D${er}+E${er}=0,0,(B${er}+E${er})/(B${er}+C${er}+D${er}+E${er}))`,
              `=COUNTIF(${aktRng},"${cls}")`
            ]);
          } else {
            const m  = metrics[i];
            const tp = cm[i][i];
            const fp = cm.reduce((s, r, ri) => ri !== i ? s + r[i] : s, 0);
            const fn = cm[i].reduce((s, v, ci) => ci !== i ? s + v : s, 0);
            const tn = n - tp - fp - fn;
            sh4.push([
              cls, tp, fp, fn, tn,
              +m.precision.toFixed(6),
              +m.recall.toFixed(6),
              +m.f1.toFixed(6),
              +m.classAcc.toFixed(6),
              m.support
            ]);
          }
        });
  
        const mldr = mfdr + allClasses.length - 1;
        sh4.push(['']);
  
        // Rata-rata
        sh4.push(['--- Rata-rata Keseluruhan ---']);
        sh4.push(['Tipe Avg', 'Precision', 'Recall', 'F1-Score']);
        if (F) {
          sh4.push([
            'Macro Average',
            `=AVERAGE(F${mfdr}:F${mldr})`,
            `=AVERAGE(G${mfdr}:G${mldr})`,
            `=AVERAGE(H${mfdr}:H${mldr})`
          ]);
          sh4.push([
            'Weighted Average',
            `=SUMPRODUCT(J${mfdr}:J${mldr},F${mfdr}:F${mldr})/${n}`,
            `=SUMPRODUCT(J${mfdr}:J${mldr},G${mfdr}:G${mldr})/${n}`,
            `=SUMPRODUCT(J${mfdr}:J${mldr},H${mfdr}:H${mldr})/${n}`
          ]);
        } else {
          sh4.push([
            'Macro Average',
            +macro.precision.toFixed(6),
            +macro.recall.toFixed(6),
            +macro.f1.toFixed(6)
          ]);
          sh4.push([
            'Weighted Average',
            +weighted.precision.toFixed(6),
            +weighted.recall.toFixed(6),
            +weighted.f1.toFixed(6)
          ]);
        }
        sh4.push(['']);
  
        // Confusion Matrix
        sh4.push(['--- Confusion Matrix ---']);
        sh4.push(['↓ Aktual / Prediksi →', ...allClasses]);
        allClasses.forEach((aktCls, i) => {
          const cells = allClasses.map((predCls, j) =>
            F
              ? `=COUNTIFS(${aktRng},"${aktCls}",${predRng},"${predCls}")`
              : cm[i][j]
          );
          sh4.push([aktCls, ...cells]);
        });
      }
  
      return { sh1, sh2, sh3, sh4 };
    }
  
    /* ============================================================
       1. DOWNLOAD EXCEL PLAIN TEXT
       ============================================================ */
    function exportExcelPlainText() {
      const tree = C45_Core.getTree();
      if (!tree) { alert('Proses C4.5 terlebih dahulu.'); return; }
      const { sh1, sh2, sh3, sh4 } = _buildSheets('plain');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, _makeWs(sh1, false), 'Dataset');
      XLSX.utils.book_append_sheet(wb, _makeWs(sh2, false), 'Perhitungan');
      XLSX.utils.book_append_sheet(wb, _makeWs(sh3, false), 'Prediksi');
      XLSX.utils.book_append_sheet(wb, _makeWs(sh4, false), 'IFThen_Evaluasi');
      XLSX.writeFile(wb, 'c45_plain_text.xlsx');
    }
  
    /* ============================================================
       2. DOWNLOAD EXCEL FORMULA
       ============================================================ */
    function exportExcelFormula() {
      const tree = C45_Core.getTree();
      if (!tree) { alert('Proses C4.5 terlebih dahulu.'); return; }
      const { sh1, sh2, sh3, sh4 } = _buildSheets('formula');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, _makeWs(sh1, false), 'Dataset');
      XLSX.utils.book_append_sheet(wb, _makeWs(sh2, true),  'Perhitungan');
      XLSX.utils.book_append_sheet(wb, _makeWs(sh3, true),  'Prediksi');
      XLSX.utils.book_append_sheet(wb, _makeWs(sh4, true),  'IFThen_Evaluasi');
      XLSX.writeFile(wb, 'c45_formula.xlsx');
    }
  
    /* ============================================================
       PUBLIC API
       ============================================================ */
    return { exportExcelPlainText, exportExcelFormula, goBack, goHome };
  
  })();