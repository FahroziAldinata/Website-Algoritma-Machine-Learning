/* ============================================
   SPK MODULES — weighting-critic.js
   Pembobotan otomatis menggunakan metode CRITIC
   (Criteria Importance Through Intercriteria
   Correlation)
   Dependensi: normalizeWeights() dari
   weighting-entropy.js
   ============================================ */

   'use strict';

   /**
    * Hitung bobot otomatis menggunakan metode CRITIC.
    * Mempertimbangkan standar deviasi dan korelasi
    * antar kriteria secara bersamaan.
    * @param {string[]} cols    - nama kolom kriteria yang dipilih
    * @param {Array[]}  rows    - rawData.slice(1) — baris data tanpa header
    * @param {string[]} headers - rawData[0] — baris header
    * @returns {Object} { colName: number } — total bobot = 1
    */
   function calcCriticWeights(cols, rows, headers) {
     const m = rows.length;
   
     // ── Langkah 1: Bangun matrix numerik [row][col] ──
     const matrix = rows.map(row =>
       cols.map(col => parseFloat(row[headers.indexOf(col)]) || 0)
     );
   
     // ── Langkah 2: Standar deviasi tiap kolom ──
     const stdDevs = cols.map((_, ci) => {
       const vals = matrix.map(row => row[ci]);
       const mean = vals.reduce((a, b) => a + b, 0) / m;
       const variance = vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / m;
       return Math.sqrt(variance);
     });
   
     // ── Langkah 3: Matriks korelasi Pearson ──
     const corr = cols.map((_, ci) =>
       cols.map((_, cj) => {
         if (ci === cj) return 1;
   
         const xi = matrix.map(r => r[ci]);
         const xj = matrix.map(r => r[cj]);
         const mi = xi.reduce((a, b) => a + b, 0) / m;
         const mj = xj.reduce((a, b) => a + b, 0) / m;
   
         const num = xi.reduce((s, v, k) => s + (v - mi) * (xj[k] - mj), 0);
         const di  = Math.sqrt(xi.reduce((s, v) => s + (v - mi) ** 2, 0));
         const dj  = Math.sqrt(xj.reduce((s, v) => s + (v - mj) ** 2, 0));
   
         return (di === 0 || dj === 0) ? 0 : num / (di * dj);
       })
     );
   
     // ── Langkah 4: C_j = σ_j × Σ(1 − r_jk) ──
     const C = cols.map((_, ci) => {
       const symSum = cols.reduce((sum, _, cj) => sum + (1 - corr[ci][cj]), 0);
       return stdDevs[ci] * symSum;
     });
   
     const Csum = C.reduce((a, b) => a + b, 0);
   
     // ── Langkah 5: Fallback jika semua sama ──
     if (Csum === 0) {
       const w = 1 / cols.length;
       return Object.fromEntries(
         cols.map(c => [c, parseFloat(w.toFixed(4))])
       );
     }
   
     // ── Langkah 6: Hitung bobot ──
     const weights = {};
     cols.forEach((col, i) => {
       weights[col] = parseFloat((C[i] / Csum).toFixed(4));
     });
   
     return normalizeWeights(weights, cols);
   }