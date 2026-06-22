# Forecasting di ML Manual Calculator

Modul **Forecasting** pada platform ini dirancang khusus untuk menganalisis dan memprediksi deret waktu (Time Series). Fokus utama modul ini adalah pada kemudahan pemahaman, di mana semua perhitungan dilakukan secara transparan dan dapat ditelusuri menggunakan Microsoft Excel.

## Algoritma yang Tersedia

1. **Simple Moving Average (SMA)**
   Menghitung rata-rata dari sejumlah periode $N$ sebelumnya.
   Cocok untuk data stasioner (tidak ada tren atau musiman).
   - $F_{t+1} = \frac{Y_t + Y_{t-1} + \dots + Y_{t-N+1}}{N}$

2. **Weighted Moving Average (WMA)**
   Mirip dengan SMA, namun memberikan bobot yang berbeda (biasanya lebih berat pada data terbaru) untuk setiap periode historis.
   - $F_{t+1} = \frac{\sum_{i=1}^{N} (w_i \times Y_{t-i+1})}{\sum_{i=1}^{N} w_i}$

3. **Single Exponential Smoothing (SES)**
   Metode peramalan yang memuluskan deret waktu menggunakan pembobotan eksponensial menurun.
   - $F_{t+1} = \alpha Y_t + (1-\alpha)F_t$

## Metrik Evaluasi

Sistem menyediakan 4 metrik evaluasi utama:
- **MAE** (Mean Absolute Error): Rata-rata dari nilai absolut error.
- **MSE** (Mean Squared Error): Rata-rata dari kuadrat error (menghukum error yang besar).
- **RMSE** (Root Mean Squared Error): Akar dari MSE, mengembalikan satuan error ke satuan asli data.
- **MAPE** (Mean Absolute Percentage Error): Persentase rata-rata error absolut relatif terhadap nilai aktual.

Semua perhitungan dan prediksi dapat diekspor menjadi formula Excel yang *rolling* (bergerak).
