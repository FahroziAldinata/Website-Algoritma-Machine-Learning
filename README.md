# ML Manual Calculator — SPA Platform

Platform edukasi **Machine Learning** berbasis web yang menampilkan seluruh proses perhitungan manual algoritma ML secara **transparan**, **step-by-step**, dan **visual** — langsung di browser tanpa server.

---

## ✨ Fitur Utama

- 🧮 **6 Algoritma ML**: Naive Bayes, KNN, C4.5, K-Means, Linear Regression, Apriori
- 📊 **Perhitungan Manual Step-by-Step**: Setiap langkah komputasi ditampilkan secara visual
- 📥 **Upload CSV**: Drag & drop dataset, preview otomatis
- ⚙️ **Konfigurasi Parameter**: Form dinamis per-algoritma
- 📤 **Ekspor Excel**: Mode Plain (nilai statis) dan Formula (rumus Excel dinamis)
- 🔒 **Fully Client-Side**: Tidak ada server, data tidak pernah keluar dari browser
- 📴 **Offline Support**: Semua dependensi tersedia lokal
- 🔌 **Plugin Architecture**: Tambah algoritma baru tanpa mengubah kode inti

---

## 🚀 Quick Start

### Prasyarat

- Browser modern (Chrome, Firefox, Edge)
- Server HTTP lokal (opsional, lihat bawah)

### Menjalankan

```bash
# Opsi 1: Python
python -m http.server 5500

# Opsi 2: Node.js
npx serve . -p 5500

# Opsi 3: VS Code
# Install ekstensi "Live Server" → klik kanan index.html → "Open with Live Server"
```

Buka `http://localhost:5500` di browser.

> **Catatan**: Aplikasi juga bisa dibuka langsung dari file system (`file://`), tetapi Web Worker membutuhkan server HTTP untuk bisa berjalan.

---

## 📁 Struktur Proyek

```
├── index.html              # SPA entry point
├── src/
│   ├── core/               # Arsitektur inti (SPA shell, registry, state)
│   ├── shared/             # Module bersama (pipeline, sanitizer, worker)
│   ├── plugins/            # Plugin algoritma (1 folder per algo)
│   ├── styles/             # CSS architecture (modular)
│   ├── vendor/             # Library pihak ketiga (offline)
│   └── assets/             # Aset statis (favicon)
├── docs/                   # Dokumentasi arsitektur
├── PLUGIN_TEMPLATE/        # Template plugin baru
└── Dataset/                # Contoh dataset CSV
```

---

## 🔌 Menambah Algoritma Baru

1. Salin `PLUGIN_TEMPLATE/` ke `src/plugins/<id_baru>/`
2. Implementasi 3 method wajib: `process()`, `renderHTML()`, `exportExcel()`
3. Tambahkan `<script>` tag di `index.html`
4. Plugin otomatis muncul di sidebar dan homepage

Lihat: [docs/plugin-system.md](docs/plugin-system.md)

---

## 📖 Dokumentasi

| Dokumen | Deskripsi |
|---------|-----------|
| [Architecture](docs/architecture.md) | Gambaran arsitektur sistem |
| [Plugin System](docs/plugin-system.md) | Cara membuat dan mendaftarkan plugin |
| [Worker System](docs/worker-system.md) | Web Worker dan asynchronous computation |
| [Data Flow](docs/data-flow.md) | Alur data dari CSV ke Excel |
| [State Management](docs/state-management.md) | Manajemen state aplikasi |
| [Export System](docs/export-system.md) | Sistem ekspor Excel |
| [Security](docs/security.md) | XSS, formula injection, CSP |
| [Contributing](docs/contributing.md) | Panduan kontribusi |

---

## 🛠️ Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| Frontend | Vanilla HTML5, CSS3, JavaScript (ES6+) |
| Styling | CSS Custom Properties, Modular CSS |
| Computation | Web Workers (off-main-thread) |
| Spreadsheet | SheetJS (xlsx.full.min.js) |
| Typography | IBM Plex Sans & Mono (lokal) |
| RNG | LCG (Linear Congruential Generator) |
| Build Tools | None — zero build step |

---

## 📝 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).

---

## 🤝 Kontribusi

Kontribusi sangat diterima! Lihat [CONTRIBUTING.md](CONTRIBUTING.md) untuk panduan.
