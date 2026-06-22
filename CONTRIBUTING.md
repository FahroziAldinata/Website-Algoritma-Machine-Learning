# Contributing Guide

Terima kasih atas ketertarikan Anda untuk berkontribusi pada **ML Manual Calculator**! 🎉

Untuk detail lengkap tentang setup, arsitektur, dan standar kode, silakan baca dokumen berikut:

- [Panduan Kontribusi Lengkap](docs/contributing.md)
- [Sistem Plugin](docs/plugin-system.md)
- [Arsitektur Sistem](docs/architecture.md)

## Alur Singkat Kontribusi

1. **Fork** repository ini di GitHub.
2. **Clone** repository hasil fork ke komputer Anda.
3. Jalankan server lokal untuk melakukan development:
   ```bash
   python -m http.server 5500
   ```
4. Buat branch baru untuk perbaikan atau fitur Anda (`git checkout -b fitur-baru`).
5. Lakukan perubahan kode, ikuti standar coding di bawah.
6. Lakukan pengujian secara lokal di browser.
7. Commit dan push branch Anda ke GitHub fork Anda.
8. Buat **Pull Request** ke repository utama.

## Aturan Singkat Pengodean

- **Zero-Dependency & Zero-Build**: Jangan tambahkan library eksternal atau build tools (Webpack, Vite, dll.). Semua dependensi harus offline dan lokal.
- **Worker-Safe**: Fungsi `process()` pada plugin Anda harus bebas dari manipulasi DOM karena berjalan di Web Worker.
- **XSS & Injection Protection**: Gunakan `escapeHTML()` pada manipulasi string untuk HTML dan `sanitizeFormula()` untuk ekspor Excel.
- **No Inline Event/Style**: Hindari atribut HTML inline seperti `style="..."` atau `onclick="..."`. Semua event handling dan layout styling harus dipisahkan di file JS/CSS eksternal.

Selamat berkontribusi! 🚀
