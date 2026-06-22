# Plugin System Guide

## Gambaran Umum

Sistem plugin memungkinkan penambahan algoritma ML baru **tanpa mengubah kode inti** (core system). Setiap algoritma dienkapsulasi dalam satu folder plugin yang mewarisi interface `AlgorithmPlugin`.

---

## Anatomi Plugin

Setiap plugin terdiri dari **satu file JavaScript** di dalam folder `src/plugins/<id>/`:

```
src/plugins/my_algo/
└── my_algo_plugin.js
```

### Struktur Kode Plugin

```javascript
class MyAlgoPlugin extends AlgorithmPlugin {
  constructor() {
    super();
    this.id = 'my_algo';              // ID unik (sesuai nama folder)
    this.name = 'My Algorithm';        // Nama tampilan
    this.icon = '&#9830;';             // Ikon HTML entity
    this.description = 'Deskripsi singkat algoritma.';
    
    this.configSchema = {              // Skema form parameter
      param1: {
        label: 'Parameter 1',
        type: 'number',                // 'number' | 'select' | 'text' | 'checkbox'
        min: 1, max: 100, step: 1,
        default: 10
      }
    };
  }

  // WAJIB: Proses komputasi (berjalan di Worker Thread)
  process({ trainRows, testRows, classCol, featureCols, config, seed }) {
    // Lakukan perhitungan
    return { /* hasil */ };
  }

  // WAJIB: Render HTML hasil ke container DOM (Main Thread)
  renderHTML(result, container) {
    container.innerHTML = '<h2>Hasil</h2>...';
  }

  // WAJIB: Ekspor Excel workbook (Main Thread)
  exportExcel(result, mode) {
    const WB = XLSX.utils.book_new();
    // Buat worksheet...
    return WB;
  }
}

// WAJIB: Register ke registry
registry.register(new MyAlgoPlugin());
```

---

## Interface AlgorithmPlugin

Base class `AlgorithmPlugin` (di `src/core/algorithm_interface.js`) menyediakan:

### Method Wajib (Override)

| Method | Context | Tujuan |
|--------|---------|--------|
| `process(params)` | Worker | Melakukan seluruh komputasi algoritma |
| `renderHTML(result, container)` | Main | Merender visualisasi hasil ke DOM |
| `exportExcel(result, mode)` | Main | Membuat workbook Excel |

### Method Tersedia (Inherited)

| Method | Tujuan |
|--------|--------|
| `_buildExcelBlock(blockId, rows)` | Membuat panel formula Excel collapsible |

### Parameter `process()`

```javascript
{
  trainRows: Array,      // Data training (array of objects)
  testRows: Array,       // Data testing (array of objects)
  classCol: string,      // Nama kolom target/kelas
  featureCols: string[], // Nama kolom fitur
  config: Object,        // Parameter dari form konfigurasi
  seed: number,          // Random seed LCG
  rawRows: Array         // Seluruh data bersih (pre-split)
}
```

---

## Registry

Plugin mendaftarkan diri ke `PluginRegistry` singleton:

```javascript
registry.register(new MyAlgoPlugin());
```

Registry melakukan validasi:
- ✅ Instance harus `extends AlgorithmPlugin`
- ✅ Harus memiliki `id` unik
- ✅ Harus memiliki `name`
- ✅ Harus memiliki `configSchema`

---

## Cara Menambah Plugin Baru

### Langkah 1: Buat folder dan file

```bash
mkdir src/plugins/my_algo
# Buat file: src/plugins/my_algo/my_algo_plugin.js
```

### Langkah 2: Implementasi class

Salin template dari `PLUGIN_TEMPLATE/plugin_template.js` dan modifikasi.

### Langkah 3: Daftarkan di `index.html`

Tambahkan satu baris `<script>` sebelum `core_ui.js`:

```html
<script src="src/plugins/my_algo/my_algo_plugin.js"></script>
```

### Langkah 4: Test

1. Buka browser → SPA akan otomatis menampilkan plugin baru di sidebar & home grid
2. Upload CSV → Pilih target → Konfigurasi parameter → Jalankan
3. Pastikan hasil render dan export Excel berfungsi

---

## Config Schema Types

| Type | Properties | Contoh |
|------|-----------|--------|
| `number` | `min`, `max`, `step`, `default` | `{ type: 'number', min: 1, max: 20, step: 1, default: 5 }` |
| `select` | `options: [{value, label}]`, `default` | `{ type: 'select', options: [{value:'a', label:'A'}], default: 'a' }` |
| `text` | `default` | `{ type: 'text', default: 'hello' }` |
| `checkbox` | `default` (boolean) | `{ type: 'checkbox', default: true }` |

---

## Dependency Rules

- Plugin **TIDAK BOLEH** mengimpor modul core lain secara langsung
- Plugin **BOLEH** menggunakan fungsi global: `escapeHTML()`, `sanitizeFormula()`, `DOMHelper`
- Plugin `process()` berjalan di Worker — **tidak ada akses DOM**
- Plugin `renderHTML()` dan `exportExcel()` berjalan di Main Thread — **ada akses DOM dan XLSX**
