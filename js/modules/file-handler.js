/* ============================================
   SPK MODULES — file-handler.js
   Menangani upload, parsing CSV dan Excel
   Dependensi: SheetJS (xlsx.full.min.js) untuk
   file Excel — harus dimuat sebelum file ini
   ============================================ */

   'use strict';

   /**
    * Validasi dan baca file yang diupload user.
    * @param {File}     file       - objek File dari input[type=file]
    * @param {Function} onSuccess  - callback(data: Array[][])
    * @param {Function} onError    - callback(message: string)
    * @param {Object}   options    - { delimiter: string, hasHeader: boolean }
    */
   function handleFile(file, onSuccess, onError, options = {}) {
     const ext = file.name.split('.').pop().toLowerCase();
   
     if (!['csv', 'xlsx', 'xls'].includes(ext)) {
       onError('Format file tidak didukung. Gunakan CSV, XLSX, atau XLS.');
       return;
     }
   
     const reader = new FileReader();
   
     reader.onload = e => {
       try {
         let data;
         if (ext === 'csv') {
           data = parseCSV(e.target.result, options);
         } else {
           data = parseExcel(e.target.result);
         }
   
         if (data && data.length > 1) {
           onSuccess(data, ext);
         } else {
           onError('File kosong atau tidak dapat dibaca.');
         }
       } catch (err) {
         onError('Gagal membaca file: ' + err.message);
       }
     };
   
     reader.onerror = () => onError('Gagal membaca file.');
   
     if (ext === 'csv') {
       reader.readAsText(file);
     } else {
       reader.readAsArrayBuffer(file);
     }
   }
   
   /**
    * Parse teks CSV menjadi array 2D.
    * @param {string} text    - isi file CSV sebagai string
    * @param {Object} options - { delimiter: string, hasHeader: boolean }
    * @returns {Array[][]}
    */
   function parseCSV(text, options = {}) {
     const delimiter = options.delimiter && options.delimiter !== 'auto'
       ? (options.delimiter === '\\t' ? '\t' : options.delimiter)
       : detectDelimiter(text);
   
     const lines = text.split(/\r?\n/).filter(l => l.trim());
     return lines.map(line => splitCSVLine(line, delimiter));
   }
   
   /**
    * Deteksi delimiter CSV secara otomatis dari baris pertama.
    * @param {string} text - isi file CSV
    * @returns {string} delimiter yang paling banyak ditemukan
    */
   function detectDelimiter(text) {
     const firstLine = text.split('\n')[0];
     const counts    = { ',': 0, ';': 0, '\t': 0, '|': 0 };
   
     for (const c of firstLine) {
       if (counts[c] !== undefined) counts[c]++;
     }
   
     return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
   }
   
   /**
    * Split satu baris CSV dengan memperhatikan quoted fields.
    * @param {string} line      - satu baris teks CSV
    * @param {string} delimiter - karakter pemisah
    * @returns {string[]}
    */
   function splitCSVLine(line, delimiter) {
     const result = [];
     let current  = '';
     let inQuotes = false;
   
     for (let i = 0; i < line.length; i++) {
       const ch = line[i];
       if (ch === '"') {
         inQuotes = !inQuotes;
       } else if (ch === delimiter && !inQuotes) {
         result.push(current.trim());
         current = '';
       } else {
         current += ch;
       }
     }
   
     result.push(current.trim());
     return result;
   }
   
   /**
    * Parse file Excel (xlsx/xls) menggunakan SheetJS.
    * @param {ArrayBuffer} buffer - hasil FileReader.readAsArrayBuffer
    * @returns {Array[][]}
    */
   function parseExcel(buffer) {
     if (typeof XLSX === 'undefined') {
       throw new Error(
         'Library SheetJS belum dimuat. Pastikan file lib/xlsx.full.min.js ada.'
       );
     }
   
     const wb   = XLSX.read(buffer, { type: 'array' });
     const ws   = wb.Sheets[wb.SheetNames[0]];
     const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
   
     return data.filter(row => row.some(cell => cell !== ''));
   }