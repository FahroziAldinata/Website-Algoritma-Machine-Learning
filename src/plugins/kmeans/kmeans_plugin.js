/**
 * src/plugins/kmeans/kmeans_plugin.js
 * K-Means Clustering Algorithm Plugin
 * 
 * Tujuan: Mengimplementasikan K-Means Clustering untuk data numerik.
 * Mendukung inisialisasi centroid awal (First K / Random), normalisasi Min-Max,
 * pencatatan visualisasi jarak per iterasi, komputasi evaluasi internal (Silhouette,
 * Davies-Bouldin, SSE/Inertia), proyeksi PCA 2D via SVG, serta ekspor Excel formula/plain.
 */

class KMeansPlugin extends AlgorithmPlugin {
  constructor() {
    super();
    this.id = 'kmeans';
    this.name = 'K-Means Clustering';
    this.icon = '&#9673;';
    this.description = 'Clustering data numerik berbasis jarak (Euclidean/Manhattan) dengan opsi normalisasi (Min-Max / Z-Score / None) dan inisialisasi centroid.';
    this.uiMode = 'clustering';
    this.uiCapabilities = { requiresTarget: false };
    
    this.configSchema = {
      k: {
        label: 'Jumlah Cluster (K)',
        type: 'number',
        min: 2,
        max: 10,
        step: 1,
        default: 3
      },
      initMethod: {
        label: 'Inisialisasi Centroid',
        type: 'select',
        options: [
          { label: 'K Data Pertama (First K)', value: 'first' },
          { label: 'Acak Deterministik (Random LCG)', value: 'random' },
          { label: 'Manual (Baris Spesifik)', value: 'manual' }
        ],
        default: 'first'
      },
      manualIndices: {
        label: 'Nomor Baris Centroid (pisahkan koma)',
        type: 'text',
        default: '1,2,3',
        dependsOn: { field: 'initMethod', value: 'manual' }
      },
      distMetric: {
        label: 'Metrik Jarak',
        type: 'select',
        options: [
          { label: 'Euclidean', value: 'euclidean' },
          { label: 'Manhattan', value: 'manhattan' }
        ],
        default: 'euclidean'
      },
      maxIter: {
        label: 'Maksimum Iterasi',
        type: 'number',
        min: 1,
        max: 100,
        step: 1,
        default: 10
      },
      normMethod: {
        label: 'Normalisasi Data',
        type: 'select',
        options: [
          { label: 'MinMaxScaler (skala [0,1])', value: 'minmax' },
          { label: 'StandardScaler (Z-Score)', value: 'standard' },
          { label: 'Tanpa Normalisasi', value: 'none' }
        ],
        default: 'minmax'
      }
    };
  }

  _euclidean(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
    return Math.sqrt(sum);
  }

  _manhattan(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
    return sum;
  }

  _computeDist(a, b, metric) {
    return metric === 'manhattan' ? this._manhattan(a, b) : this._euclidean(a, b);
  }

  _clone2D(arr) {
    return arr.map(r => [...r]);
  }

  _centroidsEqual(a, b, tol = 1e-9) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < a[i].length; j++) {
        if (Math.abs(a[i][j] - b[i][j]) > tol) return false;
      }
    }
    return true;
  }

  _assignClusters(data, centroids, metric) {
    const labels = [];
    const distances = [];
    data.forEach(row => {
      const dists = centroids.map(c => this._computeDist(row, c, metric));
      labels.push(dists.indexOf(Math.min(...dists)));
      distances.push(dists);
    });
    return { labels, distances };
  }

  _mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((s, x) => s + x, 0) / arr.length;
  }

  _computeCentroid(rows, dim) {
    if (!rows.length) return new Array(dim).fill(0);
    const c = new Array(dim).fill(0);
    rows.forEach(r => r.forEach((v, i) => { c[i] += v; }));
    return c.map(s => s / rows.length);
  }

  _computeSSE(data, labels, centroids, metric) {
    let sse = 0;
    data.forEach((row, i) => {
      const d = this._computeDist(row, centroids[labels[i]], metric);
      sse += d * d;
    });
    return sse;
  }

  _computeSilhouette(data, labels, K, metric) {
    const n = data.length;
    if (K <= 1 || n <= K) return null;

    const scores = data.map((point, i) => {
      const myCluster = labels[i];

      // a(i) = rata-rata jarak ke sesama anggota cluster
      const sameCluster = data.filter((_, j) => j !== i && labels[j] === myCluster);
      if (sameCluster.length === 0) return 0;
      const a = this._mean(sameCluster.map(p => this._computeDist(point, p, metric)));

      // b(i) = rata-rata jarak terkecil ke cluster lain
      let b = Infinity;
      for (let ki = 0; ki < K; ki++) {
        if (ki === myCluster) continue;
        const otherCluster = data.filter((_, j) => labels[j] === ki);
        if (otherCluster.length === 0) continue;
        const avgDist = this._mean(otherCluster.map(p => this._computeDist(point, p, metric)));
        if (avgDist < b) b = avgDist;
      }

      return (b - a) / Math.max(a, b);
    });

    return this._mean(scores);
  }

  _computeSilhouettePerCluster(data, labels, K, metric) {
    return Array.from({ length: K }, (_, ki) => {
      const indices = data.map((_, i) => i).filter(i => labels[i] === ki);
      if (indices.length === 0) return { cluster: ki, score: null, count: 0 };
      const clusterScores = indices.map(i => {
        const point = data[i];
        const sameCluster = data.filter((_, j) => j !== i && labels[j] === ki);
        if (sameCluster.length === 0) return 0;
        const a = this._mean(sameCluster.map(p => this._computeDist(point, p, metric)));
        let b = Infinity;
        for (let kj = 0; kj < K; kj++) {
          if (kj === ki) continue;
          const otherCluster = data.filter((_, j) => labels[j] === kj);
          if (otherCluster.length === 0) continue;
          const avgDist = this._mean(otherCluster.map(p => this._computeDist(point, p, metric)));
          if (avgDist < b) b = avgDist;
        }
        return (b - a) / Math.max(a, b);
      });
      return { cluster: ki, score: this._mean(clusterScores), count: indices.length };
    });
  }

  _computeDaviesBouldin(data, labels, centroids, K, metric) {
    if (K <= 1) return null;

    const scatter = Array.from({ length: K }, (_, ki) => {
      const members = data.filter((_, i) => labels[i] === ki);
      if (members.length === 0) return 0;
      return this._mean(members.map(p => this._computeDist(p, centroids[ki], metric)));
    });

    let dbSum = 0;
    for (let i = 0; i < K; i++) {
      let maxR = -Infinity;
      for (let j = 0; j < K; j++) {
        if (i === j) continue;
        const separation = this._computeDist(centroids[i], centroids[j], metric);
        if (separation === 0) continue;
        const R = (scatter[i] + scatter[j]) / separation;
        if (R > maxR) maxR = R;
      }
      dbSum += maxR === -Infinity ? 0 : maxR;
    }

    return dbSum / K;
  }

  _buildClusterSummary(data, labels, centroids, K, featureNames, metric) {
    return Array.from({ length: K }, (_, ki) => {
      const members = data.map((row, i) => ({ row, idx: i })).filter(x => labels[x.idx] === ki);
      const rows = members.map(x => x.row);

      const stats = featureNames.map((f, fi) => {
        const vals = rows.map(r => r[fi]);
        return {
          feature: f,
          mean:    this._mean(vals),
          min:     vals.length ? Math.min(...vals) : 0,
          max:     vals.length ? Math.max(...vals) : 0,
          count:   vals.length,
        };
      });

      const sse = rows.reduce((s, r) => s + this._computeDist(r, centroids[ki], metric) ** 2, 0);

      return {
        clusterIdx: ki,
        memberIndices: members.map(x => x.idx),
        count: members.length,
        centroid: centroids[ki],
        stats,
        sse,
      };
    });
  }

  _buildDistDetail(point, centroid, metric, featureNames) {
    const diffs = featureNames.map((_, i) => point[i] - centroid[i]);
    const fmt = n => parseFloat(n.toFixed(4)).toString();

    if (metric === 'euclidean') {
      const squares = diffs.map(d => d * d);
      const sumSq   = squares.reduce((s, x) => s + x, 0);
      const result  = Math.sqrt(sumSq);
      return {
        metric,
        steps: featureNames.map((f, i) => ({
          feature: f,
          pointVal: point[i],
          centVal:  centroid[i],
          diff:     diffs[i],
          squared:  squares[i],
        })),
        sumSq,
        result,
        formula: `&radic;(${squares.map(s => fmt(s)).join(' + ')}) = &radic;${fmt(sumSq)} = ${fmt(result)}`,
      };
    } else {
      const absVals = diffs.map(Math.abs);
      const result  = absVals.reduce((s, x) => s + x, 0);
      return {
        metric,
        steps: featureNames.map((f, i) => ({
          feature:  f,
          pointVal: point[i],
          centVal:  centroid[i],
          diff:     diffs[i],
          absVal:   absVals[i],
        })),
        result,
        formula: `${absVals.map(v => fmt(v)).join(' + ')} = ${fmt(result)}`,
      };
    }
  }

  /**
   * Logika K-Means di background thread
   */
  async process(trainRowsDummy, testRowsDummy, config, onProgress) {
    const {
      k: K = 3,
      initMethod = 'first',
      manualIndices = '1,2,3',
      distMetric = 'euclidean',
      maxIter = 10,
      normMethod = 'minmax',
      rawRows,
      classCol,
      featureCols,
      seed = 42
    } = config;

    const n = rawRows.length;
    const featureNames = featureCols;
    const nCols = featureNames.length;

    // Ekstraksi nilai fitur asli (matrix data numerik)
    const cleanMatrix = rawRows.map(r => featureNames.map(f => parseFloat(r[f]) || 0));

    // Normalisasi data sesuai pilihan pengguna
    onProgress('Preprocessing', `Melakukan normalisasi data (${normMethod})...`, 15);
    const normMethods = {
      minmax: 'MinMaxScaler [0,1]',
      standard: 'StandardScaler (Z-Score)',
      none: 'Tanpa Normalisasi'
    };

    let scaler = null;
    let normalizedMatrix;
    let normDescription;

    if (normMethod === 'none') {
      normalizedMatrix = cleanMatrix.map(r => [...r]);
      scaler = null;
      normDescription = 'Tanpa Normalisasi';
    } else {
      scaler = createScaler(normMethod);
      normalizedMatrix = scaler.fitTransform(cleanMatrix);
      normDescription = normMethods[normMethod] || normMethod;
    }

    // Parameter untuk backward compatibility (ekspor Excel)
    const colMins = featureNames.map((_, fi) => Math.min(...cleanMatrix.map(r => r[fi])));
    const colMaxs = featureNames.map((_, fi) => Math.max(...cleanMatrix.map(r => r[fi])));

    onProgress('Inisialisasi', 'Memilih centroid awal...', 30);
    // Inisialisasi centroid awal dari normalizedMatrix
    let indices = [];
    const log = [];
    const fmtVal = n => parseFloat(n.toFixed(4)).toString();

    if (initMethod === 'manual') {
      const parts = manualIndices.split(',').map(s => parseInt(s.trim(), 10)).filter(i => !isNaN(i));
      if (parts.length !== K) {
         throw new Error(`Jumlah indeks centroid manual (${parts.length}) tidak sama dengan nilai K (${K}).`);
      }
      const validParts = parts.filter(i => i >= 1 && i <= n);
      if (validParts.length !== K) {
         throw new Error(`Semua indeks centroid manual harus berada dalam rentang 1 hingga ${n}.`);
      }
      const uniqueParts = new Set(validParts);
      if (uniqueParts.size !== K) {
         throw new Error('Indeks centroid manual tidak boleh ada duplikasi.');
      }
      indices = validParts.map(idx => idx - 1); // 1-based ke 0-based
      log.push(`Metode: Manual`);
      indices.forEach((idx, ki) => {
        log.push(`Centroid C${ki + 1} &larr; Baris ${idx + 1}: [${normalizedMatrix[idx].map(fmtVal).join(', ')}]`);
      });
    } else if (initMethod === 'first') {
      indices = Array.from({ length: K }, (_, i) => i % n);
      log.push(`Metode: K Data Pertama`);
      indices.forEach((idx, ki) => {
        log.push(`Centroid C${ki + 1} &larr; Baris ${idx + 1}: [${normalizedMatrix[idx].map(fmtVal).join(', ')}]`);
      });
    } else {
      // Random LCG shuffle
      const pool = Array.from({ length: n }, (_, i) => i);
      const shuffled = lcgShuffle(pool, seed);
      indices = shuffled.slice(0, K).sort((a, b) => a - b);
      log.push(`Metode: Random LCG (seed=${seed})`);
      indices.forEach((idx, ki) => {
        log.push(`Centroid C${ki + 1} &larr; Baris ${idx + 1}: [${normalizedMatrix[idx].map(fmtVal).join(', ')}]`);
      });
    }

    const initCentroids = indices.map(idx => [...normalizedMatrix[idx]]);
    let centroids = this._clone2D(initCentroids);
    const iterations = [];
    let converged = false;
    let finalLabels = [];

    for (let iter = 0; iter < maxIter; iter++) {
      onProgress('Iterasi', `Memproses Iterasi ke-${iter + 1}...`, Math.min(40 + iter * 5, 80));

      const { labels, distances } = this._assignClusters(normalizedMatrix, centroids, distMetric);
      
      // Hitung ulang centroid
      const groups = Array.from({ length: K }, () => []);
      normalizedMatrix.forEach((row, i) => groups[labels[i]].push(row));

      const newCentroids = groups.map((rows, ki) => {
        if (rows.length === 0) {
          return [...centroids[ki]]; // fallback keep centroid lama
        }
        return this._computeCentroid(rows, nCols);
      });

      converged = this._centroidsEqual(centroids, newCentroids);

      iterations.push({
        iter: iter + 1,
        centroidsOld: this._clone2D(centroids),
        centroidsNew: this._clone2D(newCentroids),
        labels: [...labels],
        distances: distances.map(d => [...d]),
        converged
      });

      centroids = this._clone2D(newCentroids);
      finalLabels = labels;

      if (converged) break;
    }

    onProgress('Metrik Evaluasi', 'Menghitung SSE, Silhouette, Davies-Bouldin...', 90);
    const sse = this._computeSSE(normalizedMatrix, finalLabels, centroids, distMetric);
    const silAvg = this._computeSilhouette(normalizedMatrix, finalLabels, K, distMetric);
    const silPerCluster = this._computeSilhouettePerCluster(normalizedMatrix, finalLabels, K, distMetric);
    const dbIndex = this._computeDaviesBouldin(normalizedMatrix, finalLabels, centroids, K, distMetric);
    const clusterSummary = this._buildClusterSummary(normalizedMatrix, finalLabels, centroids, K, featureNames, distMetric);

    onProgress('Selesai', 'Perhitungan K-Means selesai.', 100);

    return {
      data: normalizedMatrix,
      rawRows,
      featureNames,
      K,
      distMetric,
      initMethod,
      normMethod,
      normDescription,
      scalerParams: scaler ? scaler.getParams() : null,
      initLog: log,
      initIndices: indices,
      initCentroids,
      iterations,
      finalCentroids: centroids,
      finalLabels,
      sse,
      silAvg,
      silPerCluster,
      dbIndex,
      clusterSummary,
      converged,
      totalIter: iterations.length,
      colMins,
      colMaxs
    };
  }

  /**
   * Render HTML visualisasi manual step-by-step
   */
  renderHTML(r, container) {
    const fmt = n => {
      if (n === null || n === undefined || isNaN(n)) return '?';
      return parseFloat(parseFloat(n.toFixed(4)).toPrecision(8)).toString();
    };
    const fmtShort = n => {
      if (n === null || n === undefined || isNaN(n)) return '?';
      return parseFloat(n.toFixed(2)).toString();
    };

    const CLUSTER_COLORS = [
      { hex: '#4f9cf9', bg: 'rgba(79,156,249,0.15)',  border: 'rgba(79,156,249,0.4)'  },
      { hex: '#f97316', bg: 'rgba(249,115,22,0.15)',   border: 'rgba(249,115,22,0.4)'  },
      { hex: '#34d399', bg: 'rgba(52,211,153,0.15)',   border: 'rgba(52,211,153,0.4)'  },
      { hex: '#f472b6', bg: 'rgba(244,114,182,0.15)',  border: 'rgba(244,114,182,0.4)' },
      { hex: '#a78bfa', bg: 'rgba(167,139,250,0.15)',  border: 'rgba(167,139,250,0.4)' },
      { hex: '#fbbf24', bg: 'rgba(251,191,36,0.15)',   border: 'rgba(251,191,36,0.4)'  }
    ];

    const getCol = idx => CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
    const badgeHTML = (idx, label) => {
      const col = getCol(idx);
      const lbl = label !== undefined ? label : `Cluster ${idx + 1}`;
      return `<span class="cluster-badge" style="background:${col.bg};border:1px solid ${col.border};color:${col.hex}">
        <span class="cluster-dot" style="background:${col.hex}"></span>${escapeHTML(lbl)}
      </span>`;
    };

    const convText = r.converged
      ? `<span style="color:var(--green)">✓ Konvergen pada iterasi ${r.totalIter}</span>`
      : `<span style="color:var(--yellow)">⚠ Berhenti di iterasi ${r.totalIter} (max)</span>`;

    let html = `
      <!-- Ringkasan Hasil -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:10px;margin-bottom:1.5rem">
        <div class="metric-card"><div class="metric-label">Jumlah Cluster</div><div class="metric-val metric-blue" style="font-size:32px">${r.K}</div></div>
        <div class="metric-card"><div class="metric-label">Total Data</div><div class="metric-val" style="font-size:32px">${r.data.length}</div></div>
        <div class="metric-card"><div class="metric-label">Iterasi</div><div class="metric-val metric-blue" style="font-size:32px">${r.totalIter}</div></div>
        <div class="metric-card"><div class="metric-label">SSE / Inertia</div><div class="metric-val metric-green" style="font-size:24px">${fmtShort(r.sse)}</div></div>
        <div class="metric-card"><div class="metric-label">Davies-Bouldin</div><div class="metric-val metric-blue" style="font-size:24px">${fmt(r.dbIndex)}</div></div>
        <div class="metric-card"><div class="metric-label">Normalisasi</div><div class="metric-val" style="font-size:16px">${escapeHTML(r.normDescription || 'MinMaxScaler [0,1]')}</div></div>
      </div>

      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem;margin-bottom:1.5rem;">
        <div style="font-weight:600;font-size:14px;color:var(--text3);margin-bottom:0.5rem;font-family:var(--mono);">UKURAN TIAP CLUSTER</div>
        ${r.clusterSummary.map((c, ki) => {
          const pct = r.data.length > 0 ? (c.count / r.data.length * 100).toFixed(1) : 0;
          const col = getCol(ki);
          return `
            <div class="sse-bar-wrap" style="display:flex;align-items:center;margin-bottom:6px;font-size:12px">
              <div class="sse-bar-label" style="width:120px;color:${col.hex}">${badgeHTML(ki, `C${ki+1}`)} (${c.count} data)</div>
              <div class="sse-bar-track" style="flex-grow:1;background:var(--bg3);height:10px;border-radius:5px;overflow:hidden;margin:0 10px;">
                <div class="sse-bar-fill" style="width:${pct}%;background:${col.hex};height:100%;"></div>
              </div>
              <div class="sse-bar-val" style="width:40px;text-align:right;">${pct}%</div>
            </div>`;
        }).join('')}
      </div>
    `;

    // PCA Plot SVG
    if (r.featureNames.length >= 2 && r.data.length >= 3) {
      // Centered PCA
      const n = r.data.length;
      const d = r.data[0].length;
      const means = Array.from({length: d}, (_, j) => r.data.reduce((s, row) => s + row[j], 0) / n);
      const centered = r.data.map(row => row.map((v, j) => v - means[j]));
      const cov = Array.from({length: d}, (_, i) =>
        Array.from({length: d}, (_, j) =>
          centered.reduce((s, row) => s + row[i] * row[j], 0) / (n - 1)
        )
      );

      const powerIter = (matrix, dim) => {
        let v = Array.from({length: dim}, () => Math.random() - 0.5);
        let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
        v = v.map(x => x / (norm || 1));
        for (let it = 0; it < 50; it++) {
          const Av = Array.from({length: dim}, (_, i) => matrix[i].reduce((s, m, j) => s + m * v[j], 0));
          norm = Math.sqrt(Av.reduce((s, x) => s + x * x, 0));
          if (norm < 1e-12) break;
          v = Av.map(x => x / norm);
        }
        const eigenval = v.reduce((s, vi, i) => s + vi * matrix[i].reduce((ss, m, j) => ss + m * v[j], 0), 0);
        return { vec: v, val: eigenval };
      };

      const pc1 = powerIter(cov, d);
      const cov2 = cov.map((row, i) => row.map((m, j) => m - pc1.val * pc1.vec[i] * pc1.vec[j]));
      const pc2 = powerIter(cov2, d);

      const proj = centered.map(row => ({
        x: row.reduce((s, v, i) => s + v * pc1.vec[i], 0),
        y: row.reduce((s, v, i) => s + v * pc2.vec[i], 0),
      }));

      const centProj = r.finalCentroids.map(c => {
        const cc = c.map((v, j) => v - means[j]);
        return {
          x: cc.reduce((s, v, i) => s + v * pc1.vec[i], 0),
          y: cc.reduce((s, v, i) => s + v * pc2.vec[i], 0),
        };
      });

      const totalVar = cov.reduce((s, row, i) => s + row[i], 0) || 1;
      const varPC1 = ((Math.abs(pc1.val) / totalVar) * 100).toFixed(1);
      const varPC2 = ((Math.abs(pc2.val) / totalVar) * 100).toFixed(1);

      const W = 600, H = 350, PAD = 40;
      const xs = proj.map(p => p.x).concat(centProj.map(p => p.x));
      const ys = proj.map(p => p.y).concat(centProj.map(p => p.y));
      const xMin = Math.min(...xs), xMax = Math.max(...xs);
      const yMin = Math.min(...ys), yMax = Math.max(...ys);
      const xRange = (xMax - xMin) || 1, yRange = (yMax - yMin) || 1;

      const toSVG = (px, py) => ({
        sx: PAD + ((px - xMin) / xRange) * (W - 2 * PAD),
        sy: (H - PAD) - ((py - yMin) / yRange) * (H - 2 * PAD),
      });

      const circles = proj.map((p, i) => {
        const label = r.finalLabels[i];
        const col = getCol(label);
        const {sx, sy} = toSVG(p.x, p.y);
        return `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4" fill="${col.hex}" fill-opacity="0.8" stroke="#000" stroke-width="0.5"/>`;
      }).join('');

      const starPoints = (cx, cy, r1, r2, numPts) => {
        let pts = '';
        for (let i = 0; i < numPts * 2; i++) {
          const angle = (Math.PI / numPts) * i - Math.PI / 2;
          const radius = i % 2 === 0 ? r1 : r2;
          pts += `${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)} `;
        }
        return pts.trim();
      };

      const centMarkers = centProj.map((p, ki) => {
        const col = getCol(ki);
        const {sx, sy} = toSVG(p.x, p.y);
        const pts = starPoints(sx, sy, 10, 4, 5);
        return `<polygon points="${pts}" fill="${col.hex}" stroke="#fff" stroke-width="1"/>`;
      }).join('');

      html += `
        <div class="section">
          <div class="section-head"><div class="step-circle">&#9678;</div><div class="section-title">Visualisasi PCA 2D</div></div>
          <div class="section-body">
            <div style="background:#0a0d14;padding:10px;border-radius:var(--radius);border:1px solid var(--border);">
              <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
                ${circles}
                ${centMarkers}
              </svg>
            </div>
          </div>
        </div>
      `;
    }

    // Centroid Initialization
    const initCentroidRows = r.initCentroids.map((c, ki) => {
      return `<tr>
        <td>${badgeHTML(ki)}</td>
        <td class="mono">Baris ${r.initIndices[ki]}</td>
        ${c.map(v => `<td class="mono">${fmt(v)}</td>`).join('')}
      </tr>`;
    }).join('');

    html += `
      <div class="section">
        <div class="section-head"><div class="step-circle">1</div><div class="section-title">Inisialisasi Centroid Awal (${escapeHTML(r.normDescription || 'MinMaxScaler [0,1]')})</div></div>
        <div class="section-body">
          <div class="tbl-wrap-scroll">
            <table>
              <thead>
                <tr><th>Cluster</th><th>Indeks Data</th>${r.featureNames.map(f => `<th>${escapeHTML(f)}</th>`).join('')}</tr>
              </thead>
              <tbody>${initCentroidRows}</tbody>
            </table>
          </div>
          <div style="margin-top:6px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:8px;font-size:12px;color:var(--text3)">
            ${r.initLog.map(l => `<div>&bull; ${l}</div>`).join('')}
          </div>
        </div>
      </div>
    `;

    // Iterations Accordion
    const renderIterationDetail = (it) => {
      const totalRows = r.data.length;
      const sampleCount = Math.min(totalRows, 15);
      const isFirst = it.iter === 1;

      const tblHead = `
        <tr>
          <th>#</th>
          ${r.featureNames.map(f => `<th>${escapeHTML(f)}</th>`).join('')}
          ${Array.from({length: r.K}, (_, k) => `<th>d(C${k+1})</th>`).join('')}
          <th>Cluster Terdekat</th>
        </tr>
      `;

      const tblRows = Array.from({length: sampleCount}, (_, ri) => {
        const row = r.data[ri];
        const dists = it.distances[ri];
        const minD = Math.min(...dists);
        const assignedLabel = it.labels[ri];

        return `<tr>
          <td class="mono" style="color:var(--text3)">${ri}</td>
          ${row.map(v => `<td class="mono">${fmt(v)}</td>`).join('')}
          ${dists.map(d => `<td class="mono ${Math.abs(d - minD) < 1e-9 ? 'row-hl' : ''}" style="${Math.abs(d - minD) < 1e-9 ? 'color:var(--green);font-weight:600' : ''}">${fmt(d)}</td>`).join('')}
          <td>${badgeHTML(assignedLabel)}</td>
        </tr>`;
      }).join('');

      const updateRows = Array.from({length: r.K}, (_, ki) => {
        const oldC = it.centroidsOld[ki];
        const newC = it.centroidsNew[ki];
        const changed = !oldC.every((v, i) => Math.abs(v - newC[i]) < 1e-9);
        const membersCount = it.labels.filter(l => l === ki).length;

        return `<tr>
          <td>${badgeHTML(ki)}</td>
          <td class="mono">${membersCount} data</td>
          ${oldC.map(v => `<td class="mono" style="color:var(--text3)">${fmt(v)}</td>`).join('')}
          ${newC.map((v, fi) => {
            const hasDiff = Math.abs(v - oldC[fi]) > 1e-9;
            return `<td class="mono" style="${hasDiff ? 'color:var(--green);font-weight:600' : ''}">${fmt(v)}</td>`;
          }).join('')}
          <td>${changed ? '<span style="color:var(--green);">berubah</span>' : '<span style="color:var(--text3);">tetap</span>'}</td>
        </tr>`;
      }).join('');

      // Jarak data baris ke-0 sebagai contoh formula
      const distDetailExample = this._buildDistDetail(r.data[0], it.centroidsOld[0], r.distMetric, r.featureNames);

      return `
        <div class="iter-block" style="border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;overflow:hidden">
          <div class="section-head" style="background:var(--bg3);cursor:pointer;display:flex;justify-content:space-between;padding:10px 15px;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
            <div style="font-weight:500;font-size:14px;">🔁 Iterasi ke-${it.iter} ${it.converged ? '&rarr; <span style="color:var(--green);">Konvergen!</span>' : ''}</div>
            <span style="font-size:11px;font-family:var(--mono);color:var(--text3)">klik untuk detail</span>
          </div>
          <div style="display:${isFirst ? 'block' : 'none'};padding:15px;background:var(--bg2);">
            
            <div class="sub-title">1. Jarak ke Centroid (Sampel 15 Baris Pertama)</div>
            <div class="tbl-wrap-scroll" style="margin-bottom:8px;">
              <table>
                <thead>${tblHead}</thead>
                <tbody>${tblRows}</tbody>
              </table>
            </div>
            <div style="font-size:12px;color:var(--text3);margin-bottom:12px;">
              Contoh Jarak Baris 0 ke C1:
              <div class="formula" style="margin:4px 0 0;">${distDetailExample.formula}</div>
            </div>

            <div class="sub-title" style="margin-top:12px;">2. Update Centroid Baru (Rata-rata Koordinat)</div>
            <div class="tbl-wrap-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Cluster</th>
                    <th>Anggota</th>
                    ${r.featureNames.map(f => `<th style="color:var(--text3)">Lama: ${escapeHTML(f)}</th>`).join('')}
                    ${r.featureNames.map(f => `<th style="color:var(--green)">Baru: ${escapeHTML(f)}</th>`).join('')}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>${updateRows}</tbody>
              </table>
            </div>

          </div>
        </div>
      `;
    };

    html += `
      <div class="section">
        <div class="section-head"><div class="step-circle">2</div><div class="section-title">Langkah Iterasi Perhitungan</div></div>
        <div class="section-body">
          ${r.iterations.map(renderIterationDetail).join('')}
        </div>
      </div>
    `;

    // Final Clustering & Centroid Stats
    const finalClusterTiles = r.clusterSummary.map(c => {
      const col = getCol(c.clusterIdx);
      return `
        <div style="background:var(--bg2);border:1px solid var(--border);border-left:4px solid ${col.hex};border-radius:var(--radius-lg);padding:12px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            ${badgeHTML(c.clusterIdx)}
            <span style="font-size:13px;font-weight:600;color:var(--text2);">${c.count} anggota</span>
          </div>
          <div style="font-size:12px;color:var(--text3);margin-bottom:6px;font-family:var(--mono);">
            Centroid Akhir: [${c.centroid.map(v => fmt(v)).join(', ')}]
          </div>
          <div class="tbl-wrap">
            <table>
              <thead><tr><th>Fitur</th><th>Mean (Norm)</th><th>Min (Norm)</th><th>Max (Norm)</th></tr></thead>
              <tbody>
                ${c.stats.map(s => `
                  <tr>
                    <td><strong>${escapeHTML(s.feature)}</strong></td>
                    <td class="mono">${fmt(s.mean)}</td>
                    <td class="mono">${fmt(s.min)}</td>
                    <td class="mono">${fmt(s.max)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');

    html += `
      <div class="section">
        <div class="section-head"><div class="step-circle">3</div><div class="section-title">Statistik Cluster Akhir</div></div>
        <div class="section-body">
          ${finalClusterTiles}
        </div>
      </div>
    `;

    // Final Data Assignment Table (first 50)
    const finalTableRows = r.rawRows.slice(0, 100).map((row, ri) => {
      const label = r.finalLabels[ri];
      return `<tr>
        <td class="mono" style="color:var(--text3)">${ri + 1}</td>
        ${r.featureNames.map(f => `<td>${escapeHTML(row[f])}</td>`).join('')}
        <td>C${label + 1}</td>
        <td>${badgeHTML(label)}</td>
      </tr>`;
    }).join('');

    html += `
      <div class="section">
        <div class="section-head"><div class="step-circle">4</div><div class="section-title">Tabel Hasil Akhir Penugasan Cluster (100 Baris Pertama)</div></div>
        <div class="section-body">
          <div class="tbl-wrap-scroll" style="max-height:400px;">
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  ${r.featureNames.map(f => `<th>${escapeHTML(f)}</th>`).join('')}
                  <th>Cluster ID</th>
                  <th>Cluster Badge</th>
                </tr>
              </thead>
              <tbody>${finalTableRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  /**
   * Ekspor data K-Means ke Excel
   */
  exportExcel(r, mode) {
    const fm = (mode === 'formula');
    const nData = r.rawRows.length;
    const nF = r.featureNames.length;
    const isEuc = r.distMetric !== 'manhattan';

    const normMethod = r.normMethod || 'minmax';

    const S1_ROW_DATA = 2;
    const S1_ROW_END = S1_ROW_DATA + nData - 1;
    const S1_ROW_PARAM1 = S1_ROW_END + 2; // Min or Mean row
    const S1_ROW_PARAM2 = S1_ROW_PARAM1 + 1; // Max or Std row
    const S1_COL_RAW = 1;
    const S1_COL_NORM = 1 + nF;

    const WB = newWB();

    // 1. Sheet Dataset
    const s1 = [];
    s1.push(['No', ...r.featureNames.map(f => `${f} (Asli)`), ...r.featureNames.map(f => `${f} (Norm)`)');

    r.rawRows.forEach((row, ri) => {
      const excelRow = S1_ROW_DATA + ri;
      const rawVals = r.featureNames.map(f => parseFloat(row[f]) || 0);
      const normVals = r.featureNames.map((feat, fi) => {
        if (fm && normMethod === 'minmax') {
          const rawCol = col2l(S1_COL_RAW + fi);
          const minCell = `$${rawCol}$${S1_ROW_PARAM1}`;
          const maxCell = `$${rawCol}$${S1_ROW_PARAM2}`;
          return fc(`IF(${maxCell}-${minCell}=0,0,(${rawCol}${excelRow}-${minCell})/(${maxCell}-${minCell}))`);
        } else if (fm && normMethod === 'standard') {
          const rawCol = col2l(S1_COL_RAW + fi);
          const meanCell = `$${rawCol}$${S1_ROW_PARAM1}`;
          const stdCell = `$${rawCol}$${S1_ROW_PARAM2}`;
          return fc(`IF(${stdCell}=0,0,(${rawCol}${excelRow}-${meanCell})/${stdCell})`);
        } else {
          return nc(r.data[ri][fi]);
        }
      });
      s1.push([ri + 1, ...rawVals, ...normVals]);
    });

    s1.push([]);
    if (normMethod === 'standard') {
      // Row Mean
      s1.push([
        'Mean',
        ...r.featureNames.map((_, fi) => {
          if (fm) {
            const c = col2l(S1_COL_RAW + fi);
            return fc(`AVERAGE(${c}${S1_ROW_DATA}:${c}${S1_ROW_END})`);
          }
          return nc(r.scalerParams ? r.scalerParams.means[fi] : 0);
        }),
        ...r.featureNames.map(() => 0)
      ]);
      // Row Std Dev
      s1.push([
        'Std Dev',
        ...r.featureNames.map((_, fi) => {
          if (fm) {
            const c = col2l(S1_COL_RAW + fi);
            const meanCell = `$${c}$${S1_ROW_PARAM1}`;
            return fc(`SQRT(AVERAGE((${c}${S1_ROW_DATA}:${c}${S1_ROW_END}-${meanCell})^2))`);
          }
          return nc(r.scalerParams ? r.scalerParams.stds[fi] : 1);
        }),
        ...r.featureNames.map(() => 1)
      ]);
    } else {
      // Row Min (for minmax or none)
      s1.push([
        'Min',
        ...r.featureNames.map((_, fi) => {
          if (fm) {
            const c = col2l(S1_COL_RAW + fi);
            return fc(`MIN(${c}${S1_ROW_DATA}:${c}${S1_ROW_END})`);
          }
          return nc(r.colMins[fi]);
        }),
        ...r.featureNames.map(() => 0)
      ]);
      // Row Max
      s1.push([
        'Max',
        ...r.featureNames.map((_, fi) => {
          if (fm) {
            const c = col2l(S1_COL_RAW + fi);
            return fc(`MAX(${c}${S1_ROW_DATA}:${c}${S1_ROW_END})`);
          }
          return nc(r.colMaxs[fi]);
        }),
        ...r.featureNames.map(() => 1)
      ]);
    }

    const ws1 = aoaToWS(s1);
    addWS(WB, ws1, 'Dataset');

    // 2. Sheet Perhitungan
    const s2 = [];
    r.iterations.forEach(it => {
      s2.push([`ITERASI ${it.iter}`]);
      it.centroidsOld.forEach((c, ki) => {
        s2.push([`C${ki + 1} = [${c.map(v => n8(v)).join(', ')}]`]);
      });
      s2.push([]);

      const S2_COL_F = 1;
      const S2_COL_JRK = 1 + nF;
      const S2_COL_CLS = 1 + nF + r.K;

      s2.push(['No', ...r.featureNames, ...Array.from({length: r.K}, (_, ki) => `Jarak ke C${ki+1}`), 'Cluster']);
      
      const dataStartRow = s2.length + 1;
      r.data.forEach((row, ri) => {
        const excelRow = dataStartRow + ri;
        const featVals = row.map(v => n8(v));
        const jrkVals = it.centroidsOld.map((c, ki) => {
          if (fm) {
            const terms = r.featureNames.map((_, fi) => {
              const fCol = col2l(S2_COL_F + fi);
              const cv = n8(c[fi]);
              return isEuc ? `(${fCol}${excelRow}-${cv})^2` : `ABS(${fCol}${excelRow}-${cv})`;
            });
            return fc(isEuc ? `SQRT(${terms.join('+')})` : `${terms.join('+')}`);
          } else {
            return nc(it.distances[ri][ki]);
          }
        });

        let clsVal = `Cluster ${it.labels[ri] + 1}`;
        if (fm) {
          const minFormula = `MIN(${Array.from({length: r.K}, (_, ki) => col2l(S2_COL_JRK + ki) + excelRow).join(',')})`;
          let nested = `"Cluster ${r.K}"`;
          for (let ki = r.K - 2; ki >= 0; ki--) {
            const jrkCell = col2l(S2_COL_JRK + ki) + excelRow;
            nested = `IF(${jrkCell}=${minFormula},"Cluster ${ki+1}",${nested})`;
          }
          clsVal = fc(nested);
        }
        s2.push([ri + 1, ...featVals, ...jrkVals, clsVal]);
      });

      s2.push([]);
      s2.push(['Centroid Update:']);
      it.centroidsNew.forEach((c, ki) => {
        const changed = !it.centroidsOld[ki].every((v, idx) => Math.abs(v - c[idx]) < 1e-9);
        const newVals = c.map((v, fi) => {
          if (fm) {
            const fCol = col2l(S2_COL_F + fi);
            const clsColLetter = col2l(S2_COL_CLS);
            const clsRange = `${clsColLetter}${dataStartRow}:${clsColLetter}${dataStartRow + nData - 1}`;
            const fRange = `${fCol}${dataStartRow}:${fCol}${dataStartRow + nData - 1}`;
            const fallback = n8(it.centroidsOld[ki][fi]);
            return fc(`IFERROR(AVERAGEIF(${clsRange},"Cluster ${ki+1}",${fRange}),${fallback})`);
          } else {
            return nc(v);
          }
        });
        s2.push([`C${ki+1} baru`, ...newVals, ...Array(r.K).fill(''), changed ? 'berubah' : 'tetap']);
      });

      s2.push([]);
      s2.push([]);
    });

    const ws2 = aoaToWS(s2);
    addWS(WB, ws2, 'Perhitungan');

    // 3. Sheet Hasil Clustering
    const s3 = [];
    s3.push(['No', ...r.featureNames.map(f => `${f} (Norm)`), 'Cluster', ...r.featureNames.map(f => `Centroid_${f}`)]);
    r.data.forEach((row, ri) => {
      const label = r.finalLabels[ri];
      const centroid = r.finalCentroids[label];
      s3.push([ri + 1, ...row.map(v => n8(v)), `Cluster ${label + 1}`, ...centroid.map(v => n8(v))]);
    });

    s3.push([]);
    s3.push(['RINGKASAN PER CLUSTER']);
    s3.push(['Cluster', ...r.featureNames.map(f => `Mean_${f}`), ...r.featureNames.map(f => `Min_${f}`), ...r.featureNames.map(f => `Max_${f}`), 'Jumlah Data', 'SSE']);

    const S3_ROW_DATA = 2;
    const S3_ROW_END = S3_ROW_DATA + nData - 1;
    const S3_COL_CLS = 1 + nF;
    const clsColS3 = col2l(S3_COL_CLS);
    const clsRangeS3 = `${clsColS3}${S3_ROW_DATA}:${clsColS3}${S3_ROW_END}`;

    r.clusterSummary.forEach((c, ki) => {
      const clsLabel = `Cluster ${c.clusterIdx + 1}`;

      const meanVals = r.featureNames.map((_, fi) => {
        if (fm) {
          const fCol = col2l(1 + fi);
          return fc(`IFERROR(AVERAGEIF(${clsRangeS3},"${clsLabel}",${fCol}${S3_ROW_DATA}:${fCol}${S3_ROW_END}),0)`);
        }
        return nc(c.stats[fi].mean);
      });

      const minVals = r.featureNames.map((_, fi) => {
        if (fm) {
          const fCol = col2l(1 + fi);
          return fc(`IFERROR(MINIFS(${fCol}${S3_ROW_DATA}:${fCol}${S3_ROW_END},${clsRangeS3},"${clsLabel}"),0)`);
        }
        return nc(c.stats[fi].min);
      });

      const maxVals = r.featureNames.map((_, fi) => {
        if (fm) {
          const fCol = col2l(1 + fi);
          return fc(`IFERROR(MAXIFS(${fCol}${S3_ROW_DATA}:${fCol}${S3_ROW_END},${clsRangeS3},"${clsLabel}"),0)`);
        }
        return nc(c.stats[fi].max);
      });

      const countVal = fm ? fc(`COUNTIF(${clsRangeS3},"${clsLabel}")`) : c.count;
      
      let sseVal;
      if (fm) {
        const cond = `(${clsRangeS3}="${clsLabel}")`;
        const squaredTerms = r.featureNames.map((_, fi) => {
          const fCol = col2l(1 + fi);
          const cv = n8(c.centroid[fi]);
          return `(${fCol}${S3_ROW_DATA}:${fCol}${S3_ROW_END}-${cv})^2`;
        });
        sseVal = fc(`SUMPRODUCT(${cond}*(${squaredTerms.join('+')}))`);
      } else {
        sseVal = nc(c.sse);
      }

      s3.push([clsLabel, ...meanVals, ...minVals, ...maxVals, countVal, sseVal]);
    });

    const ws3 = aoaToWS(s3);
    addWS(WB, ws3, 'Hasil_Clustering');

    // 4. Sheet Evaluasi
    const s4 = [];
    s4.push(['EVALUASI METRIK K-MEANS']);
    s4.push([]);
    s4.push(['SSE Total', nc(r.sse)]);
    s4.push(['Silhouette Score Avg', r.silAvg !== null ? nc(r.silAvg) : '-']);
    s4.push(['Davies-Bouldin Index', r.dbIndex !== null ? nc(r.dbIndex) : '-']);
    
    const ws4 = aoaToWS(s4);
    addWS(WB, ws4, 'Evaluasi_Metrik');

    return WB;
  }
}

// Registrasi plugin ke registry
if (typeof registry !== 'undefined') {
  registry.register(new KMeansPlugin());
}
