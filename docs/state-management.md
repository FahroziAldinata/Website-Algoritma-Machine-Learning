# State Management

## StateManager

`StateManager` (`src/core/state_manager.js`) adalah singleton sederhana untuk menyimpan state aplikasi. Tidak ada reactive binding — state dibaca langsung oleh komponen yang membutuhkannya.

---

## State Properties

| Property | Type | Default | Deskripsi |
|----------|------|---------|-----------|
| `activePluginId` | `string\|null` | `null` | ID plugin yang sedang aktif |
| `headers` | `string[]` | `[]` | Header kolom dari CSV |
| `rawRows` | `object[]` | `[]` | Baris data mentah dari CSV |
| `cleanRows` | `object[]` | `[]` | Baris data setelah imputasi/drop |
| `trainRows` | `object[]` | `[]` | Data training setelah split |
| `testRows` | `object[]` | `[]` | Data testing setelah split |
| `classCol` | `string` | `''` | Kolom target/kelas |
| `featureCols` | `string[]` | `[]` | Kolom fitur terpilih |
| `testRatio` | `number` | `0.2` | Rasio data testing (0-1) |
| `mvStrategy` | `string` | `'mode'` | Strategi nilai kosong |
| `colTypes` | `string[]` | `[]` | Tipe kolom (numeric/categorical) |
| `cleanReport` | `object\|null` | `null` | Laporan hasil data cleaning |
| `isCalculating` | `boolean` | `false` | Apakah sedang menghitung |
| `lastResult` | `object\|null` | `null` | Hasil komputasi terakhir |

---

## API

```javascript
// Mengupdate state
StateManager.update('classCol', 'Species');

// Membaca state
const cols = StateManager.state.featureCols;

// Mereset seluruh state ke default
StateManager.reset();
```

---

## Alur State

```
CSV Upload → parseCSV() → StateManager.update('rawRows', ...)
           ↓
User Config → StateManager.update('classCol', ...)
            → StateManager.update('featureCols', ...)
           ↓
Run Model → cleanData() → splitData() → Worker postMessage()
           ↓
Worker DONE → StateManager.update('lastResult', ...)
            → plugin.renderHTML(result, container)
```

---

## Catatan Desain

- **Tidak reactive**: StateManager tidak memiliki pub/sub atau observer pattern. Komponen membaca state secara imperatif.
- **Single source of truth**: Semua state UI terpusat di satu objek.
- **Reset on upload**: `StateManager.reset()` dipanggil saat CSV baru di-upload untuk menghindari state stale.
