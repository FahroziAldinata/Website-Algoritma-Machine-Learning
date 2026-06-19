/* ============================================
   SPK MODULES — weight-input.js
   Komponen UI untuk input bobot kriteria:
   - Render slider + number input per kriteria
   - Sinkronisasi slider ↔ number
   - Update total bar & status
   - Validasi total bobot = 1
   Dependensi: tidak ada
   ============================================ */

   'use strict';

   /**
    * Render daftar slider + number input untuk tiap kriteria.
    * @param {string}   wrapperId    - id elemen container
    * @param {string[]} cols         - nama kolom kriteria
    * @param {Object}   weights      - { colName: number } nilai bobot saat ini
    * @param {Object}   criteriaTypes - { colName: 'benefit'|'cost' }
    * @param {boolean}  readOnly     - true = disabled (untuk mode auto)
    * @param {Function} onChange     - callback(colName, newValue)
    */
   function buildWeightSliders(wrapperId, cols, weights, criteriaTypes, readOnly, onChange) {
     const wrap = document.getElementById(wrapperId);
     if (!wrap || cols.length === 0) return;
   
     const n         = cols.length;
     const defaultW  = parseFloat((1 / n).toFixed(4));
   
     let html = '<div class="weight-inputs-list">';
   
     cols.forEach(col => {
       const w    = weights[col] || defaultW;
       const type = criteriaTypes[col] || 'benefit';
   
       html += `
         <div class="weight-input-row">
           <div class="weight-input-label" title="${escHtmlWI(col)}">${escHtmlWI(col)}</div>
           <span class="weight-input-type ${type}">
             ${type === 'benefit' ? '+ B' : '– C'}
           </span>
           <input type="range"
             class="weight-row-slider weight-slider"
             data-col="${escHtmlWI(col)}"
             min="0" max="1" step="0.001"
             value="${w}"
             ${readOnly ? 'disabled' : ''} />
           <input type="number"
             class="weight-row-number"
             data-col="${escHtmlWI(col)}"
             min="0" max="1" step="0.001"
             value="${w}"
             ${readOnly ? 'disabled readonly' : ''} />
         </div>`;
     });
   
     html += '</div>';
     wrap.innerHTML = html;
   
     // ── Bind slider → number ──
     wrap.querySelectorAll('.weight-row-slider').forEach(slider => {
       slider.addEventListener('input', () => {
         _syncWeightInput(slider, false, onChange);
       });
     });
   
     // ── Bind number → slider ──
     wrap.querySelectorAll('.weight-row-number').forEach(num => {
       num.addEventListener('input', () => {
         _syncWeightInput(num, true, onChange);
       });
     });
   }
   
   /**
    * Sinkronisasi nilai slider ↔ number input.
    * @param {HTMLElement} input      - elemen yang berubah
    * @param {boolean}     fromNumber - true jika perubahan dari number input
    * @param {Function}    onChange   - callback(colName, newValue)
    */
   function _syncWeightInput(input, fromNumber, onChange) {
     const col = input.dataset.col;
     const val = parseFloat(input.value) || 0;
     const row = input.closest('.weight-input-row');
   
     if (row) {
       if (fromNumber) {
         const slider = row.querySelector('.weight-row-slider');
         if (slider) slider.value = val;
       } else {
         const num = row.querySelector('.weight-row-number');
         if (num) num.value = val.toFixed(3);
       }
     }
   
     if (onChange) onChange(col, val);
   }
   
   /**
    * Update progress bar dan label total bobot.
    * @param {string}   fillId   - id elemen progress fill
    * @param {string}   labelId  - id elemen label total
    * @param {string}   statusId - id elemen status text
    * @param {string[]} cols     - nama kolom kriteria
    * @param {Object}   weights  - { colName: number }
    */
   function updateWeightTotalBar(fillId, labelId, statusId, cols, weights) {
     const total = cols.reduce((s, c) => s + (weights[c] || 0), 0);
     const pct   = Math.min(total / 1, 1) * 100;
     const diff  = Math.abs(total - 1);
   
     const fill   = document.getElementById(fillId);
     const label  = document.getElementById(labelId);
     const status = document.getElementById(statusId);
   
     if (fill) {
       fill.style.width = pct + '%';
       fill.classList.toggle('over', total > 1.001);
     }
   
     if (label) {
       label.textContent = `Total: ${total.toFixed(3)}`;
     }
   
     if (status) {
       if (diff < 0.001) {
         status.textContent = '✓ Total tepat';
         status.className   = 'weight-total-status ok';
       } else if (total > 1.001) {
         status.textContent = `↑ Melebihi 1 (${(total - 1).toFixed(3)})`;
         status.className   = 'weight-total-status over';
       } else {
         status.textContent = `↓ Kurang ${(1 - total).toFixed(3)}`;
         status.className   = 'weight-total-status under';
       }
     }
   }
   
   /**
    * Cek apakah total bobot valid (mendekati 1).
    * @param {string[]} cols    - nama kolom kriteria
    * @param {Object}   weights - { colName: number }
    * @param {number}   tolerance - default 0.01
    * @returns {boolean}
    */
   function isWeightValid(cols, weights, tolerance = 0.01) {
     const total = cols.reduce((s, c) => s + (weights[c] || 0), 0);
     return Math.abs(total - 1) < tolerance;
   }
   
   /**
    * Escape HTML — helper internal agar module berdiri sendiri.
    * @param {*} str
    * @returns {string}
    */