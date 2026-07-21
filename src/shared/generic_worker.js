/**
 * src/shared/generic_worker.js
 * Generic Web Worker Runtime
 * 
 * Tujuan: Menyediakan runtime background thread yang terisolasi dari Main UI Thread.
 * Worker ini memuat pustaka pembantu dan plugin algoritma secara dinamis
 * serta menjalankan perhitungan matematika model tanpa memicu UI freezing.
 */

// Listener pesan dari main thread
self.onmessage = async function (e) {
  if (!e.data || e.data.type !== 'RUN') return;

  const {
    pluginId,
    pluginPath,
    trainRows,
    testRows,
    classCol,
    featureCols,
    config,
    seed,
    testRatio,
    splitMethod,
    rawRows
  } = e.data.payload;

  try {
    // 1. Memuat dependensi dasar yang dibutuhkan oleh seluruh plugin
    // Path diimpor relatif terhadap posisi berkas generic_worker.js di src/shared/
    self.importScripts(
      'lcg.js',
      'pipeline.js',
      'normalization.js',
      'metrics.js',
      '../core/algorithm_interface.js',
      '../core/registry.js'
    );

    // 2. Memuat berkas plugin algoritma secara dinamis
    if (!pluginPath) {
      throw new Error(`Path plugin untuk [${pluginId}] tidak ditentukan.`);
    }
    self.importScripts(pluginPath);

    // 3. Mengambil objek instansi plugin dari registry
    const plugin = self.registry.get(pluginId);
    if (!plugin) {
      throw new Error(`Algoritma [${pluginId}] tidak terdaftar setelah memuat berkas plugin.`);
    }

    // 4. Melakukan callback progress inisialisasi awal
    self.postMessage({
      type: 'PROGRESS',
      step: 'Inisialisasi Worker',
      message: 'Mulai menghitung di background thread...',
      pct: 5
    });

    // 5. Memicu eksekusi logika perhitungan matematis plugin
    const progressCallback = (step, message, pct) => {
      self.postMessage({
        type: 'PROGRESS',
        step,
        message,
        pct
      });
    };

    const result = await plugin.process(
      trainRows,
      testRows,
      {
        ...config,
        classCol,
        featureCols,
        seed,
        testRatio,
        splitMethod,
        rawRows
      },
      progressCallback
    );

    // 6. Mengirimkan hasil akhir kembali ke thread UI Utama
    self.postMessage({
      type: 'DONE',
      result
    });

  } catch (err) {
    // Tangani error dan kirim pesan kegagalan ke main thread
    self.postMessage({
      type: 'ERROR',
      message: err.message || String(err)
    });
  }
};
