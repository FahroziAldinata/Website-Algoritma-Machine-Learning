/**
 * src/core/algorithm_interface.js
 * AlgorithmPlugin Interface Class
 * 
 * Tujuan: Menyediakan kontrak standar (interface) untuk seluruh plugin algoritma.
 * Setiap plugin wajib mewarisi kelas ini agar dapat terintegrasi dengan Core SPA Shell
 * dan dapat dieksekusi secara asinkron di dalam Generic Web Worker.
 */

class AlgorithmPlugin {
  /** @type {string} Identitas unik algoritma (e.g., 'knn', 'c45') */
  id;
  
  /** @type {string} Nama algoritma yang ditampilkan di UI */
  name;
  
  /** @type {object} Skema konfigurasi parameter untuk pembuatan form di UI secara dinamis */
  configSchema;

  constructor() {
    if (this.constructor === AlgorithmPlugin) {
      throw new Error('AlgorithmPlugin adalah kelas abstrak dan tidak bisa diinstansiasi secara langsung.');
    }
  }

  /**
   * Logika utama perhitungan algoritma (dapat dipicu di background thread Web Worker)
   * @param {Array} trainData - Matriks data training (sudah ternormalisasi/encoded jika perlu)
   * @param {Array} testData - Matriks data testing (sudah ternormalisasi/encoded jika perlu)
   * @param {object} config - Nilai parameter konfigurasi dari UI
   * @param {function} onProgress - Callback progress: (step, message, pct) => void
   * @returns {Promise<object>} Objek hasil perhitungan model
   */
  async process(trainData, testData, config, onProgress) {
    throw new Error(`Plugin [${this.name}] belum mengimplementasikan metode process().`);
  }

  /**
   * Menggambar representasi visual dan tabel perhitungan manual di DOM (hanya di Main Thread)
   * @param {object} result - Objek hasil kalkulasi dari method process()
   * @param {HTMLElement} container - Kontainer DOM penampung hasil
   */
  renderHTML(result, container) {
    throw new Error(`Plugin [${this.name}] belum mengimplementasikan metode renderHTML().`);
  }

  /**
   * Membuat workbook SheetJS berisi formula berantai dinamis (hanya di Main Thread)
   * @param {object} result - Objek hasil kalkulasi dari method process()
   * @param {string} mode - Mode ekspor: 'plain' | 'formula'
   * @returns {object} Pustaka workbook SheetJS (XLSX Book)
   */
  exportExcel(result, mode) {
    throw new Error(`Plugin [${this.name}] belum mengimplementasikan metode exportExcel().`);
  }

  /**
   * Membangun blok panel HTML yang menampilkan panduan formula Excel step-by-step.
   * Digunakan di renderHTML() sebagai komponen edukasi — menampilkan sel-sel Excel
   * yang dapat disalin pengguna ke spreadsheet mereka sendiri.
   *
   * @param {string} blockId - ID unik elemen DOM (untuk toggle collapsible)
   * @param {Array<{cell:string, formula:string, comment:string}>} rows - Daftar sel panduan
   * @returns {string} HTML panel collapsible formula Excel
   */
  _buildExcelBlock(blockId, rows) {
    if (!rows || rows.length === 0) return '';

    const esc = (v) => {
      if (v === null || v === undefined) return '';
      return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };

    const rowsHtml = rows.map(r => {
      const isFormula = String(r.formula || '').startsWith('=');
      return `<tr>
          <td class="mono" style="color:var(--text3);white-space:nowrap;padding:4px 10px;">${esc(r.cell)}</td>
          <td class="mono" style="color:${isFormula ? 'var(--green)' : 'var(--accent)'};word-break:break-all;padding:4px 10px;">${esc(r.formula)}</td>
          <td style="color:var(--text3);font-size:11px;padding:4px 10px;">${esc(r.comment)}</td>
        </tr>`;
    }).join('');

    return `<details class="excel-block" id="${esc(blockId)}" style="margin-top:12px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">
        <summary style="cursor:pointer;padding:8px 14px;background:var(--bg3);font-size:12px;font-family:var(--mono);color:var(--text2);display:flex;align-items:center;gap:8px;user-select:none;list-style:none;">
          <span style="color:var(--green)">&#9654;</span>
          <span>Panduan Formula Excel (klik untuk tampilkan)</span>
          <span style="margin-left:auto;font-size:10px;color:var(--text3)">${rows.length} sel</span>
        </summary>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead>
              <tr style="background:var(--bg4);">
                <th style="padding:5px 10px;text-align:left;color:var(--text3);font-weight:500;white-space:nowrap;">Sel</th>
                <th style="padding:5px 10px;text-align:left;color:var(--text3);font-weight:500;">Isi / Formula</th>
                <th style="padding:5px 10px;text-align:left;color:var(--text3);font-weight:500;">Keterangan</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </details>`;
  }
}

// Ekspos ke global context agar kompatibel dengan Worker classic dan ES modules
if (typeof window !== 'undefined') {
  window.AlgorithmPlugin = AlgorithmPlugin;
} else if (typeof self !== 'undefined') {
  self.AlgorithmPlugin = AlgorithmPlugin;
}
