# Contoh Kasus Forecasting (Forecasting Examples)

Dokumen ini berisi contoh dataset dan skenario penggunaan yang direkomendasikan untuk menguji modul forecasting.

## 1. Prediksi Penjualan Ritel Harian (SMA)

**Dataset `sales_daily.csv`**:
```csv
Tanggal,Penjualan
2023-01-01,100
2023-01-02,110
2023-01-03,105
2023-01-04,115
2023-01-05,120
2023-01-06,
2023-01-07,130
```

**Skenario**: 
- **Missing Value Handling**: Pilih **Linear Interpolation**. Nilai pada `2023-01-06` akan diestimasi menjadi `125` (tengah antara 120 dan 130).
- **Algoritma**: Simple Moving Average (SMA).
- **Parameter**: Window Size = 3, Forecast Horizon = 5.
- **Validasi Python**: Gunakan `pandas.Series.rolling(window=3).mean()` untuk memvalidasi output `T+1` sampai `T+5`.

## 2. Pengukuran Suhu Reaktor (WMA)

**Dataset `reactor_temp.csv`**:
```csv
Jam,Suhu
08:00,500
09:00,505
10:00,515
11:00,510
12:00,520
```

**Skenario**:
- Karena pengukuran terbaru diyakini lebih akurat mencerminkan keadaan mesin, WMA lebih tepat daripada SMA.
- **Parameter WMA**: Window Size = 3. 
- Mode Pembobotan = **Kustom** dengan nilai `1, 2, 3`. (Suhu jam 12:00 dikalikan 3, jam 11:00 dikalikan 2, jam 10:00 dikalikan 1).
- **Validasi Python**: Gunakan operasi `numpy.dot()` untuk mensimulasikan hasil yang sama dengan perkalian matriks.

## 3. Prediksi Inflasi Bulanan (SES)

**Skenario**:
- Data ekonomi makro seringkali memiliki *noise*, namun secara umum stasioner dalam jangka pendek.
- **Algoritma**: Single Exponential Smoothing (SES).
- **Parameter**: Alpha = 0.3, Horizon = 12 bulan.
- **Karakteristik Output**: Di grafik (SVG) maupun di hasil ekspor Excel, prediksi untuk T+1 hingga T+12 akan membentuk garis datar (flat line) karena sifat matematis SES murni yang tidak memiliki komponen Trend maupun Seasonality.
- **Validasi Python**: `statsmodels.tsa.holtwinters.SimpleExpSmoothing(data).fit(smoothing_level=0.3, optimized=False)`.
