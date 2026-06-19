/* ============================================
   SPK CORE — spk-moora.js
   Multi-Objective Optimization on the Basis
   of Ratio Analysis (MOORA)
   Dependensi: buildRanking() dari spk-saw.js
   ============================================ */

   'use strict';

   /**
    * Hitung ranking dengan metode MOORA.
    * @param {Object} dm - Decision matrix dari buildDecisionMatrix()
    *   { labels: string[], matrix: number[][], cols: string[] }
    * @param {Object} weights - { colName: number }
    * @param {Object} criteriaTypes - { colName: 'benefit'|'cost' }
    * @returns {Object} hasil ranking + detail tahapan
    */
   function calcMOORA(dm, weights, criteriaTypes) {
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
   
     // ── Langkah 3: Yi = Σ benefit − Σ cost ──
     const scores = weighted.map(row =>
       cols.reduce((s, col, j) => {
         const type = criteriaTypes[col] || 'benefit';
         return type === 'benefit' ? s + row[j] : s - row[j];
       }, 0)
     );
   
     return buildRanking(labels, scores, {
       normalized,
       weighted,
       method: 'MOORA',
     });
   }