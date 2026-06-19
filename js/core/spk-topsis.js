/* ============================================
   SPK CORE — spk-topsis.js
   Technique for Order Preference by Similarity
   to Ideal Solution (TOPSIS)
   Dependensi: buildRanking() dari spk-saw.js
   ============================================ */

   'use strict';

   /**
    * Hitung ranking dengan metode TOPSIS.
    * @param {Object} dm - Decision matrix dari buildDecisionMatrix()
    *   { labels: string[], matrix: number[][], cols: string[] }
    * @param {Object} weights - { colName: number }
    * @param {Object} criteriaTypes - { colName: 'benefit'|'cost' }
    * @returns {Object} hasil ranking + detail tahapan
    */
   function calcTOPSIS(dm, weights, criteriaTypes) {
     const { labels, matrix, cols } = dm;
     const m = matrix.length;
     const n = cols.length;
   
     // ── Langkah 1: Normalisasi vektor (Euclidean) ──
     const normalized = matrix.map(r => r.slice());
   
     for (let j = 0; j < n; j++) {
       const norm = Math.sqrt(matrix.reduce((s, r) => s + r[j] ** 2, 0));
       for (let i = 0; i < m; i++) {
         normalized[i][j] = norm === 0 ? 0 : matrix[i][j] / norm;
       }
     }
   
     // ── Langkah 2: Matriks ternormalisasi terbobot ──
     const weighted = normalized.map(row =>
       row.map((v, j) => v * (weights[cols[j]] || 0))
     );
   
     // ── Langkah 3: Solusi ideal positif (A+) dan negatif (A-) ──
     const idealPos = cols.map((col, j) => {
       const vals = weighted.map(r => r[j]);
       return (criteriaTypes[col] || 'benefit') === 'benefit'
         ? Math.max(...vals)
         : Math.min(...vals);
     });
   
     const idealNeg = cols.map((col, j) => {
       const vals = weighted.map(r => r[j]);
       return (criteriaTypes[col] || 'benefit') === 'benefit'
         ? Math.min(...vals)
         : Math.max(...vals);
     });
   
     // ── Langkah 4: Jarak Euclidean ke solusi ideal ──
     const dPos = weighted.map(row =>
       Math.sqrt(row.reduce((s, v, j) => s + (v - idealPos[j]) ** 2, 0))
     );
   
     const dNeg = weighted.map(row =>
       Math.sqrt(row.reduce((s, v, j) => s + (v - idealNeg[j]) ** 2, 0))
     );
   
     // ── Langkah 5: Closeness coefficient (CC) ──
     const scores = dPos.map((dp, i) => {
       const dn = dNeg[i];
       return (dp + dn) === 0 ? 0 : dn / (dp + dn);
     });
   
     return buildRanking(labels, scores, {
       normalized,
       weighted,
       idealPos,
       idealNeg,
       dPos,
       dNeg,
       method: 'TOPSIS',
     });
   }