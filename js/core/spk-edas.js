/* ============================================
   SPK CORE — spk-edas.js
   Evaluation based on Distance from Average
   Solution (EDAS)
   Dependensi: buildRanking() dari spk-saw.js
   ============================================ */

   'use strict';

   /**
    * Hitung ranking dengan metode EDAS.
    * @param {Object} dm - Decision matrix dari buildDecisionMatrix()
    *   { labels: string[], matrix: number[][], cols: string[] }
    * @param {Object} weights - { colName: number }
    * @param {Object} criteriaTypes - { colName: 'benefit'|'cost' }
    * @returns {Object} hasil ranking + detail tahapan
    */
   function calcEDAS(dm, weights, criteriaTypes) {
     const { labels, matrix, cols } = dm;
     const m = matrix.length;
     const n = cols.length;
   
     // ── Langkah 1: Hitung rata-rata solusi (AV) ──
     const avgSol = cols.map((_, j) =>
       matrix.reduce((s, r) => s + r[j], 0) / m
     );
   
     // ── Langkah 2: Positive Distance from Average (PDA) ──
     const PDA = matrix.map(row =>
       cols.map((col, j) => {
         const type = criteriaTypes[col] || 'benefit';
         const diff = type === 'benefit'
           ? Math.max(0, row[j] - avgSol[j])
           : Math.max(0, avgSol[j] - row[j]);
         return avgSol[j] === 0 ? 0 : diff / avgSol[j];
       })
     );
   
     // ── Langkah 3: Negative Distance from Average (NDA) ──
     const NDA = matrix.map(row =>
       cols.map((col, j) => {
         const type = criteriaTypes[col] || 'benefit';
         const diff = type === 'benefit'
           ? Math.max(0, avgSol[j] - row[j])
           : Math.max(0, row[j] - avgSol[j]);
         return avgSol[j] === 0 ? 0 : diff / avgSol[j];
       })
     );
   
     // ── Langkah 4: Weighted SP dan SN ──
     const SP = PDA.map(row =>
       cols.reduce((s, col, j) => s + (weights[col] || 0) * row[j], 0)
     );
     const SN = NDA.map(row =>
       cols.reduce((s, col, j) => s + (weights[col] || 0) * row[j], 0)
     );
   
     // ── Langkah 5: Normalisasi SP dan SN ──
     const maxSP = Math.max(...SP);
     const maxSN = Math.max(...SN);
   
     const NSP = SP.map(v => maxSP === 0 ? 0 : v / maxSP);
     const NSN = SN.map(v => maxSN === 0 ? 1 : 1 - v / maxSN);
   
     // ── Langkah 6: Appraisal Score (AS) ──
     const scores = NSP.map((v, i) => 0.5 * (v + NSN[i]));
   
     return buildRanking(labels, scores, {
       avgSol,
       PDA,
       NDA,
       SP,
       SN,
       NSP,
       NSN,
       method: 'EDAS',
     });
   }