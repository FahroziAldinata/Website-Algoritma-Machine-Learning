/**
 * src/shared/worker_factory.js
 * Worker Factory Module
 * 
 * Tujuan: Mengelola daur hidup (lifecycle) dari Web Worker, menangani
 * pembatalan komputasi (cancellation), dan memberikan proteksi terhadap
 * thread yang membeku (hang) melalui batas waktu eksekusi (timeout) 30 detik.
 */

const WorkerFactory = {
  activeWorker: null,
  timeoutTimer: null,
  currentCallback: null,

  /**
   * Mendapatkan atau membuat instance worker baru dan meregistrasikan callback pesan
   * @param {function} onMessageCallback - Callback untuk memproses status dari worker
   * @returns {Worker} Instance Web Worker
   */
  getWorker(onMessageCallback) {
    // Hentikan worker lama jika sedang berjalan
    this.terminate();
    
    this.currentCallback = onMessageCallback;

    // Inisialisasi Web Worker baru (path relatif terhadap file index.html)
    this.activeWorker = new Worker('src/shared/generic_worker.js');

    // Hubungkan event listener
    this.activeWorker.onmessage = (e) => {
      // Segarkan kembali batas waktu timeout jika ada aktivitas progress report dari worker
      this.resetTimeout();

      // Jika kalkulasi selesai atau terjadi error, bersihkan timer timeout
      if (e.data.type === 'DONE' || e.data.type === 'ERROR') {
        this.clearTimeoutTimer();
      }

      if (this.currentCallback) {
        this.currentCallback(e.data);
      }
    };

    // Mulai hitung mundur proteksi timeout
    this.startTimeout();

    return this.activeWorker;
  },

  /**
   * Memulai penghitungan batas waktu 30 detik
   */
  startTimeout() {
    this.clearTimeoutTimer();
    this.timeoutTimer = setTimeout(() => {
      console.warn("Batas waktu kalkulasi terlampaui (30 detik). Menghentikan Web Worker.");
      
      const cb = this.currentCallback;
      this.terminate();

      if (cb) {
        cb({
          type: 'ERROR',
          message: 'Batas waktu kalkulasi (30 detik) terlampaui. Perhitungan dihentikan secara otomatis untuk menjaga performa sistem.'
        });
      }
    }, 30000);
  },

  /**
   * Mengatur ulang batas waktu (reset timeout) jika worker terbukti masih bekerja secara aktif
   */
  resetTimeout() {
    this.startTimeout();
  },

  /**
   * Membersihkan timer timeout
   */
  clearTimeoutTimer() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  },

  /**
   * Menghentikan paksa (terminate) worker yang sedang berjalan dan melepaskan memori
   */
  terminate() {
    this.clearTimeoutTimer();
    if (this.activeWorker) {
      this.activeWorker.terminate();
      this.activeWorker = null;
    }
    this.currentCallback = null;
  }
};

// Ekspos ke global context agar dapat digunakan oleh core_ui.js
if (typeof window !== 'undefined') {
  window.WorkerFactory = WorkerFactory;
}
