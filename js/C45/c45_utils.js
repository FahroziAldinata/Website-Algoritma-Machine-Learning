/* ============================================================
   c45_utils.js  —  Helper / Math utilities untuk C4.5
   ============================================================ */

   const C45_Utils = (() => {

    /* ---- Entropy ---- */
    function entropy(counts) {
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
  
    /* ---- Entropy dari array nilai kelas ---- */
    function entropyFromLabels(labels) {
      const freq = {};
      for (const l of labels) freq[l] = (freq[l] || 0) + 1;
      return entropy(Object.values(freq));
    }
  
    /* ---- Information Gain untuk atribut kategorikal ---- */
    function infoGainCat(rows, attrIdx, classIdx) {
      const total    = rows.length;
      const parentH  = entropyFromLabels(rows.map(r => r[classIdx]));
      const groups   = {};
      for (const r of rows) {
        const val = r[attrIdx];
        if (!groups[val]) groups[val] = [];
        groups[val].push(r[classIdx]);
      }
      let weightedH = 0;
      const splitInfo = [];
      for (const val of Object.keys(groups)) {
        const g     = groups[val];
        const frac  = g.length / total;
        weightedH  += frac * entropyFromLabels(g);
        splitInfo.push(frac);
      }
      const gain = parentH - weightedH;
      // [FIX-U1] splitInfoH dihapus — salah rumus dan tidak terpakai.
      // Split Info yang benar: si = -Σ (n_v/n) * log2(n_v/n)
      let si = 0;
      for (const f of splitInfo) {
        if (f > 0) si -= f * Math.log2(f);
      }
      const gainRatio = si === 0 ? 0 : gain / si;
      return { gain, gainRatio, splitInfo: si, groups, parentH, weightedH };
    }
  
    /* ---- Information Gain untuk atribut numerik (binary split) ---- */
    // [FIX-U3] Kandidat threshold hanya dievaluasi di boundary beda kelas (Quinlan 1993).
    // [FIX-U4] Terima parameter criterion agar threshold dipilih sesuai kriteria aktif.
    function infoGainNum(rows, attrIdx, classIdx, thresholdMode = 'midpoint', criterion = 'gain_ratio') {
      const total   = rows.length;
      const parentH = entropyFromLabels(rows.map(r => r[classIdx]));

      const sorted = [...rows].sort((a, b) => parseFloat(a[attrIdx]) - parseFloat(b[attrIdx]));

      let bestScore     = -Infinity;
      let bestGain      = 0;
      let bestGainRatio = 0;
      let bestThreshold = null;
      let bestGroups    = null;
      let bestSplitInfo = 0;

      if (thresholdMode === 'mean') {
        const mean = rows.reduce((s, r) => s + parseFloat(r[attrIdx]), 0) / total;
        const result = _evalThreshold(rows, attrIdx, classIdx, mean, parentH, total);
        return { ...result, threshold: mean };
      }

      // [FIX-U3] Midpoint: hanya evaluasi boundary antar nilai yang kelasnya berbeda.
      // Ini sesuai Quinlan 1993 — tidak ada informasi baru di boundary kelas sama.
      const candidates = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        const va = parseFloat(sorted[i][attrIdx]);
        const vb = parseFloat(sorted[i + 1][attrIdx]);
        if (va === vb) continue;                              // nilai sama, skip
        if (sorted[i][classIdx] === sorted[i + 1][classIdx]) continue; // kelas sama, skip [FIX-U3]
        const mid = (va + vb) / 2;
        if (!candidates.includes(mid)) candidates.push(mid);
      }

      // Jika tidak ada boundary beda kelas, fallback ke semua boundary beda nilai
      // (bisa terjadi jika semua baris kelas sama — akan ditangkap isPure sebelumnya,
      //  tapi sebagai safeguard tetap perlu)
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

      // [FIX-U4] Pilih threshold berdasarkan criterion yang aktif, bukan selalu gain
      for (const t of candidates) {
        const r     = _evalThreshold(rows, attrIdx, classIdx, t, parentH, total);
        const score = criterion === 'gain_ratio' ? r.gainRatio : r.gain;
        if (score > bestScore) {
          bestScore     = score;
          bestGain      = r.gain;
          bestGainRatio = r.gainRatio;
          bestThreshold = t;
          bestGroups    = r.groups;
          bestSplitInfo = r.splitInfo;
        }
      }
      return { gain: bestGain, gainRatio: bestGainRatio, splitInfo: bestSplitInfo, threshold: bestThreshold, groups: bestGroups, parentH, weightedH: parentH - bestGain, candidates };
    }
  
    function _evalThreshold(rows, attrIdx, classIdx, threshold, parentH, total) {
      const left  = rows.filter(r => parseFloat(r[attrIdx]) <= threshold).map(r => r[classIdx]);
      const right = rows.filter(r => parseFloat(r[attrIdx]) >  threshold).map(r => r[classIdx]);
      const nL = left.length, nR = right.length;
      if (nL === 0 || nR === 0) return { gain: 0, gainRatio: 0, splitInfo: 0, groups: null };
      const fL = nL / total, fR = nR / total;
      const weightedH = fL * entropyFromLabels(left) + fR * entropyFromLabels(right);
      const gain      = parentH - weightedH;
      let si = 0;
      if (fL > 0) si -= fL * Math.log2(fL);
      if (fR > 0) si -= fR * Math.log2(fR);
      const gainRatio = si === 0 ? 0 : gain / si;
      return { gain, gainRatio, splitInfo: si, groups: { [`≤${fmt(threshold)}`]: left, [`>${fmt(threshold)}`]: right }, weightedH };
    }
  
    /* ---- Kelas mayoritas dari array label ---- */
    // [FIX-U2] Tie-breaking deterministik: jika frekuensi sama, pilih
    // kelas yang alfabetis lebih kecil agar hasil konsisten di semua engine.
    function majorityClass(labels) {
      const freq = {};
      for (const l of labels) freq[l] = (freq[l] || 0) + 1;
      return Object.keys(freq).reduce((a, b) => {
        if (freq[a] !== freq[b]) return freq[a] > freq[b] ? a : b;
        return a <= b ? a : b; // tie-break alfabetis
      });
    }
  
    /* ---- Cek apakah semua label sama ---- */
    function isPure(labels) {
      return new Set(labels).size === 1;
    }
  
    /* ---- Format angka ---- */
    function fmt(n, d = 4) {
      if (typeof n !== 'number' || isNaN(n)) return '—';
      return parseFloat(n.toFixed(d)).toString();
    }
    function fmtBits(n) { return fmt(n, 4) + ' bit'; }
  
    /* ---- Deteksi tipe kolom (numerik / kategorikal) ---- */
    function detectColTypes(headers, rows) {
      return headers.map((h, i) => {
        const vals = rows.map(r => r[i]).filter(v => v !== '' && v !== null && v !== undefined);
        const numCount = vals.filter(v => !isNaN(parseFloat(v)) && isFinite(v)).length;
        return numCount / vals.length > 0.8 ? 'num' : 'cat';
      });
    }
  
    /* ---- Frekuensi kelas dalam subset ---- */
    function classFreq(labels) {
      const freq = {};
      for (const l of labels) freq[l] = (freq[l] || 0) + 1;
      return freq;
    }
  
    /* ---- Accuracy ---- */
    function accuracy(yTrue, yPred) {
      let correct = 0;
      for (let i = 0; i < yTrue.length; i++) {
        if (yTrue[i] === yPred[i]) correct++;
      }
      return correct / yTrue.length;
    }
  
    /* ---- Confusion matrix ---- */
    function confusionMatrix(yTrue, yPred, classes) {
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
  
    /* ---- Imputasi missing values ---- */
    function imputeMissing(rows, headers, strategy, colTypes) {
      const result  = rows.map(r => [...r]);
      const nCols   = headers.length;
      const changed = [];
  
      for (let ci = 0; ci < nCols; ci++) {
        const vals = rows.map(r => r[ci]).filter(v => v !== '' && v !== null && v !== undefined);
        if (vals.length === rows.length) continue; // tidak ada missing
  
        let fillVal;
        if (strategy === 'drop') { fillVal = null; }
        else if (strategy === 'mean' && colTypes[ci] === 'num') {
          const nums = vals.filter(v => !isNaN(parseFloat(v)));
          fillVal    = nums.length ? fmt(nums.reduce((a, b) => a + parseFloat(b), 0) / nums.length, 4) : '0';
        } else {
          // mode
          const freq = {};
          for (const v of vals) freq[v] = (freq[v] || 0) + 1;
          fillVal = Object.keys(freq).reduce((a, b) => freq[a] >= freq[b] ? a : b);
        }
  
        for (let ri = 0; ri < result.length; ri++) {
          const v = result[ri][ci];
          if (v === '' || v === null || v === undefined) {
            result[ri][ci] = fillVal;
            changed.push({ row: ri, col: headers[ci], filled: fillVal });
          }
        }
      }
      // Hapus baris yang masih null (drop strategy)
      const filtered = strategy === 'drop' ? result.filter(r => !r.includes(null)) : result;
      return { rows: filtered, changed };
    }
  
    /* ---- Precision, Recall, F1 per kelas + macro/weighted average ---- */
    function precisionRecallF1(cm, allClasses) {
      const n = allClasses.length;
      const metrics = [];
  
      let totalSupport = 0;
      let macroP = 0, macroR = 0, macroF1 = 0;
      let weightedP = 0, weightedR = 0, weightedF1 = 0;
  
      for (let i = 0; i < n; i++) {
        // TP: cm[i][i]
        const tp = cm[i][i];
        // FP: sum of column i minus TP
        let fp = 0;
        for (let r = 0; r < n; r++) if (r !== i) fp += cm[r][i];
        // FN: sum of row i minus TP
        let fn = 0;
        for (let c = 0; c < n; c++) if (c !== i) fn += cm[i][c];
        // TN: everything else
        let tn = 0;
        for (let r = 0; r < n; r++)
          for (let c = 0; c < n; c++)
            if (r !== i && c !== i) tn += cm[r][c];
  
        const support   = tp + fn; // actual positives for this class
        const precision = (tp + fp) === 0 ? 0 : tp / (tp + fp);
        const recall    = (tp + fn) === 0 ? 0 : tp / (tp + fn);
        const f1        = (precision + recall) === 0 ? 0 : 2 * precision * recall / (precision + recall);
        // Class-wise accuracy: (TP + TN) / total
        const total     = tp + fp + fn + tn;
        const classAcc  = total === 0 ? 0 : (tp + tn) / total;
  
        metrics.push({ cls: allClasses[i], tp, fp, fn, tn, precision, recall, f1, classAcc, support });
  
        totalSupport += support;
        macroP  += precision;
        macroR  += recall;
        macroF1 += f1;
        weightedP  += precision * support;
        weightedR  += recall    * support;
        weightedF1 += f1        * support;
      }
  
      const macro = {
        precision : macroP  / n,
        recall    : macroR  / n,
        f1        : macroF1 / n,
      };
      const weighted = {
        precision : totalSupport ? weightedP  / totalSupport : 0,
        recall    : totalSupport ? weightedR  / totalSupport : 0,
        f1        : totalSupport ? weightedF1 / totalSupport : 0,
      };
  
      return { metrics, macro, weighted, totalSupport };
    }
  
    /* ---- Stratified train/test split ---- */
    // [NEW-U1] Membagi rows ke trainRows dan testRows dengan proporsi kelas
    // terjaga di kedua set (stratified). Shuffle deterministik menggunakan
    // LCG (Linear Congruential Generator) dengan seed yang bisa diatur.
    //
    // Parameter:
    //   rows      — array of arrays (full cleanRows)
    //   classIdx  — indeks kolom kelas
    //   testRatio — proporsi data test, mis. 0.2 = 20%
    //   seed      — integer seed untuk reprodusibilitas
    //
    // Return: { trainRows, testRows, trainN, testN }
    function stratifiedSplit(rows, classIdx, testRatio = 0.2, seed = 42) {

      // Kelompokkan baris per kelas
      const byClass = {};
      rows.forEach(r => {
        const cls = r[classIdx];
        if (!byClass[cls]) byClass[cls] = [];
        byClass[cls].push(r);
      });

      const trainRows = [], testRows = [];

      // Per kelas: shuffle lalu split sesuai testRatio
      // Seed berbeda per kelas agar shuffle tidak identik
      let seedOffset = 0;
      for (const cls of Object.keys(byClass).sort()) {
        const group    = lcgShuffle(byClass[cls], seed + seedOffset);
        const nTest    = Math.max(1, Math.round(group.length * testRatio));
        const nTrain   = group.length - nTest;
        // Minimal 1 sampel per set per kelas jika memungkinkan
        if (group.length < 2) {
          // Tidak cukup untuk split — masukkan ke train
          trainRows.push(...group);
        } else {
          testRows.push(...group.slice(0, nTest));
          trainRows.push(...group.slice(nTest));
        }
        seedOffset += 100;
      }

      return { trainRows, testRows, trainN: trainRows.length, testN: testRows.length };
    }

    return {
      entropy, entropyFromLabels, infoGainCat, infoGainNum,
      majorityClass, isPure, fmt, fmtBits, detectColTypes,
      classFreq, accuracy, confusionMatrix, imputeMissing,
      precisionRecallF1, stratifiedSplit
    };
  })();