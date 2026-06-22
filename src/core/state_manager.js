/**
 * src/core/state_manager.js
 * State Manager Module
 * 
 * Tujuan: Mengatur status (state) global data masukan, parameter preprocess,
 * konfigurasi model aktif, dan hasil kalkulasi terakhir secara terpadu.
 * Memastikan alur data bersifat satu arah (single source of truth).
 */

const StateManager = {
  state: {
    // Dataset info
    headers: [],
    rawRows: [],
    cleanRows: [],
    colTypes: [],      // 'num' | 'cat'
    classCol: -1,      // index kolom label/target
    featureCols: [],   // nama-nama kolom fitur aktif

    // Data cleaning metadata
    cleanReport: null,

    // Split parameters
    splitMode: 'none', // 'none' | 'holdout'
    testRatio: 0.2,    // 0.0 - 1.0
    splitSeed: 42,
    mvStrategy: 'mode', // 'mode' | 'median' | 'drop'

    // Prapemrosesan / Pipeline outcomes
    trainRows: [],     // data training (raw values)
    testRows: [],      // data testing (raw values)
    trainNorm: [],     // data training ter-normalisasi/encoded
    testNorm: [],      // data testing ter-normalisasi/encoded
    normStats: null,   // statistik normalisasi { min, max, mean, std } per kolom
    labelEncodings: {}, // map encoding kategorikal per kolom

    // Active state
    activePluginId: null,
    lastResult: null,   // hasil kalkulasi terakhir model aktif
    isCalculating: false
  },

  /**
   * Reset seluruh status ke kondisi awal
   */
  reset() {
    this.state.headers = [];
    this.state.rawRows = [];
    this.state.cleanRows = [];
    this.state.colTypes = [];
    this.state.classCol = -1;
    this.state.featureCols = [];
    this.state.cleanReport = null;
    this.state.trainRows = [];
    this.state.testRows = [];
    this.state.trainNorm = [];
    this.state.testNorm = [];
    this.state.normStats = null;
    this.state.labelEncodings = {};
    this.state.lastResult = null;
    this.state.isCalculating = false;
  },

  /**
   * Perbarui item status berdasarkan kunci
   * @param {string} key - Kunci status
   * @param {*} val - Nilai baru
   */
  update(key, val) {
    if (this.state[key] !== undefined || key in this.state) {
      this.state[key] = val;
    } else {
      console.warn(`StateManager: Kunci [${key}] tidak dikenali di struktur state.`);
    }
  },

  /**
   * Mengambil status global saat ini
   * @returns {object} Copy dari status global
   */
  get() {
    return this.state;
  }
};

if (typeof window !== 'undefined') {
  window.StateManager = StateManager;
} else if (typeof self !== 'undefined') {
  self.StateManager = StateManager;
}
