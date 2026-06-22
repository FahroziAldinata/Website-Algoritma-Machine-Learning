# Export System

## Gambaran Umum

Sistem ekspor menghasilkan file Excel (`.xlsx`) dari hasil kalkulasi setiap algoritma. Mendukung dua mode:

| Mode | Deskripsi |
|------|-----------|
| **Plain** | Nilai statis — angka hasil akhir langsung di cell |
| **Formula** | Formula Excel dinamis — cell berisi rumus `=A1*B2` yang bisa ditelusuri |

---

## Komponen

### `export_helper.js`

Lokasi: `src/shared/export_helper.js`

Fungsi utilitas untuk membuat dan menyimpan workbook:

```javascript
// Menyimpan workbook ke file .xlsx
saveWB(workbook, filename)
```

### `xlsx.full.min.js` (SheetJS)

Library pihak ketiga yang menangani format spreadsheet. Tersedia secara offline di `src/vendor/`.

---

## Alur Export

```
1. User klik "Ekspor Excel (Plain)" atau "Ekspor Excel (Formula)"
   ↓
2. core_ui.js: triggerExport(mode)
   - Ambil plugin aktif dan hasil terakhir
   ↓
3. plugin.exportExcel(result, mode)
   - Buat XLSX.utils.book_new()
   - Buat worksheet untuk setiap langkah
   - Return workbook
   ↓
4. saveWB(workbook, filename)
   - XLSX.writeFile() → download file
```

---

## Implementasi di Plugin

Setiap plugin wajib mengimplementasikan `exportExcel(result, mode)`:

```javascript
exportExcel(result, mode) {
  const WB = XLSX.utils.book_new();
  
  if (mode === 'formula') {
    // Gunakan formula: { t: 's', f: '=A2*B2' }
    const ws = XLSX.utils.aoa_to_sheet([
      ['Label', 'Nilai'],
      ['Accuracy', { t: 'n', f: '=C5/C6' }]
    ]);
    XLSX.utils.book_append_sheet(WB, ws, 'Evaluation');
  } else {
    // Mode plain: nilai statis
    const ws = XLSX.utils.aoa_to_sheet([
      ['Label', 'Nilai'],
      ['Accuracy', 0.95]
    ]);
    XLSX.utils.book_append_sheet(WB, ws, 'Evaluation');
  }
  
  return WB;
}
```

---

## Formula Injection Prevention

Semua nilai string yang masuk ke Excel disanitasi menggunakan `sanitizeFormula()` dari `sanitizer.js`:

```javascript
sanitizeFormula(value)
// Menghapus prefix berbahaya: =, +, -, @, \t, \r
// Mencegah formula injection attack via CSV/Excel
```

---

## Catatan

- SheetJS **hanya dimuat di main thread** — tidak tersedia di Worker
- Mode Formula menghasilkan file yang lebih besar tetapi bisa diedit
- Mode Plain lebih aman dan lebih kecil ukurannya
