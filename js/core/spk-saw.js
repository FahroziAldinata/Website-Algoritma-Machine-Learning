/* ============================================
   SPK CORE — spk-saw.js
   Simple Additive Weighting (SAW)
   Dependensi: State (weights, criteriaTypes)
   harus tersedia di scope global saat dipanggil
   ============================================ */

   'use strict';

   /**
    * Hitung ranking dengan metode SAW.
    * @param {Object} dm - Decision matrix dari buildDecisionMatrix()
    *   { labels: string[], matrix: number[][], cols: string[] }
    * @param {Object} weights - { colName: number }
    * @param {Object} criteriaTypes - { colName: 'benefit'|'cost' }
    * @returns {Object} hasil ranking + detail tahapan
    */
   function calcSAW(dm, weights, criteriaTypes) {
     const { labels, matrix, cols } = dm;
     const m = matrix.length;
     const n = cols.length;
   
     // ── Langkah 1: Normalisasi linear ──
     const normalized = matrix.map(row => row.map(() => 0));
   
     for (let j = 0; j < n; j++) {
       const colVals = matrix.map(r => r[j]);
       const max     = Math.max(...colVals);
       const min     = Math.min(...colVals);
       const type    = criteriaTypes[cols[j]] || 'benefit';
   
       for (let i = 0; i < m; i++) {
         if (type === 'benefit') {
           normalized[i][j] = max === 0 ? 0 : matrix[i][j] / max;
         } else {
           normalized[i][j] = matrix[i][j] === 0 ? 0 : min / matrix[i][j];
         }
       }
     }
   
     // ── Langkah 2: Penjumlahan terbobot ──
     const scores = matrix.map((_, i) => {
       return cols.reduce((sum, col, j) => {
         return sum + (weights[col] || 0) * normalized[i][j];
       }, 0);
     });
   
     return buildRanking(labels, scores, {
       normalized,
       method: 'SAW',
     });
   }
   
   
   /**
    * Susun hasil ranking dari label + scores.
    * Dipakai oleh semua metode SPK.
    * Akan dipindah ke calculation-engine.js nanti.
    * @param {string[]} labels
    * @param {number[]} scores
    * @param {Object} extra - data tambahan tiap metode
    * @returns {Object}
    */
   function buildRanking(labels, scores, extra) {
     const ranked = labels
       .map((label, i) => ({ label, score: scores[i], originalIndex: i }))
       .sort((a, b) => b.score - a.score)
       .map((item, rank) => ({ ...item, rank: rank + 1 }));
   
     return { labels, scores, ranked, ...extra };
   }