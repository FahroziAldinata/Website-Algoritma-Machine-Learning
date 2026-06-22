# Panduan Pembuatan Plugin Forecasting

Sama seperti pembuatan plugin klasifikasi, pembuatan plugin forecasting di dalam platform SPA berbasis Web Worker ini cukup mudah, namun terdapat beberapa konvensi (aturan) khusus untuk kategori forecasting.

## 1. Persyaratan Dasar Kelas
Setiap plugin wajib:
1. Mewarisi (extends) dari kelas `AlgorithmPlugin`.
2. Mendeklarasikan `uiMode = 'forecasting';` agar antarmuka UI dapat menyesuaikan diri (contoh: teks label berubah menjadi "Waktu").
3. Mengimplementasikan method:
   - `process()`
   - `renderHTML()`
   - `exportExcel()`

## 2. Struktur Method `process()`
Method `process` dijalankan di lingkungan *Web Worker* (Background Thread).
```javascript
async process(trainData, testData, config, onProgress) {
   // Untuk forecasting, `trainData` umumnya berisi seluruh dataset historis
   // karena random split akan dimatikan (Time-based split diaktifkan).
   const dateCol = config.featureCols[0];
   const valCol = config.classCol;
   const horizon = config.forecast_horizon || 3;

   // 1. Panggil `prepareTimeSeriesData` untuk memastikan urutan waktu yang tepat
   const sortedData = prepareTimeSeriesData(trainData, dateCol);

   // 2. Kalkulasi Array Historis & Prediksi ke-depan (Future)
   // 3. Kalkulasi Metrics Evaluasi
   const metrics = Metrics.evaluate(actualArray, forecastArray);

   return { historical, future, metrics };
}
```

## 3. Rendering SVG dan Metrik
Di dalam method `renderHTML(result, container)`, sangat dianjurkan untuk menggunakan komponen utilitas yang ada agar seragam:
- `SVGChart.renderLineChart(data, options)`: Menghasilkan string HTML untuk grafik Time Series.
- Struktur tabel CSS (`fc-table`, `fc-actual`, `fc-forecast`, `fc-error`).

## 4. Ekspor Excel 4 Sheet
Export Excel yang dikembalikan oleh `exportExcel(result, mode)` sebaiknya mengandung 4 sheet (atau 3 sheet utama + 1 ringkasan visual):
1. **Dataset**: Tabel data asli murni.
2. **Perhitungan**: Tabel formula (misal: referensi geser `AVERAGE(B2:B4)`). Pastikan cek `mode === 'formula'`.
3. **Evaluasi**: Rangkuman Metrik MAE, MSE, RMSE, MAPE.
4. **Visual Summary**: Dapat diisi keterangan singkat jika ekspor chart langsung tidak didukung oleh SheetJS Community Edition.
