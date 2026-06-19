/* ============================================
   SPK UTILS — helpers.js
   Fungsi utilitas bersama — menghilangkan
   duplikasi dari: input.js, result.js,
   print-preview.js, export-xlsx.js,
   export-xlsx-plain.js, weight-input.js,
   table-renderer.js

   CARA PAKAI:
   Muat file ini PERTAMA sebelum semua script lain
   di setiap halaman HTML:
     <script src="js/utils/helpers.js"></script>

   Semua fungsi di bawah bersifat global (window.*),
   sehingga langsung bisa dipakai tanpa import.
   ============================================ */

   'use strict';

   /* ──────────────────────────────────────────
      1. escHtml
      Menggantikan: escHtml() di input.js & result.js
                    esc() di print-preview.js
                    escHtmlWI() di weight-input.js
                    escHtml() di table-renderer.js
   ────────────────────────────────────────── */
   function escHtml(str) {
     return String(str)
       .replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;');
   }
   
   // Alias untuk print-preview.js yang pakai nama esc()
   const esc = escHtml;
   
   // Alias untuk weight-input.js yang pakai nama escHtmlWI()
   const escHtmlWI = escHtml;
   
   
   /* ──────────────────────────────────────────
      2. fmt
      Menggantikan: fmt() di result.js & print-preview.js
      Pakai threshold 0.0001 (lebih presisi dari
      versi result.js yang pakai 0.001)
   ────────────────────────────────────────── */
   function fmt(v) {
     if (v === null || v === undefined || isNaN(v)) return '—';
     const n = parseFloat(v);
     if (Math.abs(n) < 0.0001 && n !== 0) return n.toExponential(3);
     return n.toFixed(4);
   }
   
   
   /* ──────────────────────────────────────────
      3. cap
      Menggantikan: cap() di input.js, result.js,
                    print-preview.js
   ────────────────────────────────────────── */
   function cap(s) {
     if (!s) return '';
     return s.charAt(0).toUpperCase() + s.slice(1);
   }
   
   
   /* ──────────────────────────────────────────
      4. setEl
      Menggantikan: setEl() di input.js & result.js
   ────────────────────────────────────────── */
   function setEl(id, text) {
     const el = document.getElementById(id);
     if (el) el.textContent = text;
   }
   
   
   /* ──────────────────────────────────────────
      5. delay
      Menggantikan: delay() di input.js
   ────────────────────────────────────────── */
   function delay(ms) {
     return new Promise(resolve => setTimeout(resolve, ms));
   }
   
   
   /* ──────────────────────────────────────────
      6. showToast
      Wrapper ringkas — pakai window.Toast jika ada
      Menggantikan: showToast() di result.js & input.js
   ────────────────────────────────────────── */
   function showToast(msg) {
     if (window.Toast) window.Toast.show(msg);
     else console.log('[Toast]', msg);
   }
   
   
   /* ──────────────────────────────────────────
      7. getIntermediateData
      Mengekstrak label + matrix dari payload R
      (sessionStorage) atau dari objek State.
      Menggantikan duplikasi antara:
        - getStepBaseData() di result.js
        - _getMatrix() di export-xlsx.js
        - _plainGetMatrix() di export-xlsx-plain.js
   
      @param {Object} source - R (result) atau State (input)
      @returns {{ labels, matrix, headers, rows }}
   ────────────────────────────────────────── */
   function getIntermediateData(source) {
     const rawData    = source.rawData;
     const labelCol   = source.labelCol;
     const selectedCols = source.selectedCols;
   
     const headers  = rawData[0];
     const rows     = rawData.slice(1);
     const labelIdx = headers.indexOf(labelCol);
     const labels   = rows.map((r, i) => labelIdx >= 0 ? String(r[labelIdx]) : `A${i + 1}`);
     const matrix   = rows.map(row =>
       selectedCols.map(col => parseFloat(row[headers.indexOf(col)]) || 0)
     );
   
     return { labels, matrix, headers, rows };
   }
   
   
   /* ──────────────────────────────────────────
      8. buildRankList
      Sort scores menjadi ranked array.
      Menggantikan pattern sort+rank yang ditulis
      10+ kali di export-xlsx.js & export-xlsx-plain.js
   
      @param {string[]} labels
      @param {number[]} scores
      @param {Object}   extra  - field tambahan per item (opsional)
                                 contoh: { dp: dPos, dn: dNeg }
      @returns {Array} sorted ranked items
   ────────────────────────────────────────── */
   function buildRankList(labels, scores, extra = {}) {
     return labels
       .map((lbl, i) => {
         const item = { lbl, score: scores[i] };
         // tambahkan field extra per index jika ada
         Object.keys(extra).forEach(k => {
           item[k] = Array.isArray(extra[k]) ? extra[k][i] : extra[k];
         });
         return item;
       })
       .sort((a, b) => b.score - a.score)
       .map((item, ri) => ({ ...item, rank: ri + 1 }));
   }
   
   
   /* ──────────────────────────────────────────
      9. normalizeLinear
      Normalisasi linear benefit/cost.
      Dipakai oleh: SAW, WASPAS, EDAS
      Menggantikan blok for-loop yang sama di
      result.js (buildStepsSAW/WASPAS/EDAS),
      print-preview.js, export-xlsx.js,
      export-xlsx-plain.js
   
      @param {number[][]} matrix
      @param {string[]}   cols
      @param {Object}     criteriaTypes
      @returns {number[][]} normalized matrix
   ────────────────────────────────────────── */
   function normalizeLinear(matrix, cols, criteriaTypes) {
     const m = matrix.length;
     const n = cols.length;
     const result = matrix.map(r => r.slice());
   
     for (let j = 0; j < n; j++) {
       const vals = matrix.map(r => r[j]);
       const max  = Math.max(...vals);
       const min  = Math.min(...vals);
       const type = criteriaTypes[cols[j]] || 'benefit';
   
       for (let i = 0; i < m; i++) {
         result[i][j] = type === 'benefit'
           ? (max === 0 ? 0 : matrix[i][j] / max)
           : (matrix[i][j] === 0 ? 0 : min / matrix[i][j]);
       }
     }
     return result;
   }
   
   
   /* ──────────────────────────────────────────
      10. normalizeEuclidean
      Normalisasi vektor Euclidean.
      Dipakai oleh: TOPSIS, MOORA
      Menggantikan blok for-loop yang sama di
      result.js, print-preview.js,
      export-xlsx.js, export-xlsx-plain.js
   
      @param {number[][]} matrix
      @returns {number[][]} normalized matrix
   ────────────────────────────────────────── */
   function normalizeEuclidean(matrix) {
     const m = matrix.length;
     const n = matrix[0].length;
     const result = matrix.map(r => r.slice());
   
     for (let j = 0; j < n; j++) {
       const d = Math.sqrt(matrix.reduce((s, r) => s + r[j] ** 2, 0));
       for (let i = 0; i < m; i++) {
         result[i][j] = d === 0 ? 0 : matrix[i][j] / d;
       }
     }
     return result;
   }
   
   
   /* ──────────────────────────────────────────
      Ekspor ke window agar tersedia secara global
      (tidak diperlukan jika file ini dimuat via
      <script> biasa, tapi explicit lebih aman)
   ────────────────────────────────────────── */
   if (typeof window !== 'undefined') {
     window.escHtml    = escHtml;
     window.esc        = esc;
     window.escHtmlWI  = escHtmlWI;
     window.fmt        = fmt;
     window.cap        = cap;
     window.setEl      = setEl;
     window.delay      = delay;
     window.showToast  = showToast;
     window.getIntermediateData = getIntermediateData;
     window.buildRankList       = buildRankList;
     window.normalizeLinear     = normalizeLinear;
     window.normalizeEuclidean  = normalizeEuclidean;
   }