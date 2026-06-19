/* ============================================
   SPK CORE — calculation-engine.js
   Orkestrator utama: buildDecisionMatrix(),
   runSPK(), dan buildRanking() dipindah ke sini
   dari spk-saw.js secara permanen.

   Dependensi (harus dimuat sebelum file ini):
   - spk-saw.js
   - spk-topsis.js
   - spk-waspas.js
   - spk-moora.js
   - spk-edas.js
   ============================================ */

   'use strict';

   /**
    * Bangun decision matrix dari State.
    * @param {Object} state - State lengkap dari input.js
    *   { rawData, labelCol, selectedCols }
    * @returns {Object} { labels, matrix, cols }
    */
   function buildDecisionMatrix(state) {
     const headers  = state.rawData[0];
     const rows     = state.rawData.slice(1);
     const labelIdx = headers.indexOf(state.labelCol);
   
     const labels = rows.map((row, i) =>
       labelIdx >= 0 ? String(row[labelIdx]) : `A${i + 1}`
     );
   
     const matrix = rows.map(row =>
       state.selectedCols.map(col => {
         const ci = headers.indexOf(col);
         return parseFloat(row[ci]) || 0;
       })
     );
   
     return { labels, matrix, cols: state.selectedCols };
   }
   
   /**
    * Jalankan metode SPK sesuai pilihan.
    * @param {Object} dm     - hasil buildDecisionMatrix()
    * @param {string} method - 'saw'|'topsis'|'waspas'|'moora'|'edas'
    * @param {Object} weights       - { colName: number }
    * @param {Object} criteriaTypes - { colName: 'benefit'|'cost' }
    * @param {number} lambda        - khusus WASPAS, default 0.5
    * @returns {Object} hasil ranking + detail tahapan
    */
   function runSPK(dm, method, weights, criteriaTypes, lambda = 0.5) {
     switch (method) {
       case 'saw':    return calcSAW(dm, weights, criteriaTypes);
       case 'topsis': return calcTOPSIS(dm, weights, criteriaTypes);
       case 'waspas': return calcWASPAS(dm, weights, criteriaTypes, lambda);
       case 'moora':  return calcMOORA(dm, weights, criteriaTypes);
       case 'edas':   return calcEDAS(dm, weights, criteriaTypes);
       default:       return calcSAW(dm, weights, criteriaTypes);
     }
   }