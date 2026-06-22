# Security

## Gambaran Umum

Meskipun platform ini berjalan sepenuhnya di client-side, terdapat dua vektor keamanan utama yang harus ditangani:

1. **Cross-Site Scripting (XSS)** — Input CSV bisa mengandung HTML/JavaScript
2. **Formula Injection** — Nilai CSV bisa mengandung formula Excel berbahaya

---

## XSS Prevention

### `escapeHTML(str)`

Lokasi: `src/shared/sanitizer.js`

Mengganti karakter HTML berbahaya:

| Karakter | Escape |
|----------|--------|
| `&` | `&amp;` |
| `<` | `&lt;` |
| `>` | `&gt;` |
| `"` | `&quot;` |
| `'` | `&#039;` |

### Penggunaan

Semua data dari CSV yang di-render ke DOM **wajib** melalui `escapeHTML()`:

```javascript
// BENAR
container.innerHTML = `<td>${escapeHTML(row[col])}</td>`;

// SALAH — rawan XSS
container.innerHTML = `<td>${row[col]}</td>`;
```

### Cakupan

`escapeHTML()` digunakan di:
- ✅ Semua 6 plugin (renderHTML)
- ✅ core_ui.js (preview table)
- ✅ algorithm_interface.js (_buildExcelBlock)

---

## Formula Injection Prevention

### `sanitizeFormula(str)`

Lokasi: `src/shared/sanitizer.js`

Menghapus prefix yang bisa ditafsirkan sebagai formula oleh spreadsheet:

| Prefix | Alasan |
|--------|--------|
| `=` | Excel formula |
| `+` | Excel formula |
| `-` | Excel formula (bisa jadi angka negatif, ditangani khusus) |
| `@` | Excel function |
| `\t` | Tab injection |
| `\r` | Carriage return injection |

### Penggunaan

Semua nilai string yang masuk ke workbook Excel **wajib** melalui `sanitizeFormula()`:

```javascript
// BENAR
const cellValue = sanitizeFormula(rowData[col]);

// SALAH — rawan formula injection
const cellValue = rowData[col];
```

---

## Content Security Policy (CSP) — Rekomendasi

Untuk deployment production, tambahkan CSP header:

```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self';">
```

Catatan:
- `worker-src 'self'` — Hanya izinkan Worker dari origin yang sama
- `script-src 'self'` — Tidak ada script eksternal
- `'unsafe-inline'` untuk style diperlukan karena beberapa plugin menggunakan inline style di renderHTML()

---

## Checklist Keamanan

- [x] `escapeHTML()` di semua 6 plugin
- [x] `sanitizeFormula()` di plugin yang mengekspor string ke Excel
- [x] Tidak ada `eval()` atau `Function()` di seluruh codebase
- [x] Worker di-scope ke origin yang sama
- [x] Tidak ada external HTTP request (fully offline)
- [ ] CSP meta tag (opsional, belum ditambahkan)
