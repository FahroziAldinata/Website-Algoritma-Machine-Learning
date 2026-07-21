/**
 * src/shared/normalization.js
 * Data Normalization Module (Terinspirasi dari scikit-learn)
 *
 * Tujuan: Menyediakan kelas scaler untuk transformasi data numerik.
 * Dua metode didukung:
 *   - StandardScaler (Z-Score): (x - mean) / std
 *   - MinMaxScaler: (x - min) / (max - min)
 *
 * Setiap scaler mengimplementasikan antarmuka fit() / transform() / fitTransform()
 * sehingga dapat digunakan secara konsisten di seluruh plugin.
 */

/**
 * StandardScaler (Z-Score Standardization)
 * Mentransformasi data sehingga setiap fitur memiliki mean = 0 dan std = 1.
 */
class StandardScaler {
  constructor() {
    this.means_ = null;
    this.stds_ = null;
    this.nFeaturesIn_ = 0;
  }

  /**
   * Menghitung mean dan std dari data training
   * @param {Array<number[]>} matrix - Matriks 2D numerik [n_samples, n_features]
   * @returns {StandardScaler} Instance dirinya sendiri (method chaining)
   */
  fit(matrix) {
    this._validate(matrix);
    const n = matrix.length;
    const d = matrix[0].length;
    this.nFeaturesIn_ = d;

    this.means_ = new Array(d).fill(0);
    this.stds_ = new Array(d).fill(0);

    for (let j = 0; j < d; j++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += matrix[i][j];
      }
      this.means_[j] = sum / n;
    }

    for (let j = 0; j < d; j++) {
      let sumSq = 0;
      for (let i = 0; i < n; i++) {
        const diff = matrix[i][j] - this.means_[j];
        sumSq += diff * diff;
      }
      this.stds_[j] = Math.sqrt(sumSq / n);
    }

    return this;
  }

  /**
   * Menerapkan transformasi Z-Score pada data
   * @param {Array<number[]>} matrix - Matriks 2D numerik
   * @returns {Array<number[]>} Data yang telah distandardisasi
   */
  transform(matrix) {
    this._requireFitted();
    this._validate(matrix);
    this._validateDim(matrix);

    return matrix.map(row =>
      row.map((v, j) => {
        return this.stds_[j] === 0 ? 0 : (v - this.means_[j]) / this.stds_[j];
      })
    );
  }

  /**
   * fit() + transform() dalam satu langkah
   * @param {Array<number[]>} matrix - Matriks 2D numerik
   * @returns {Array<number[]>} Data yang telah distandardisasi
   */
  fitTransform(matrix) {
    return this.fit(matrix).transform(matrix);
  }

  /**
   * Membalikkan transformasi Z-Score kembali ke skala asli
   * @param {Array<number[]>} matrix - Data yang telah distandardisasi
   * @returns {Array<number[]>} Data dalam skala asli
   */
  inverseTransform(matrix) {
    this._requireFitted();
    this._validate(matrix);
    this._validateDim(matrix);

    return matrix.map(row =>
      row.map((v, j) => v * this.stds_[j] + this.means_[j])
    );
  }

  /**
   * Mengembalikan parameter scaler untuk disimpan/diekspor
   * @returns {object} { means, stds }
   */
  getParams() {
    this._requireFitted();
    return { means: [...this.means_], stds: [...this.stds_] };
  }

  /**
   * Memuat parameter yang sudah di-fit sebelumnya
   * @param {object} params - { means, stds }
   */
  setParams(params) {
    if (!params || !params.means || !params.stds) {
      throw new Error('Parameter StandardScaler tidak valid.');
    }
    if (params.means.length !== params.stds.length) {
      throw new Error('Panjang means dan stds tidak sama.');
    }
    this.means_ = [...params.means];
    this.stds_ = [...params.stds];
    this.nFeaturesIn_ = this.means_.length;
  }

  _validate(matrix) {
    if (!matrix || matrix.length === 0 || !matrix[0]) {
      throw new Error('Data tidak boleh kosong.');
    }
    const d = matrix[0].length;
    for (let i = 0; i < matrix.length; i++) {
      if (!matrix[i] || matrix[i].length !== d) {
        throw new Error(`Dimensi baris ${i} tidak konsisten (harus ${d} kolom).`);
      }
      for (let j = 0; j < d; j++) {
        if (typeof matrix[i][j] !== 'number' || isNaN(matrix[i][j])) {
          throw new Error(`Nilai non-numerik ditemukan pada baris ${i}, kolom ${j}.`);
        }
      }
    }
  }

  _validateDim(matrix) {
    if (matrix[0].length !== this.nFeaturesIn_) {
      throw new Error(
        `Jumlah fitur tidak sesuai: data=${matrix[0].length}, scaler=${this.nFeaturesIn_}.`
      );
    }
  }

  _requireFitted() {
    if (this.means_ === null || this.stds_ === null) {
      throw new Error('Scaler belum di-fit. Panggil fit() terlebih dahulu.');
    }
  }
}

/**
 * MinMaxScaler (Min-Max Scaling)
 * Mentransformasi data ke rentang [0, 1] berdasarkan min dan max tiap fitur.
 */
class MinMaxScaler {
  constructor() {
    this.mins_ = null;
    this.maxs_ = null;
    this.nFeaturesIn_ = 0;
  }

  /**
   * Menghitung min dan max dari data training
   * @param {Array<number[]>} matrix - Matriks 2D numerik [n_samples, n_features]
   * @returns {MinMaxScaler} Instance dirinya sendiri (method chaining)
   */
  fit(matrix) {
    this._validate(matrix);
    const d = matrix[0].length;
    this.nFeaturesIn_ = d;

    this.mins_ = new Array(d).fill(Infinity);
    this.maxs_ = new Array(d).fill(-Infinity);

    for (let j = 0; j < d; j++) {
      for (let i = 0; i < matrix.length; i++) {
        if (matrix[i][j] < this.mins_[j]) this.mins_[j] = matrix[i][j];
        if (matrix[i][j] > this.maxs_[j]) this.maxs_[j] = matrix[i][j];
      }
    }

    return this;
  }

  /**
   * Menerapkan transformasi Min-Max pada data
   * @param {Array<number[]>} matrix - Matriks 2D numerik
   * @returns {Array<number[]>} Data dalam rentang [0, 1]
   */
  transform(matrix) {
    this._requireFitted();
    this._validate(matrix);
    this._validateDim(matrix);

    return matrix.map(row =>
      row.map((v, j) => {
        const range = this.maxs_[j] - this.mins_[j];
        return range === 0 ? 0 : (v - this.mins_[j]) / range;
      })
    );
  }

  /**
   * fit() + transform() dalam satu langkah
   * @param {Array<number[]>} matrix - Matriks 2D numerik
   * @returns {Array<number[]>} Data dalam rentang [0, 1]
   */
  fitTransform(matrix) {
    return this.fit(matrix).transform(matrix);
  }

  /**
   * Membalikkan transformasi Min-Max kembali ke skala asli
   * @param {Array<number[]>} matrix - Data dalam rentang [0, 1]
   * @returns {Array<number[]>} Data dalam skala asli
   */
  inverseTransform(matrix) {
    this._requireFitted();
    this._validate(matrix);
    this._validateDim(matrix);

    return matrix.map(row =>
      row.map((v, j) => {
        const range = this.maxs_[j] - this.mins_[j];
        return v * range + this.mins_[j];
      })
    );
  }

  /**
   * Mengembalikan parameter scaler untuk disimpan/diekspor
   * @returns {object} { mins, maxs }
   */
  getParams() {
    this._requireFitted();
    return { mins: [...this.mins_], maxs: [...this.maxs_] };
  }

  /**
   * Memuat parameter yang sudah di-fit sebelumnya
   * @param {object} params - { mins, maxs }
   */
  setParams(params) {
    if (!params || !params.mins || !params.maxs) {
      throw new Error('Parameter MinMaxScaler tidak valid.');
    }
    if (params.mins.length !== params.maxs.length) {
      throw new Error('Panjang mins dan maxs tidak sama.');
    }
    this.mins_ = [...params.mins];
    this.maxs_ = [...params.maxs];
    this.nFeaturesIn_ = this.mins_.length;
  }

  _validate(matrix) {
    if (!matrix || matrix.length === 0 || !matrix[0]) {
      throw new Error('Data tidak boleh kosong.');
    }
    const d = matrix[0].length;
    for (let i = 0; i < matrix.length; i++) {
      if (!matrix[i] || matrix[i].length !== d) {
        throw new Error(`Dimensi baris ${i} tidak konsisten (harus ${d} kolom).`);
      }
      for (let j = 0; j < d; j++) {
        if (typeof matrix[i][j] !== 'number' || isNaN(matrix[i][j])) {
          throw new Error(`Nilai non-numerik ditemukan pada baris ${i}, kolom ${j}.`);
        }
      }
    }
  }

  _validateDim(matrix) {
    if (matrix[0].length !== this.nFeaturesIn_) {
      throw new Error(
        `Jumlah fitur tidak sesuai: data=${matrix[0].length}, scaler=${this.nFeaturesIn_}.`
      );
    }
  }

  _requireFitted() {
    if (this.mins_ === null || this.maxs_ === null) {
      throw new Error('Scaler belum di-fit. Panggil fit() terlebih dahulu.');
    }
  }
}

/**
 * Factory untuk membuat scaler berdasarkan nama metode
 * @param {string} method - 'minmax' | 'standard' | 'none'
 * @returns {object|null} Instance scaler atau null jika 'none'
 */
function createScaler(method) {
  if (method === 'minmax') return new MinMaxScaler();
  if (method === 'standard') return new StandardScaler();
  if (method === 'none' || !method) return null;
  throw new Error(`Metode normalisasi tidak dikenal: "${method}". Gunakan 'minmax', 'standard', atau 'none'.`);
}

/**
 * Mendeteksi apakah data cocok untuk normalisasi
 * @param {Array<number[]>} matrix - Matriks 2D numerik
 * @returns {{ valid: boolean, message: string }}
 */
function validateNormalizationInput(matrix) {
  if (!matrix || matrix.length === 0) {
    return { valid: false, message: 'Data kosong — tidak dapat melakukan normalisasi.' };
  }
  if (!matrix[0] || matrix[0].length === 0) {
    return { valid: false, message: 'Data tidak memiliki fitur (kolom).' };
  }
  const d = matrix[0].length;
  for (let i = 0; i < matrix.length; i++) {
    if (!matrix[i] || matrix[i].length !== d) {
      return { valid: false, message: `Dimensi baris ${i} tidak konsisten.` };
    }
    for (let j = 0; j < d; j++) {
      if (typeof matrix[i][j] !== 'number' || isNaN(matrix[i][j])) {
        return { valid: false, message: `Nilai non-numerik pada baris ${i}, kolom ${j}.` };
      }
    }
  }
  return { valid: true, message: 'OK' };
}

// Ekspos ke global context agar kompatibel dengan Worker classic dan ES modules
if (typeof window !== 'undefined') {
  window.StandardScaler = StandardScaler;
  window.MinMaxScaler = MinMaxScaler;
  window.createScaler = createScaler;
  window.validateNormalizationInput = validateNormalizationInput;
} else if (typeof self !== 'undefined') {
  self.StandardScaler = StandardScaler;
  self.MinMaxScaler = MinMaxScaler;
  self.createScaler = createScaler;
  self.validateNormalizationInput = validateNormalizationInput;
}
