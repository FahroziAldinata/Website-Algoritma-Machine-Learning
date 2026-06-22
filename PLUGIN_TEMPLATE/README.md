# Plugin Template

Direktori ini berisi kerangka dasar (boilerplate) untuk membuat plugin algoritma baru pada platform **ML Manual Calculator SPA**.

## Cara Membuat Plugin Baru

1. Buat folder baru di dalam `src/plugins/` dengan nama ID algoritma Anda:
   ```bash
   mkdir src/plugins/my_algorithm
   ```

2. Salin file `plugin_template.js` ke folder baru tersebut dan ubah namanya:
   ```bash
   cp PLUGIN_TEMPLATE/plugin_template.js src/plugins/my_algorithm/my_algorithm_plugin.js
   ```

3. Buka file tersebut dan sesuaikan properti serta method:
   - Ubah nama kelas menjadi sesuatu yang unik (misal `MyAlgorithmPlugin`).
   - Ubah properti `this.id`, `this.name`, `this.icon`, dan `this.description` di constructor.
   - Sesuaikan `this.configSchema` untuk parameter input yang dibutuhkan algoritma Anda.
   - Implementasikan logika perhitungan pada method `process()`.
   - Rancang antarmuka langkah kalkulasi manual menggunakan `DOMHelper` di method `renderHTML()`.
   - Rancang output spreadsheet menggunakan SheetJS di method `exportExcel()`.
   - Pastikan baris terakhir mendaftarkan class plugin Anda ke registry:
     ```javascript
     registry.register(new MyAlgorithmPlugin());
     ```

4. Daftarkan script plugin Anda ke berkas `index.html` dengan menambahkan tag `<script>` tepat di atas tag `src/core/core_ui.js`:
   ```html
   <script src="src/plugins/my_algorithm/my_algorithm_plugin.js"></script>
   ```

5. Buka `index.html` pada browser melalui server lokal Anda, dan algoritma baru Anda akan otomatis terdeteksi dan masuk ke menu navigasi utama!
