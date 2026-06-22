# Worker System

## Gambaran Umum

Komputasi berat (algoritma ML) dijalankan di **Web Worker thread** terpisah agar tidak memblokir UI (main thread). Sistem worker bersifat **generic** — satu worker melayani semua algoritma.

---

## Komponen

### 1. `generic_worker.js` — Worker Runtime

Lokasi: `src/shared/generic_worker.js`

Worker ini:
1. Menerima pesan `RUN` dari main thread
2. Memuat dependensi via `importScripts()`:
   - `lcg.js` — Seeded random number generator
   - `pipeline.js` — Data preprocessing (normalization)
   - `algorithm_interface.js` — Base class
   - `registry.js` — Plugin registry
   - Plugin file yang diminta (e.g. `naive_bayes_plugin.js`)
3. Memanggil `plugin.process(params)` 
4. Mengirim hasil `DONE` atau `ERROR` kembali ke main thread

```
Main Thread                         Worker Thread
     │                                    │
     │──── postMessage({type:'RUN'}) ────►│
     │                                    │  importScripts(...)
     │                                    │  plugin.process()
     │◄──── postMessage({type:'DONE'}) ───│
     │                                    │
```

### 2. `worker_factory.js` — Worker Lifecycle Manager

Lokasi: `src/shared/worker_factory.js`

Factory pattern yang mengelola siklus hidup Worker:

```javascript
// Mendapatkan atau membuat Worker baru
const worker = WorkerFactory.getWorker(callbackFn);

// Membatalkan proses dan terminate Worker
WorkerFactory.terminate();
```

Features:
- **Auto-termination** setelah kalkulasi selesai
- **Timeout protection** — Worker otomatis di-terminate jika melebihi batas waktu
- **Single instance** — Hanya satu Worker aktif pada satu waktu

---

## Alur Eksekusi

```
1. User klik "Mulai Perhitungan Model"
   ↓
2. core_ui.js: runActiveModel()
   - Baca state & config
   - cleanData() → splitData()
   - Tampilkan loading overlay
   ↓
3. WorkerFactory.getWorker(callback)
   - Buat Worker baru dari generic_worker.js
   ↓
4. worker.postMessage({ type: 'RUN', payload })
   ↓
5. Worker: importScripts() dependensi + plugin
   ↓
6. Worker: plugin.process(params)
   - Kirim PROGRESS messages periodik
   ↓
7. Worker: postMessage({ type: 'DONE', result })
   ↓
8. Main Thread: handleWorkerMessage()
   - Simpan hasil ke StateManager
   - Panggil plugin.renderHTML(result, container)
   - Sembunyikan loading overlay
```

---

## Dependency Chain di Worker

Worker **tidak berbagi scope** dengan main thread. Dependensi dimuat via `importScripts()`:

```javascript
// Urutan penting!
self.importScripts(
  '../shared/lcg.js',              // Layer 1
  '../shared/pipeline.js',         // Layer 1 (depends on lcg)
  '../core/algorithm_interface.js', // Layer 2
  '../core/registry.js',           // Layer 2
  pluginPath                        // Layer 3
);
```

---

## Progress Reporting

Plugin dapat mengirim update progress dari dalam `process()`:

```javascript
// Di dalam method process() plugin:
if (typeof self !== 'undefined' && self.postMessage) {
  self.postMessage({
    type: 'PROGRESS',
    step: 'Menghitung Likelihood',
    message: `Memproses fitur ${i+1}/${total}...`,
    pct: Math.round((i / total) * 100)
  });
}
```

---

## Catatan Penting

1. **Tidak ada DOM di Worker**: `document`, `window`, `alert()` tidak tersedia
2. **Tidak ada XLSX di Worker**: SheetJS hanya dimuat di main thread
3. **`self` bukan `window`**: Gunakan `self` untuk referensi global scope di Worker
4. **Serialization**: Data yang dikirim via `postMessage()` harus serializable (no functions, no DOM nodes)
