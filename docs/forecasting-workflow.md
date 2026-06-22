# Alur Kerja (Workflow) Modul Forecasting

Karena sifat data runtut waktu (*Time Series*) yang dependen terhadap urutan observasi, alur kerja untuk Forecasting sedikit berbeda dengan algoritma *Classification* maupun *Regression*.

## 1. Persiapan Data (Data Prep)
1. **Unggah CSV:** Unggah dataset yang setidaknya memiliki 2 kolom (Kolom Waktu dan Kolom Nilai).
2. **Pilih Kolom Tanggal (Waktu):** Centang **tepat satu** kolom yang merepresentasikan penanda waktu.
3. **Pilih Kolom Nilai Aktual:** Pilih kolom numerik dari dropdown target/kelas.

## 2. Pembersihan & Pengurutan
Sistem secara otomatis akan:
- Mengurutkan baris data (Sorting) dari waktu paling lama ke waktu paling baru.
- Menangani nilai kosong (Missing Values). Untuk time series, disarankan menggunakan:
  - **Forward Fill (ffill):** Mengisi nilai kosong dengan nilai valid sebelumnya.
  - **Linear Interpolation:** Mengisi kekosongan dengan membuat garis lurus matematis antara titik sebelum dan sesudah yang valid.

## 3. Konfigurasi Model
- Tentukan parameter khusus model (Misal: Window Size, Alpha).
- Tentukan **Forecast Horizon**: Berapa periode ke depan (di luar data historis) yang ingin diramalkan.
- Klik **Mulai Perhitungan Model**.

## 4. Evaluasi & Ekspor
Sistem akan menampilkan:
- Tabel aktual vs prediksi.
- Metrik Error (MAE, MSE, RMSE, MAPE).
- Grafik garis (Line Chart) interaktif SVG.
- Saat diekspor ke Excel, pilih mode **Excel (Formula Berantai)** untuk mendapatkan sheet perhitungan matematis selangkah demi selangkah.
