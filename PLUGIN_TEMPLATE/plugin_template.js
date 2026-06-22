/**
 * PLUGIN_TEMPLATE/plugin_template.js
 * Template Plugin Algoritma Machine Learning Baru
 * 
 * Salin file ini ke src/plugins/<id_plugin>/<id_plugin>_plugin.js
 * dan sesuaikan detail implementasinya.
 */

class NewAlgorithmPlugin extends AlgorithmPlugin {
  constructor() {
    super();
    // 1. Definisikan metadata dasar plugin
    this.id = 'new_algorithm';                  // ID unik plugin (harus sesuai dengan nama folder)
    this.name = 'Algoritma Baru';              // Nama algoritma yang akan tampil di UI
    this.icon = '&#9830;';                       // Entity HTML ikon (misalnya diamond, checkmark, dll.)
    this.description = 'Deskripsi singkat algoritma dan kegunaannya.';

    // 2. Definisikan parameter konfigurasi (config schema) yang akan dirender sebagai input form di UI
    this.configSchema = {
      learningRate: {
        label: 'Learning Rate (α)',
        type: 'number',                          // Tipe input: 'number' | 'select' | 'text' | 'checkbox'
        min: 0.001,
        max: 1.0,
        step: 0.001,
        default: 0.01
      },
      distanceMetric: {
        label: 'Metrik Jarak',
        type: 'select',
        options: [
          { value: 'euclidean', label: 'Euclidean Distance' },
          { value: 'manhattan', label: 'Manhattan Distance' }
        ],
        default: 'euclidean'
      },
      normalize: {
        label: 'Lakukan Normalisasi Min-Max',
        type: 'checkbox',
        default: true
      }
    };
  }

  /**
   * 3. Pemrosesan Algoritma (Worker Thread Safe)
   * Method ini dijalankan di dalam Web Worker. Jangan akses elemen DOM (document, window) di sini.
   * 
   * @param {Object} params
   * @param {Array} params.trainRows - Array objek baris untuk training
   * @param {Array} params.testRows - Array objek baris untuk testing
   * @param {string} params.classCol - Nama kolom target / kelas
   * @param {Array<string>} params.featureCols - Daftar nama kolom fitur
   * @param {Object} params.config - Nilai parameter konfigurasi dari UI form
   * @param {number} params.seed - Seed generator LCG
   * @param {Array} params.rawRows - Seluruh data bersih pre-split
   * @returns {Object} Hasil perhitungan yang akan dilempar kembali ke Main Thread
   */
  process({ trainRows, testRows, classCol, featureCols, config, seed, rawRows }) {
    // Jalankan algoritma komputasi Anda di sini...
    // Contoh dummy output:
    const calculatedWeights = [0.1, 0.5, 0.9];
    const predictions = testRows.map(row => {
      return {
        actual: row[classCol],
        predicted: 'Kelas_A', // dummy prediction
        scores: { 'Kelas_A': 0.8, 'Kelas_B': 0.2 }
      };
    });

    return {
      weights: calculatedWeights,
      predictions: predictions,
      config: config
    };
  }

  /**
   * 4. Render Hasil Kalkulasi Manual (Main Thread)
   * Method ini dipanggil setelah process() selesai berjalan.
   * Gunakan `DOMHelper` atau template string untuk menyusun layout perhitungan step-by-step.
   * 
   * @param {Object} result - Objek kembalian dari method process() di atas
   * @param {HTMLElement} container - Node DOM tempat meletakkan hasil render
   */
  renderHTML(result, container) {
    // Kosongkan container
    container.innerHTML = '';

    // Gunakan DOMHelper untuk merender elemen yang aman dari XSS
    const title = DOMHelper.createSubTitle('Detail Perhitungan Algoritma Baru');
    container.appendChild(title);

    // Contoh menampilkan konfigurasi parameter yang digunakan
    const infoText = `Metrik jarak yang dipilih: <strong>${escapeHTML(result.config.distanceMetric)}</strong>`;
    container.appendChild(DOMHelper.createInfoBox(infoText, 'info'));

    // Langkah 1: Tampilkan detail bobot
    const weightsTitle = DOMHelper.createSubTitle('Langkah 1: Nilai Bobot Model');
    container.appendChild(weightsTitle);

    const weightsTable = DOMHelper.createTable(
      ['Indeks Fitur', 'Bobot Fitur'],
      result.weights.map((w, idx) => [`Fitur ${idx + 1}`, w]),
      { mono: true }
    );
    container.appendChild(weightsTable);

    // Langkah 2: Tambahkan Excel block (bergaya edukasi) jika ada padanan rumusnya
    // file_interface.js mewariskan helper _buildExcelBlock
    const excelBlock = this._buildExcelBlock('bobot_block', [
      { cell: 'A1', formula: '=SUM(B1:B3)', comment: 'Jumlah total bobot model' }
    ]);
    container.appendChild(excelBlock);
  }

  /**
   * 5. Pembuatan Berkas Ekspor Excel (Main Thread)
   * Method ini dipanggil saat user menekan tombol ekspor Excel.
   * 
   * @param {Object} result - Objek kembalian dari method process() di atas
   * @param {'plain'|'formula'} mode - Mode ekspor: 'plain' (statis) atau 'formula' (dinamis)
   * @returns {XLSX.Workbook} Objek workbook SheetJS (XLSX) yang siap disimpan
   */
  exportExcel(result, mode) {
    const WB = XLSX.utils.book_new();

    // Buat data untuk sheet pertama
    const sheetData = [
      ['Kunci Parameter', 'Nilai'],
      ['Learning Rate', result.config.learningRate],
      ['Metrik Jarak', result.config.distanceMetric]
    ];

    const WS = XLSX.utils.aoa_to_sheet(sheetData);

    // Jika mode formula aktif, tambahkan baris dengan formula Excel dinamis
    if (mode === 'formula') {
      // Gunakan helper sc (setCell) untuk menyuntikkan formula
      // import_helper.js menyediakan helper sc(cell, formula, val, comment)
      sc(WS, 'B4', '=SUM(B2:B3)', null, 'Total parameter numerik');
    } else {
      // Mode plain: cukup masukkan nilai statis
      sc(WS, 'B4', 2.01);
    }

    XLSX.utils.book_append_sheet(WB, WS, 'Konfigurasi Parameter');
    return WB;
  }
}

// 6. Daftarkan instance plugin ke core registry sistem
registry.register(new NewAlgorithmPlugin());
