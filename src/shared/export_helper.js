/**
 * src/shared/export_helper.js
 * Excel Export Utility Helper Module
 * 
 * Tujuan: Menyediakan fungsi utilitas pembungkus (wrapper) untuk pustaka SheetJS (XLSX).
 * Membantu pembuatan formula Excel dinamis (Cell Reference Chain) dan manipulasi
 * workbook/worksheet tanpa menduplikasi kode di setiap berkas plugin.
 */

/**
 * Mengubah index kolom 0-based menjadi huruf Excel (0 -> A, 25 -> Z, 26 -> AA)
 * @param {number} c - Index kolom (0-based)
 * @returns {string} Huruf kolom Excel
 */
function col2l(c) {
  let s = "";
  c++;
  while (c > 0) {
    c--;
    s = String.fromCharCode(65 + (c % 26)) + s;
    c = Math.floor(c / 26);
  }
  return s;
}

/**
 * Membuat alamat sel Excel dari koordinat baris & kolom 0-based (0, 0 -> A1)
 * @param {number} r - Index baris (0-based)
 * @param {number} c - Index kolom (0-based)
 * @returns {string} Alamat sel Excel (misal: "B3")
 */
function rc(r, c) {
  return col2l(c) + (r + 1);
}

/**
 * Membuat referensi sel antar sheet (cross-sheet cell reference)
 * @param {string} sheetName - Nama worksheet target
 * @param {string} addr - Alamat sel target (misal: "A1" atau "B3:C4")
 * @returns {string} Referensi lengkap cross-sheet (misal: "'S1_Dataset'!A1")
 */
function xref(sheetName, addr) {
  return `'${sheetName}'!${addr}`;
}

/**
 * Membulatkan angka ke 8 desimal untuk menghindari noise floating point Excel
 * @param {*} v - Nilai angka
 * @returns {number|*} Angka hasil pembulatan (atau nilai asli jika bukan number)
 */
function n8(v) {
  if (typeof v !== 'number') return v;
  return Math.round(v * 1e8) / 1e8;
}

/**
 * Membuat objek sel berupa formula Excel
 * @param {string} f - Formula teks Excel (tanpa tanda sama dengan di depan)
 * @returns {object} Objek sel SheetJS
 */
function fc(f) {
  return { t: "n", f: String(f) };
}

/**
 * Membuat objek sel berupa string teks biasa
 * @param {*} s - Nilai teks
 * @returns {object} Objek sel SheetJS
 */
function sc(s) {
  return { t: "s", v: String(s) };
}

/**
 * Membuat objek sel berupa angka numerik murni
 * @param {*} v - Nilai angka
 * @returns {number} Angka numerik desimal
 */
function nc(v) {
  if (typeof v === "number") return v;
  const num = parseFloat(v);
  return isNaN(num) ? 0 : num;
}

/**
 * Membuat workbook SheetJS baru
 * @returns {object} Workbook baru
 */
function newWB() {
  if (typeof XLSX === 'undefined') {
    throw new Error('Pustaka SheetJS (XLSX) tidak terdeteksi. Pastikan script xlsx.full.min.js telah dimuat.');
  }
  return XLSX.utils.book_new();
}

/**
 * Mengubah array-of-arrays (AOA) menjadi worksheet SheetJS
 * @param {Array} data - Array data dua dimensi
 * @returns {object} Worksheet baru
 */
function aoaToWS(data) {
  if (typeof XLSX === 'undefined') {
    throw new Error('Pustaka SheetJS (XLSX) tidak terdeteksi.');
  }
  return XLSX.utils.aoa_to_sheet(data);
}

/**
 * Menambahkan worksheet ke workbook
 * @param {object} WB - Objek workbook
 * @param {object} ws - Objek worksheet
 * @param {string} name - Nama worksheet yang akan ditambahkan
 */
function addWS(WB, ws, name) {
  if (typeof XLSX === 'undefined') {
    throw new Error('Pustaka SheetJS (XLSX) tidak terdeteksi.');
  }
  XLSX.utils.book_append_sheet(WB, ws, name);
}

/**
 * Menyimpan workbook sebagai file Excel lokal (.xlsx)
 * @param {object} WB - Objek workbook
 * @param {string} filename - Nama berkas keluaran
 */
function saveWB(WB, filename) {
  if (typeof XLSX === 'undefined') {
    throw new Error('Pustaka SheetJS (XLSX) tidak terdeteksi.');
  }
  XLSX.writeFile(WB, filename);
}

// Ekspos ke global context agar kompatibel dengan lingkungan Worker classic dan ES modules
if (typeof window !== 'undefined') {
  window.col2l = col2l;
  window.rc = rc;
  window.xref = xref;
  window.n8 = n8;
  window.fc = fc;
  window.sc = sc;
  window.nc = nc;
  window.newWB = newWB;
  window.aoaToWS = aoaToWS;
  window.addWS = addWS;
  window.saveWB = saveWB;
} else if (typeof self !== 'undefined') {
  self.col2l = col2l;
  self.rc = rc;
  self.xref = xref;
  self.n8 = n8;
  self.fc = fc;
  self.sc = sc;
  self.nc = nc;
  if (typeof XLSX !== 'undefined') {
    self.newWB = newWB;
    self.aoaToWS = aoaToWS;
    self.addWS = addWS;
    self.saveWB = saveWB;
  }
}
