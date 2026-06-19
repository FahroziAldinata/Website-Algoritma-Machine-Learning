/* ============================================
   SPK MODULES — weighting-entropy.js
   Pembobotan otomatis menggunakan metode
   Entropy (Shannon Information Theory)
   Dependensi: tidak ada
   ============================================ */

   'use strict';

   /**
    * Hitung bobot otomatis menggunakan metode Entropy.
    * Kriteria dengan variasi data tinggi mendapat bobot lebih besar.
    * @param {string[]} cols    - nama kolom kriteria yang dipilih
    * @param {Array[]}  rows    - rawData.slice(1) — baris data tanpa header
    * @param {string[]} headers - rawData[0] — baris header
    * @returns {Object} { colName: number } — total bobot = 1
    */
   function calcEntropyWeights(cols, rows, headers) {
     const m = rows.length;
   
     // ── Langkah 1: Bangun matrix numerik [col][row] ──
     const matrix = cols.map(col => {
       const ci = headers.indexOf(col);
       return rows.map(row => parseFloat(row[ci]) || 0);
     });
   
     // ── Langkah 2: Normalisasi sum per kolom ──
     const normalized = matrix.map(col => {
       const sum = col.reduce((a, b) => a + b, 0);
       return sum === 0
         ? col.map(() => 1 / m)
         : col.map(v => v / sum);
     });
   
     // ── Langkah 3: Hitung entropy tiap kolom ──
     const entropies = normalized.map(col => {
       const e = col.reduce((sum, p) => {
         if (p <= 0) return sum;
         return sum - p * Math.log(p);
       }, 0);
       return e / Math.log(m); // normalisasi ke [0,1]
     });
   
     // ── Langkah 4: Degree of divergence ──
     const d    = entropies.map(e => 1 - e);
     const dSum = d.reduce((a, b) => a + b, 0);
   
     // ── Langkah 5: Fallback jika semua sama ──
     if (dSum === 0) {
       const w = 1 / cols.length;
       return Object.fromEntries(
         cols.map(c => [c, parseFloat(w.toFixed(4))])
       );
     }
   
     // ── Langkah 6: Hitung bobot ──
     const weights = {};
     cols.forEach((col, i) => {
       weights[col] = parseFloat((d[i] / dSum).toFixed(4));
     });
   
     return normalizeWeights(weights, cols);
   }
   
   /**
    * Normalisasi bobot agar totalnya tepat = 1.
    * Dipakai oleh Entropy dan CRITIC.
    * @param {Object}   weights - { colName: number }
    * @param {string[]} cols    - daftar kolom
    * @returns {Object} weights yang sudah dinormalisasi
    */
   function normalizeWeights(weights, cols) {
     const sum = cols.reduce((s, c) => s + (weights[c] || 0), 0);
     if (Math.abs(sum - 1) < 0.001) return weights;
     const out = {};
     cols.forEach(c => {
       out[c] = parseFloat((weights[c] / sum).toFixed(4));
     });
     return out;
   }