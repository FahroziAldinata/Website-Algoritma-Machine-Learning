/* ============================================
   SPK MODULES — table-renderer.js
   Render tabel preview, manual input, dan
   matriks keputusan ke dalam DOM
   Dependensi: tidak ada
   ============================================ */

   'use strict';

   /**
    * Render tabel preview data ke dalam elemen thead dan tbody.
    * @param {Array[][]} data     - array 2D, baris pertama = header
    * @param {string}    theadId  - id elemen <thead>
    * @param {string}    tbodyId  - id elemen <tbody>
    * @param {number}    maxRows  - maksimal baris yang ditampilkan
    */
   function renderPreviewTable(data, theadId, tbodyId, maxRows = 10) {
     const thead = document.getElementById(theadId);
     const tbody = document.getElementById(tbodyId);
     if (!thead || !tbody || !data || data.length === 0) return;
   
     // ── Header ──
     thead.innerHTML = '<tr>' +
       data[0].map(h => `<th>${escHtml(String(h))}</th>`).join('') +
     '</tr>';
   
     // ── Body ──
     const rows = data.slice(1, maxRows + 1);
     tbody.innerHTML = rows.map(row =>
       '<tr>' +
         row.map(cell => `<td>${escHtml(String(cell ?? ''))}</td>`).join('') +
       '</tr>'
     ).join('');
   
     // ── Indikator baris tersembunyi ──
     const remaining = data.length - 1 - maxRows;
     if (remaining > 0) {
       tbody.innerHTML += `
         <tr>
           <td colspan="${data[0].length}"
             style="text-align:center;color:var(--text-muted);font-style:italic;padding:10px;">
             … dan ${remaining} baris lainnya
           </td>
         </tr>`;
     }
   }
   
   /**
    * Bangun tabel input manual yang bisa diedit langsung.
    * @param {Array[][]} data      - array 2D, baris pertama = header
    * @param {string}    theadId   - id elemen <thead>
    * @param {string}    tbodyId   - id elemen <tbody>
    * @param {Function}  onHeaderChange - callback(colIndex, newValue)
    * @param {Function}  onCellChange   - callback(rowIndex, colIndex, newValue)
    */
   function buildManualInputTable(data, theadId, tbodyId, onHeaderChange, onCellChange) {
     const thead = document.getElementById(theadId);
     const tbody = document.getElementById(tbodyId);
     if (!thead || !tbody) return;
   
     // ── Header row dengan input yang bisa diedit ──
     let thHTML = '<tr>';
     data[0].forEach((h, i) => {
       if (i === 0) {
         thHTML += `<th>Label</th>`;
       } else {
         thHTML += `
           <th class="editable-header">
             <input type="text"
               value="${escHtml(h)}"
               data-col="${i}"
               placeholder="K${i}" />
           </th>`;
       }
     });
     thHTML += '</tr>';
     thead.innerHTML = thHTML;
   
     // ── Body rows dengan input numerik ──
     let tbHTML = '';
     data.slice(1).forEach((row, ri) => {
       tbHTML += '<tr>';
       row.forEach((cell, ci) => {
         if (ci === 0) {
           tbHTML += `
             <td>
               <input type="text"
                 value="${escHtml(cell)}"
                 data-row="${ri}" data-col="0"
                 placeholder="A${ri + 1}" />
             </td>`;
         } else {
           tbHTML += `
             <td>
               <input type="number"
                 value="${cell}"
                 data-row="${ri}" data-col="${ci}"
                 step="any" placeholder="0" />
             </td>`;
         }
       });
       tbHTML += '</tr>';
     });
     tbody.innerHTML = tbHTML;
   
     // ── Bind header rename ──
     thead.querySelectorAll('input').forEach(inp => {
       inp.addEventListener('input', () => {
         if (onHeaderChange) onHeaderChange(parseInt(inp.dataset.col), inp.value);
       });
     });
   
     // ── Bind cell edits ──
     tbody.querySelectorAll('input').forEach(inp => {
       inp.addEventListener('input', () => {
         if (onCellChange) {
           const ri  = parseInt(inp.dataset.row);
           const ci  = parseInt(inp.dataset.col);
           const val = ci === 0 ? inp.value : (parseFloat(inp.value) || inp.value);
           onCellChange(ri, ci, val);
         }
       });
     });
   }
   
   /**
    * Escape HTML untuk mencegah XSS saat render ke DOM.
    * Dipakai internal — juga tersedia di input.js dan result.js
    * tapi diduplikasi di sini agar module ini berdiri sendiri.
    * @param {*} str
    * @returns {string}
    */
   function escHtml(str) {
     return String(str)
       .replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;');
   }