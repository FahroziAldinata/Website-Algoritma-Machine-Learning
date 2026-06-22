/**
 * src/shared/pipeline.js
 * Data Preprocessing Pipeline Module
 * 
 * Tujuan: Mengonsolidasikan proses parsing CSV, pembersihan data (imputasi/drop),
 * train/test split (linear, random LCG, stratified), serta normalisasi data
 * (Min-Max dan Z-Score standardisasi) untuk mencegah kebocoran data (data leakage).
 */

/**
 * Parsing teks CSV dengan dukungan karakter kutip ganda (RFC 4180 compliant)
 * @param {string} text - Teks CSV mentah
 * @returns {object} { headers, rawRows }
 */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let col = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          col += '"';
          i++; // Lewati kutip ganda berikutnya
        } else {
          inQuotes = false;
        }
      } else {
        col += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(col.trim());
        col = "";
      } else if (char === '\r' || char === '\n') {
        row.push(col.trim());
        col = "";
        if (row.length > 0 && (row.length > 1 || row[0] !== "")) {
          rows.push(row);
        }
        row = [];
        if (char === '\r' && next === '\n') {
          i++; // Lewati \n
        }
      } else {
        col += char;
      }
    }
  }

  if (row.length > 0 || col !== "") {
    row.push(col.trim());
    if (row.length > 0 && (row.length > 1 || row[0] !== "")) {
      rows.push(row);
    }
  }

  if (rows.length < 2) {
    throw new Error("CSV kosong atau hanya berisi header.");
  }

  const headers = rows[0].map(h => h.trim());
  const rawRows = rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? r[idx] : "";
    });
    return obj;
  });

  return { headers, rawRows };
}

/**
 * Melakukan imputasi nilai kosong atau membuang baris yang tidak lengkap
 * @param {Array} rows - Array objek baris data
 * @param {Array} headers - Array nama kolom
 * @param {string} strategy - Strategi pembersihan ('mode' | 'median' | 'drop')
 * @returns {object} { cleanRows, report, colTypes }
 */
function cleanData(rows, headers, strategy) {
  // Deteksi tipe data kolom (numerik vs kategorik)
  const colTypes = {};
  headers.forEach(h => {
    let isNum = true;
    for (const r of rows) {
      const v = r[h];
      if (v !== '' && v != null) {
        if (isNaN(parseFloat(v))) {
          isNum = false;
          break;
        }
      }
    }
    colTypes[h] = isNum ? 'num' : 'cat';
  });

  // Jika ffill atau interpolate, pastikan baris pertama tidak kosong untuk ffill (fallback ke nol atau backward fill)
  if (strategy === 'ffill' || strategy === 'interpolate') {
    // Implementasi khusus Time-Series
    const cleanRows = [...rows];
    const report = { totalRows: rows.length, droppedRows: 0, imputedValues: 0, imputedDetails: {} };
    headers.forEach(h => report.imputedDetails[h] = 0);

    headers.forEach(h => {
      let lastVal = null;
      for (let i = 0; i < cleanRows.length; i++) {
        let v = cleanRows[i][h];
        if (v === '' || v == null) {
          if (strategy === 'ffill') {
            // Jika di awal kosong, cari ke depan (bfill)
            if (lastVal === null) {
              for (let j = i + 1; j < cleanRows.length; j++) {
                if (cleanRows[j][h] !== '' && cleanRows[j][h] != null) {
                  lastVal = cleanRows[j][h];
                  break;
                }
              }
              if (lastVal === null) lastVal = colTypes[h] === 'num' ? 0 : ""; // Fallback ekstrim
            }
            cleanRows[i] = { ...cleanRows[i], [h]: lastVal };
            report.imputedValues++;
            report.imputedDetails[h]++;
          } else if (strategy === 'interpolate' && colTypes[h] === 'num') {
            // Linear Interpolation
            let prevIdx = i - 1;
            let nextIdx = i + 1;
            let prevVal = prevIdx >= 0 ? parseFloat(cleanRows[prevIdx][h]) : null;
            let nextVal = null;
            while (nextIdx < cleanRows.length) {
              if (cleanRows[nextIdx][h] !== '' && cleanRows[nextIdx][h] != null) {
                nextVal = parseFloat(cleanRows[nextIdx][h]);
                break;
              }
              nextIdx++;
            }
            
            if (prevVal === null && nextVal !== null) prevVal = nextVal;
            if (nextVal === null && prevVal !== null) nextVal = prevVal;
            if (prevVal === null && nextVal === null) { prevVal = 0; nextVal = 0; }
            
            const steps = nextIdx - prevIdx;
            const stepVal = (nextVal - prevVal) / steps;
            const interpolated = prevVal + (stepVal * (i - prevIdx));
            
            cleanRows[i] = { ...cleanRows[i], [h]: String(interpolated) };
            report.imputedValues++;
            report.imputedDetails[h]++;
          } else {
            // Fallback ffill untuk kategorik jika interpolate
            if (lastVal !== null) {
               cleanRows[i] = { ...cleanRows[i], [h]: lastVal };
               report.imputedValues++;
               report.imputedDetails[h]++;
            }
          }
        } else {
          lastVal = v;
        }
      }
    });
    report.remainingRows = cleanRows.length;
    return { cleanRows, report, colTypes };
  }

  // Hitung median dan mode untuk imputasi
  const stats = {};
  headers.forEach(h => {
    const values = rows.map(r => r[h]).filter(v => v !== '' && v != null);
    if (colTypes[h] === 'num') {
      const floatVals = values.map(v => parseFloat(v)).sort((a, b) => a - b);
      if (floatVals.length > 0) {
        // Median
        const mid = Math.floor(floatVals.length / 2);
        const median = floatVals.length % 2 !== 0 
          ? floatVals[mid] 
          : (floatVals[mid - 1] + floatVals[mid]) / 2;
        
        // Mode
        const counts = {};
        let modeVal = floatVals[0];
        let maxCount = 0;
        floatVals.forEach(v => {
          counts[v] = (counts[v] || 0) + 1;
          if (counts[v] > maxCount) {
            maxCount = counts[v];
            modeVal = v;
          }
        });
        stats[h] = { median, mode: modeVal };
      } else {
        stats[h] = { median: 0, mode: 0 };
      }
    } else {
      // Modus kategorikal
      if (values.length > 0) {
        const counts = {};
        let modeVal = values[0];
        let maxCount = 0;
        values.forEach(v => {
          counts[v] = (counts[v] || 0) + 1;
          if (counts[v] > maxCount) {
            maxCount = counts[v];
            modeVal = v;
          }
        });
        stats[h] = { mode: modeVal, median: modeVal };
      } else {
        stats[h] = { mode: "", median: "" };
      }
    }
  });

  const cleanRows = [];
  const report = {
    totalRows: rows.length,
    droppedRows: 0,
    imputedValues: 0,
    imputedDetails: {}
  };

  headers.forEach(h => {
    report.imputedDetails[h] = 0;
  });

  for (const r of rows) {
    let hasMissing = false;
    headers.forEach(h => {
      const v = r[h];
      if (v === '' || v == null) {
        hasMissing = true;
      }
    });

    if (hasMissing && strategy === 'drop') {
      report.droppedRows++;
      continue;
    }

    const nr = { ...r };
    headers.forEach(h => {
      const v = r[h];
      if (v === '' || v == null) {
        const replacement = strategy === 'median' ? stats[h].median : stats[h].mode;
        nr[h] = String(replacement);
        report.imputedValues++;
        report.imputedDetails[h]++;
      }
    });
    cleanRows.push(nr);
  }

  report.remainingRows = cleanRows.length;
  return { cleanRows, report, colTypes };
}

/**
 * Membagi dataset menjadi training dan testing set secara deterministik
 * @param {Array} rows - Dataset bersih
 * @param {string} classCol - Nama kolom kelas (untuk stratified split)
 * @param {number} testRatio - Rasio data testing (0.0 - 1.0)
 * @param {number} seed - Seed acak untuk LCG
 * @param {string} splitMethod - Metode split ('random' | 'stratified' | 'linear' | 'none')
 * @returns {object} { train, test }
 */
function splitData(rows, classCol, testRatio, seed, splitMethod) {
  if (splitMethod === 'none' || testRatio <= 0) {
    return { train: rows, test: [] };
  }

  const n = rows.length;
  const nTest = Math.max(1, Math.round(n * testRatio));

  if (nTest >= n) {
    return { train: [], test: rows };
  }

  // 1. Linear Split (Sistematis)
  if (splitMethod === 'linear') {
    const step = n / nTest;
    const testIdxSet = new Set();
    for (let i = 0; i < nTest; i++) {
      let idx = Math.round(i * step + step / 2);
      if (idx >= n) idx = n - 1;
      while (testIdxSet.has(idx) && idx < n - 1) idx++;
      testIdxSet.add(idx);
    }
    const train = [], test = [];
    rows.forEach((r, i) => (testIdxSet.has(i) ? test : train).push(r));
    return { train, test };
  }

  // 2. Stratified Split (Berdasarkan distribusi kelas target)
  if (splitMethod === 'stratified' && classCol && rows.length > 0 && rows[0][classCol] !== undefined) {
    const groups = {};
    rows.forEach(r => {
      const cls = r[classCol];
      if (!groups[cls]) groups[cls] = [];
      groups[cls].push(r);
    });

    const train = [], test = [];
    // Sort keys agar urutan konsisten
    for (const cls of Object.keys(groups).sort()) {
      const groupRows = groups[cls];
      const shuffled = lcgShuffle(groupRows, seed);
      const groupTestSize = Math.max(1, Math.round(shuffled.length * testRatio));
      test.push(...shuffled.slice(0, groupTestSize));
      train.push(...shuffled.slice(groupTestSize));
    }
    return { train, test };
  }

  // 3. Random Split (Default - menggunakan LCG generator)
  const indices = rows.map((_, i) => i);
  const shuffledIndices = lcgShuffle(indices, seed);
  const testIdxSet = new Set(shuffledIndices.slice(0, nTest));

  const train = [], test = [];
  rows.forEach((r, i) => {
    if (testIdxSet.has(i)) {
      test.push(r);
    } else {
      train.push(r);
    }
  });

  return { train, test };
}

/**
 * Menghitung parameter normalisasi dari training set untuk mencegah data leakage
 * @param {Array} trainRows - Dataset training
 * @param {Array} featureCols - Kolom fitur yang akan dinormalisasi
 * @param {string} normType - Tipe normalisasi ('minmax' | 'standard' | 'none')
 * @returns {object} Objek berisi statistik per kolom
 */
function getNormalizationStats(trainRows, featureCols, normType) {
  if (normType === 'none' || !normType) return null;

  const stats = {};
  for (const c of featureCols) {
    const vals = trainRows.map(r => parseFloat(r[c])).filter(v => !isNaN(v));
    if (vals.length === 0) continue;

    if (normType === 'minmax') {
      let min = Infinity, max = -Infinity;
      vals.forEach(v => {
        if (v < min) min = v;
        if (v > max) max = v;
      });
      stats[c] = { min, max };
    } else if (normType === 'standard') {
      const sum = vals.reduce((s, v) => s + v, 0);
      const mean = sum / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      const std = Math.sqrt(variance);
      stats[c] = { mean, std };
    }
  }
  return stats;
}

/**
 * Menerapkan statistik normalisasi ke dataset apa pun (train atau test)
 * @param {Array} rows - Dataset
 * @param {Array} featureCols - Kolom fitur
 * @param {string} normType - Tipe normalisasi
 * @param {object} stats - Statistik referensi hasil hitung dari training set
 * @returns {Array} Dataset yang telah ternormalisasi
 */
function applyNormalization(rows, featureCols, normType, stats) {
  if (normType === 'none' || !normType || !stats) {
    return rows.map(r => {
      const nr = { ...r };
      featureCols.forEach(c => {
        const v = parseFloat(nr[c]);
        nr[c] = isNaN(v) ? 0 : v;
      });
      return nr;
    });
  }

  return rows.map(r => {
    const nr = { ...r };
    featureCols.forEach(c => {
      if (!(c in stats)) {
        const v = parseFloat(nr[c]);
        nr[c] = isNaN(v) ? 0 : v;
        return;
      }
      const v = parseFloat(r[c]);
      if (isNaN(v)) {
        nr[c] = 0;
        return;
      }

      if (normType === 'minmax') {
        const { min, max } = stats[c];
        nr[c] = max === min ? 0 : (v - min) / (max - min);
      } else if (normType === 'standard') {
        const { mean, std } = stats[c];
        nr[c] = std === 0 ? 0 : (v - mean) / std;
      }
    });
    return nr;
  });
}

// Ekspos ke global context agar kompatibel dengan lingkungan Worker classic dan ES modules
if (typeof window !== 'undefined') {
  window.parseCSV = parseCSV;
  window.cleanData = cleanData;
  window.splitData = splitData;
  window.getNormalizationStats = getNormalizationStats;
  window.applyNormalization = applyNormalization;
} else if (typeof self !== 'undefined') {
  self.parseCSV = parseCSV;
  self.cleanData = cleanData;
  self.splitData = splitData;
  self.getNormalizationStats = getNormalizationStats;
  self.applyNormalization = applyNormalization;
}

/**
 * Menyortir data berdasarkan kolom waktu dan mendeteksi frekuensi secara heuristik
 * @param {Array} rows - Dataset
 * @param {string} timeCol - Nama kolom waktu
 * @returns {Array} Dataset yang telah disortir
 */
function prepareTimeSeriesData(rows, timeCol) {
  if (!rows || rows.length === 0) return rows;
  const sorted = [...rows].sort((a, b) => {
    const da = new Date(a[timeCol]).getTime();
    const db = new Date(b[timeCol]).getTime();
    if (isNaN(da) || isNaN(db)) return 0; // Jika tidak valid, biarkan urutan asli
    return da - db;
  });
  return sorted;
}

if (typeof window !== 'undefined') {
  window.prepareTimeSeriesData = prepareTimeSeriesData;
} else if (typeof self !== 'undefined') {
  self.prepareTimeSeriesData = prepareTimeSeriesData;
}
