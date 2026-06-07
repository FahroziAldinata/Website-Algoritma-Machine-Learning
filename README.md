# Website Algoritma Machine Learning

Dibuat oleh: Fahrozialdinata03

Aplikasi web kalkulator machine learning yang berjalan sepenuhnya di browser
(client-side), tanpa backend server. Menampilkan perhitungan manual step-by-step
dari berbagai algoritma ML, lengkap dengan ekspor Excel berisi formula yang
bisa diverifikasi.

---

## Algoritma yang Tersedia

| No | Algoritma | Keterangan |
|----|-----------|------------|
| 1 | Naive Bayes | Klasifikasi probabilistik dengan Laplace Smoothing |
| 2 | K-Means Clustering | Berbasis centroid dengan iterasi konvergensi |
| 3 | C4.5 Decision Tree | Pohon keputusan dengan Entropy & Information Gain |
| 4 | K-Nearest Neighbors (KNN) | Klasifikasi berbasis jarak dengan normalisasi |
| 5 | Linear Regression | Sederhana & berganda dengan OLS, Ridge, Lasso |
| 6 | Apriori | Association rule mining dengan support, confidence, lift |

---

## Fitur Utama

- Perhitungan manual step-by-step yang transparan
- Berjalan 100% di browser, tanpa server
- Export hasil ke Excel dalam dua mode:
  - **Plain Text** — nilai ditulis sebagai angka biasa
  - **Formula** — setiap sel berisi formula Excel yang bisa diverifikasi
- Visualisasi PCA 2D untuk K-Means (tanpa library eksternal)
- Web Worker untuk komputasi berat agar browser tidak freeze
- Upload dataset CSV dengan drag-and-drop
- Dark theme dengan design system yang konsisten

---

## Teknologi yang Digunakan

- HTML, CSS, JavaScript murni (tanpa framework)
- Web Worker API
- IBM Plex Sans & IBM Plex Mono (tipografi)
- Semua matematika (matrix inversion, entropy, PCA, dll) diimplementasikan sendiri

---

## Struktur Folder
Html/         → satu file HTML per algoritma
js/[Algoritma]/
├── _utils.js   → helper matematik & statistik
├── _io.js      → upload CSV, preview, konfigurasi UI
├── _core.js    → logika komputasi utama
├── _render.js  → render hasil ke DOM
├── _export.js  → ekspor ke Excel
└── _worker.js  → Web Worker
css/          → style global + per-algoritma
js/Shared/    → LCG random number generator

---

## Cara Menjalankan

1. Clone atau download repository ini
2. Buka file HTML salah satu algoritma di browser
3. Upload file CSV dataset kamu
4. Atur konfigurasi (kolom target, jumlah k, dll)
5. Klik tombol Hitung dan lihat hasil step-by-step
6. Export ke Excel jika diperlukan

---

## Mata Kuliah

Proyek ini dibuat untuk mata kuliah Machine Learning
Program Studi Sistem Informasi