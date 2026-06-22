# Release Notes — Version 2.0.0 (Roadmap Tahap 2 Completion)

Selamat datang di **ML Manual Calculator SPA v2.0.0**! 🎉
Rilis ini menandai selesainya **Roadmap Tahap 2**, yang merekayasa ulang arsitektur platform dari halaman-halaman HTML terpisah menjadi Single Page Application (SPA) modular berbasis plug-in dengan dukung kalkulasi offline dan Web Workers.

---

## 🚀 Fitur Baru & Peningkatan Utama

### 1. Single Page Application (SPA) Dashboard
Seluruh antarmuka pengguna kini disatukan ke dalam satu SPA shell di `index.html`. Navigasi antar algoritma berjalan instan dan mulus tanpa reload halaman, dikendalikan secara sentral oleh `core_ui.js` dan didukung sistem routing state modern.

### 2. Arsitektur Plugin yang Fleksibel (AlgorithmPlugin)
Algoritma komputasi kini didefinisikan sebagai plugin modular yang mewarisi base class `AlgorithmPlugin` di `src/core/algorithm_interface.js` dan terdaftar secara otomatis di `registry.js`. Pengembang dapat menambahkan algoritma baru hanya dengan menaruh satu file plugin di `src/plugins/` dan mendaftarkannya di `index.html`.

### 3. Off-Main-Thread Web Worker System
Semua komputasi berat dipindahkan dari UI thread ke Web Worker latar belakang (`generic_worker.js`). Hal ini memastikan browser tetap responsif (bebas dari freeze) bahkan saat memproses dataset besar dengan puluhan ribu baris.

### 4. Ekspor Excel dengan Formula Dinamis
Peningkatan fitur ekspor SheetJS kini mendukung penulisan formula Excel dinamis secara otomatis. Pengguna dapat melacak bagaimana rumus manual diterjemahkan menjadi formula spreadsheet hidup. Tersedia pula pilihan ekspor versi Plain (nilai statis).

### 5. Arsitektur CSS Modular
Menggantikan block style inline raksasa di HTML dengan sistem CSS modular yang terstruktur di bawah `src/styles/`:
- `tokens.css`: Variabel CSS terpusat untuk tema warna, tipografi, dan spasi.
- `reset.css`, `layout.css`, `components.css`, `forms.css`, `tables.css`, `utilities.css`.
- `main.css`: File gerbang utama yang mengimpor seluruh CSS modular di atas.

### 6. Full Offline & Local Dependencies
Seluruh dependensi eksternal (SheetJS dan Google Fonts IBM Plex Sans & Mono) telah diunduh dan disimpan secara lokal di `src/vendor/`, memungkinkan aplikasi berjalan 100% secara offline tanpa internet.

### 7. DOM Helper Module
Menyediakan modul utility `DOMHelper` (`src/core/dom_helper.js`) dengan builder API imperatif yang aman dari XSS untuk memudahkan perancangan UI dinamis pada pengembangan plugin di masa depan.

---

## ⚠️ Perubahan Besar & Breaking Changes

Bagi pengembang yang melakukan migrasi dari versi 1.x:
1. **Peta Halaman HTML Dihapus**: Halaman terpisah (`naive_bayes.html`, `knn.html`, dll.) beserta folder `js/` dan `css/` lama telah **dihapus**. Gunakan `index.html` sebagai satu-satunya entry point.
2. **Standardisasi API Plugin**: Logika perhitungan wajib diletakkan dalam method `process()`, sedangkan manipulasi UI diletakkan dalam method `renderHTML()`.
3. **Pemisahan Konteks Worker**: Kode di dalam `process()` tidak boleh mengakses objek browser global (`document`, `window`, dll.) karena berjalan di thread terpisah. Gunakan method `renderHTML()` untuk menyentuh DOM.

---

## 🔧 Panduan Migrasi Kode Kustom

Jika Anda memiliki algoritma kustom dari versi sebelumnya:
1. Bungkus kode logika kalkulasi Anda ke dalam class yang meng-extend `AlgorithmPlugin`.
2. Pisahkan logika kalkulasi murni ke method `process()`.
3. Gunakan method `renderHTML(result, container)` untuk menampilkan hasil kalkulasi di layar. Gunakan `escapeHTML()` untuk mencegah celah keamanan XSS.
4. Daftarkan plugin Anda di bagian paling bawah file:
   ```javascript
   registry.register(new MyAlgorithmPlugin());
   ```
5. Muat file JS Anda di `index.html` sebelum tag script `core_ui.js`.

---

## 🐛 Masalah yang Diketahui (Known Issues)
- **Kompatibilitas File System (`file://`)**: Membuka `index.html` secara langsung menggunakan klik ganda (protokol `file://`) akan membatasi fungsionalitas Web Worker karena kebijakan keamanan browser (CORS). Sangat disarankan untuk menjalankan aplikasi menggunakan HTTP server lokal (`python -m http.server 5500` atau Live Server VS Code).
