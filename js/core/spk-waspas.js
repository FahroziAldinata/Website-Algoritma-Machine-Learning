/* ============================================
   SPK CORE — spk-waspas.js
   Weighted Aggregated Sum Product Assessment
   (WASPAS)
   Dependensi: buildRanking() dari spk-saw.js
   ============================================ */

   'use strict';

   /**
    * Hitung ranking dengan metode WASPAS.
    * @param {Object} dm - Decision matrix dari buildDecisionMatrix()
    *   { labels: string[], matrix: number[][], cols: string[] }
    * @param {Object} weights - { colName: number }
    * @param {Object} criteriaTypes - { colName: 'benefit'|'cost' }
    * @param {number} lambda - parameter 0–1, default 0.5
    *   lambda=1 → murni WSM, lambda=0 → murni WPM
    * @returns {Object} hasil ranking + detail tahapan
    */
   function calcWASPAS(dm, weights, criteriaTypes, lambda = 0.5) {
     const { labels, matrix, cols } = dm;
     const m = matrix.length;
     const n = cols.length;
   
     // ── Langkah 1: Normalisasi linear (sama seperti SAW) ──
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
   
     // ── Langkah 2: WSM — Weighted Sum Model ──
     const wsm = matrix.map((_, i) =>
       cols.reduce((s, col, j) => s + (weights[col] || 0) * normalized[i][j], 0)
     );
   
     // ── Langkah 3: WPM — Weighted Product Model ──
     const wpm = matrix.map((_, i) =>
       cols.reduce(
         (prod, col, j) => prod * (normalized[i][j] ** (weights[col] || 0)),
         1
       )
     );
   
     // ── Langkah 4: Skor akhir gabungan WSM + WPM ──
     const scores = wsm.map((w, i) => lambda * w + (1 - lambda) * wpm[i]);
   
     return buildRanking(labels, scores, {
       normalized,
       wsm,
       wpm,
       lambda,
       method: 'WASPAS',
     });
   }