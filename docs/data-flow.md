# Data Flow

## Alur Data End-to-End

Dari upload CSV hingga ekspor Excel, data melalui pipeline berikut:

```
CSV File
  │
  ▼
┌─────────────────┐
│ 1. Parse CSV     │  parseCSV(text) → { headers, rawRows }
│    (core_ui.js)  │  Memecah teks CSV menjadi array of objects
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Store State   │  StateManager.update('rawRows', ...)
│    (state_mgr)   │  Simpan data mentah ke state terpusat
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Clean Data    │  cleanData(rawRows, headers, strategy)
│    (pipeline.js) │  - Imputasi mode/median
│                  │  - Atau drop baris kosong
│                  │  → { cleanRows, report, colTypes }
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Split Data    │  splitData(cleanRows, classCol, testRatio, seed, method)
│    (pipeline.js) │  - Random LCG / Stratified / Linear / None
│                  │  → { train, test }
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ 5. Worker Computation                    │
│    (generic_worker.js → plugin.process)  │
│                                          │
│    Beberapa plugin melakukan tambahan:   │
│    - getNormalizationStats(train)        │
│    - applyNormalization(data, stats)     │
│    → result object                       │
└────────┬────────────────────────────────┘
         │ postMessage({type:'DONE', result})
         ▼
┌─────────────────┐
│ 6. Render Result │  plugin.renderHTML(result, container)
│    (Main Thread) │  Visualisasi step-by-step ke DOM
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 7. Export Excel  │  plugin.exportExcel(result, mode)
│    (Main Thread) │  Buat workbook .xlsx dengan formula/plain values
└─────────────────┘
```

---

## Detail Setiap Tahap

### 1. Parse CSV

```javascript
// Input: teks CSV (comma-separated)
const { headers, rawRows } = parseCSV(csvText);
// headers: ['SepalLength', 'SepalWidth', 'Species']
// rawRows: [{ SepalLength: '5.1', SepalWidth: '3.5', Species: 'setosa' }, ...]
```

### 2. Clean Data

```javascript
const { cleanRows, report, colTypes } = cleanData(rawRows, headers, 'mode');
// report: { strategy: 'mode', rowsBefore: 150, rowsAfter: 150, imputations: {...} }
// colTypes: { SepalLength: 'numeric', Species: 'categorical' }
```

### 3. Split Data

```javascript
const { train, test } = splitData(cleanRows, 'Species', 0.2, 42, 'stratified');
// train: 120 rows (proportional per class)
// test: 30 rows (proportional per class)
```

Metode split yang didukung:

| Method | Deskripsi |
|--------|-----------|
| `random` | Random shuffle menggunakan LCG dengan seed |
| `stratified` | Menjaga proporsi kelas di train dan test |
| `linear` | Split sistematis berdasarkan urutan (regresi) |
| `none` | Tidak ada split — semua data untuk training |

### 4. Normalization (per-plugin)

KNN dan Regression melakukan normalisasi tambahan:

```javascript
// Hitung stats HANYA dari training set (mencegah data leakage)
const stats = getNormalizationStats(train, featureCols);

// Terapkan ke training dan testing menggunakan stats yang sama
const normTrain = applyNormalization(train, stats, featureCols);
const normTest = applyNormalization(test, stats, featureCols);
```

---

## Data Leakage Prevention

> **PENTING**: Normalisasi (min-max) dihitung **hanya dari training set**. 
> Test set dinormalisasi menggunakan statistik training set.
> Ini mencegah data leakage yang umum terjadi di implementasi naif.

---

## Seeded Randomness

Semua operasi random menggunakan **LCG (Linear Congruential Generator)** dengan seed tetap:

```javascript
// LCG menghasilkan urutan pseudo-random yang reprodusible
const rng = new LCG(42);
rng.next(); // Selalu menghasilkan angka yang sama untuk seed yang sama
```

Keuntungan:
- **Reproducible**: Hasil identik untuk seed yang sama
- **Deterministic**: Tidak bergantung pada `Math.random()`
- **Verifiable**: Pengguna bisa memverifikasi split data secara manual
