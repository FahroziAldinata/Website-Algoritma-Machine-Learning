# Contributing Guide

Terima kasih atas ketertarikan Anda untuk berkontribusi pada **ML Manual Calculator**! 🎉

---

## Cara Berkontribusi

### 1. Menambah Algoritma Baru (Plugin)

Ini adalah cara kontribusi paling umum. Lihat [Plugin System Guide](plugin-system.md) untuk panduan lengkap.

**Ringkasan langkah:**

1. Fork repository
2. Salin `PLUGIN_TEMPLATE/` ke `src/plugins/<id_baru>/`
3. Implementasi `process()`, `renderHTML()`, `exportExcel()`
4. Tambahkan `<script>` tag di `index.html`
5. Test secara lokal
6. Buat Pull Request

### 2. Memperbaiki Bug

1. Buka Issue terlebih dahulu untuk melaporkan bug
2. Fork repository
3. Perbaiki bug di branch baru
4. Pastikan tidak ada regresi pada fitur lain
5. Buat Pull Request dengan referensi ke Issue

### 3. Memperbaiki Dokumentasi

Dokumentasi ada di folder `docs/`. Koreksi typo, klarifikasi, atau tambahan penjelasan sangat diterima.

---

## Setup Development

```bash
# Clone repository
git clone https://github.com/<username>/ml-manual-calculator.git
cd ml-manual-calculator

# Jalankan server lokal (pilih salah satu)
python -m http.server 5500
# atau
npx serve .
# atau gunakan Live Server dari VS Code

# Buka browser
http://localhost:5500
```

Tidak ada proses build — cukup serve file statis.

---

## Aturan Kode

### JavaScript

- **Vanilla JS** — Tidak ada framework/library tambahan
- **No build tools** — Tidak boleh menambahkan webpack, vite, dll
- **Worker-safe**: `process()` harus bisa berjalan di Web Worker (no DOM)
- **Gunakan `escapeHTML()`** untuk semua output data user ke DOM
- **Gunakan `sanitizeFormula()`** untuk semua output string ke Excel
- **Komentar dalam Bahasa Indonesia** — Konsisten dengan kode yang ada

### CSS

- Gunakan **CSS Custom Properties** dari `src/styles/tokens.css`
- Tidak boleh `style=""` inline di HTML
- Gunakan class dari file CSS yang ada

### HTML

- Tidak boleh `onclick=""`, `onchange=""`, atau atribut event inline
- Gunakan `addEventListener()` di JavaScript
- Gunakan atribut `hidden` bukan `style="display:none"`

---

## Struktur Pull Request

```
Judul: [Plugin] Tambah algoritma Random Forest
atau
Judul: [Fix] Perbaiki normalisasi di KNN plugin

Deskripsi:
- Apa yang ditambah/diperbaiki
- Screenshot hasil (jika visual)
- Checklist:
  [ ] Tested secara lokal
  [ ] Tidak menambah dependensi eksternal
  [ ] escapeHTML() digunakan di renderHTML()
  [ ] Export Excel berfungsi (plain & formula)
```

---

## Pertanyaan?

Buka Issue dengan label `question` jika ada hal yang kurang jelas.
