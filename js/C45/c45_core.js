/* ============================================================
   c45_core.js  —  Algoritma C4.5: membangun pohon keputusan
                   dengan logging setiap langkah perhitungan

   CHANGELOG v2 (Worker Integration):
   [W-1] processC45() sekarang mendelegasikan komputasi berat ke
         c45_worker.js via Web Worker agar main thread tidak
         pernah terblokir, bahkan untuk dataset 50k+ baris.
   [W-2] _worker singleton — worker lama di-terminate sebelum
         run baru dimulai untuk menghindari race condition.
   [W-3] Loading overlay + progress bar ditampilkan selama Worker
         berjalan; disembunyikan otomatis saat DONE / ERROR.
   [W-4] Sampling DIMATIKAN — worker sudah berjalan di background
         thread sehingga data penuh (50k+ baris) tetap diproses
         tanpa membekukan UI. doSample selalu false.
   [W-5] _buildNode, _predict, _getMajorityFromChildren tetap ada
         di main thread khusus untuk public predict(row) yang
         dipanggil c45_export.js setelah tree sudah tersedia.
   [W-6] Semua getter publik tidak berubah — c45_render.js,
         c45_export.js tidak perlu dimodifikasi.
   ============================================================ */

const C45_Core = (() => {

  /* ============================================================
     CONFIG STATE
     ============================================================ */
  let criterion    = 'gain_ratio'; // 'gain_ratio' | 'info_gain'
  let maxDepth     = 5;
  let minSamples   = 2;
  let numThreshold = 'midpoint';

  // Hasil build — di-reset setiap processC45()
  let tree       = null;
  let steps      = [];
  let headers    = [];
  let colTypes   = [];
  let classCol   = -1;
  let featCols   = [];
  let allClasses = [];
  let cm         = null;
  let acc        = null;
  // [NEW-3] Hasil evaluasi test set (null jika splitMode = 'none')
  let accTest   = null;
  let cmTest    = null;
  let trainRows = [];
  let testRows  = [];

  // [W-2] Singleton worker — satu instance aktif sekaligus
  let _worker = null;

  /* ============================================================
     PUBLIC: selectCriterion
     ============================================================ */
  function selectCriterion(val) {
    criterion = val;
    ['gain_ratio', 'info_gain'].forEach(v => {
      const el = document.getElementById(`crit-opt-${v === 'gain_ratio' ? 'gainratio' : 'infogain'}`);
      if (el) el.classList.toggle('selected', v === val);
    });
  }

  /* ============================================================
     [W-3] LOADING OVERLAY HELPERS
     Overlay dan elemen progress di-inject sekali ke DOM saat
     pertama kali dibutuhkan (_ensureOverlay), lalu diperbarui
     via _showLoading / _hideLoading / _updateProgress.
     ============================================================ */
  function _ensureOverlay() {
    if (document.getElementById('c45-loading-overlay')) return;
    const div = document.createElement('div');
    div.id = 'c45-loading-overlay';
    div.innerHTML = `
      <div style="
        text-align:center;
        background:var(--bg2);
        border:1px solid var(--border);
        border-radius:16px;
        padding:2.5rem 3rem;
        max-width:440px;
        width:90%;
        box-shadow:0 8px 40px rgba(0,0,0,0.6);
        animation:fadeIn .25s ease both;
      ">
        <div style="font-size:48px;margin-bottom:0.75rem">⚙️</div>
        <div style="font-size:22px;font-weight:600;color:var(--text);margin-bottom:0.35rem">
          Membangun Pohon C4.5…
        </div>
        <div id="c45-prog-step"
          style="font-size:17px;color:var(--accent);font-family:var(--mono);
                 margin-bottom:0.25rem;min-height:1.4em">
        </div>
        <div id="c45-prog-msg"
          style="font-size:15px;color:var(--text3);font-family:var(--mono);
                 margin-bottom:1rem;min-height:1.4em;word-break:break-all">
        </div>
        <div style="width:100%;height:8px;background:var(--bg3);border-radius:4px;overflow:hidden">
          <div id="c45-prog-bar"
            style="height:100%;width:0%;background:var(--accent);
                   border-radius:4px;transition:width .2s ease">
          </div>
        </div>
        <div style="margin-top:1.25rem">
          <button
            id="c45-cancel-btn"
            onclick="C45_Core._cancelWorker()"
            style="
              background:transparent;border:1px solid var(--border2);
              border-radius:6px;color:var(--text3);font-size:16px;
              padding:5px 16px;cursor:pointer;font-family:var(--sans);
              transition:color .15s,border-color .15s;
            "
            onmouseover="this.style.color='var(--red)';this.style.borderColor='var(--red)'"
            onmouseout="this.style.color='var(--text3)';this.style.borderColor='var(--border2)'"
          >✕ Batalkan</button>
        </div>
      </div>
    `;
    Object.assign(div.style, {
      display:        'none',
      position:       'fixed',
      inset:          '0',
      background:     'rgba(15,17,23,0.82)',
      zIndex:         '9999',
      alignItems:     'center',
      justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    });
    document.body.appendChild(div);
  }

  function _showLoading() {
    _ensureOverlay();
    const el = document.getElementById('c45-loading-overlay');
    if (el) el.style.display = 'flex';
  }

  function _hideLoading() {
    const el = document.getElementById('c45-loading-overlay');
    if (el) el.style.display = 'none';
  }

  function _updateProgress(step, message, pct) {
    const s = document.getElementById('c45-prog-step');
    const m = document.getElementById('c45-prog-msg');
    const b = document.getElementById('c45-prog-bar');
    if (s) s.textContent = step    || '';
    if (m) m.textContent = message || '';
    if (b) b.style.width = (pct   || 0) + '%';
  }

  /* ============================================================
     PUBLIC: _cancelWorker
     Dipanggil oleh tombol "Batalkan" di overlay.
     ============================================================ */
  function _cancelWorker() {
    if (_worker) {
      _worker.terminate();
      _worker = null;
    }
    _hideLoading();
  }

  /* ============================================================
     [W-1] PUBLIC: processC45
     Semua komputasi berat didelegasikan ke c45_worker.js.
     Main thread hanya mengelola state, UI, dan overlay.
     ============================================================ */
  function processC45() {
    const state = C45_IO.getState();
    if (state.classCol === -1 || state.featCols.length === 0) {
      alert('Pilih kolom kelas dan minimal 1 fitur terlebih dahulu.');
      return;
    }

    // [FIX-1] Reset SEMUA state sebelum build agar tidak ada nilai stale
    tree       = null;
    steps      = [];
    cm         = null;
    acc        = null;
    accTest    = null;
    cmTest     = null;
    trainRows  = [];
    testRows   = [];
    allClasses = [];

    // Simpan config ke module-level state (dipakai predict() & getter)
    headers      = state.headers;
    colTypes     = state.colTypes;
    classCol     = state.classCol;
    featCols     = state.featCols;
    maxDepth     = parseInt(document.getElementById('max-depth-slider').value);
    minSamples   = parseInt(document.getElementById('min-samples-slider').value);
    numThreshold = document.querySelector('input[name="num-threshold"]:checked')?.value || 'midpoint';

    const splitMode = state.splitMode || 'none';
    const totalRows = (state.cleanRows || []).length;

    // [W-3] Tampilkan overlay sebelum spawn Worker
    _showLoading();
    _updateProgress('Persiapan', `Memuat ${totalRows.toLocaleString('id')} baris…`, 1);

    // [W-2] Terminate worker sebelumnya jika masih aktif
    if (_worker) {
      _worker.terminate();
      _worker = null;
    }

    // Resolusi path worker: ikuti konvensi folder project
    // (c45.html ada di folder yang sama dengan c45_core.js saat dev,
    //  atau di sub-folder di production — sesuaikan jika perlu)
    const workerPath = (() => {
      // Coba deteksi path dari script tag c45_core.js yang sudah di-load
      const scripts = document.querySelectorAll('script[src]');
      for (const s of scripts) {
        if (s.src.includes('c45_core')) {
          return s.src.replace('c45_core.js', 'c45_worker.js');
        }
      }
      // Fallback relatif terhadap halaman saat ini
      return 'c45_worker.js';
    })();

    try {
      _worker = new Worker(workerPath);
    } catch (err) {
      _hideLoading();
      alert(
        'Gagal membuat Web Worker.\n\n' +
        'Pastikan file c45_worker.js berada di folder yang sama dengan c45_core.js.\n' +
        'Error: ' + err.message
      );
      return;
    }

    /* ---- Handler pesan dari Worker ---- */
    _worker.onmessage = function (e) {
      const { type, result, step, message, pct } = e.data;

      if (type === 'PROGRESS') {
        _updateProgress(step, message, pct);
        return;
      }

      if (type === 'ERROR') {
        _hideLoading();
        _worker = null;
        alert('Error saat membangun pohon:\n' + message);
        return;
      }

      if (type === 'DONE') {
        // Simpan semua hasil ke module-level state
        tree       = result.tree;
        steps      = result.steps;
        allClasses = result.allClasses;
        trainRows  = result.trainRows;
        testRows   = result.testRows;
        acc        = result.acc;
        cm         = result.cm;
        accTest    = result.accTest  || null;
        cmTest     = result.cmTest   || null;

        _hideLoading();
        _worker.terminate();
        _worker = null;

        // Tampilkan halaman hasil
        document.getElementById('page-input').style.display  = 'none';
        document.getElementById('page-result').style.display = 'block';

        C45_Render.renderResult({
          tree, steps, headers, colTypes, classCol, featCols,
          allClasses,
          rows:     trainRows,
          acc,      cm,
          criterion,
          accTest,  cmTest,
          testRows, splitMode,
          // [FIX-6] isOverfit hanya flag jika tidak ada test set
          isOverfit: acc === 1.0 && splitMode === 'none',
          isSampled: result.isSampled || false,
          totalRows
        });
      }
    };

    /* ---- Handler error fatal Worker (syntax error, file not found, dll) ---- */
    _worker.onerror = function (err) {
      _hideLoading();
      _worker = null;
      alert(
        'Web Worker error:\n' + (err.message || String(err)) +
        '\n\nPastikan file c45_worker.js dapat diakses.'
      );
    };

    /* ---- Kirim payload ke Worker ---- */
    // cleanRows sudah diimputasi oleh c45_io.js — worker tidak perlu imputasi ulang
    // tetapi tetap menerima mvStrategy sebagai metadata.
    _worker.postMessage({
      type: 'RUN',
      payload: {
        rawRows:    state.cleanRows,
        headers:    state.headers,
        colTypes:   state.colTypes,
        classCol:   state.classCol,
        featCols:   state.featCols,
        maxDepth,
        minSamples,
        numThreshold,
        criterion,
        splitMode,
        testRatio:  state.testRatio  || 0.2,
        splitSeed:  state.splitSeed  || 42,
        mvStrategy: state.mvStrategy || 'mode',
        // Sampling dimatikan — worker memproses data penuh
        doSample:   false,
        sampleSize: null
      }
    });
  }

  /* ============================================================
     INTERNAL: Build tree node recursively
     Dipertahankan di main thread HANYA untuk keperluan
     public predict(row) yang dipanggil c45_export.js.
     Tidak dijalankan selama processC45() — Worker yang menangani.
     ============================================================ */
  function _buildNode(rows, availFeat, depth, nodeName, parentRows) {
    const labels = rows.map(r => r[classCol]);
    const stepId = steps.length;

    // ---- Base cases ----
    if (
      rows.length <= minSamples ||
      C45_Utils.isPure(labels)  ||
      availFeat.length === 0    ||
      depth >= maxDepth
    ) {
      const leafClass   = C45_Utils.majorityClass(labels);
      const leafEntropy = C45_Utils.entropyFromLabels(labels);
      const freq        = C45_Utils.classFreq(labels);
      const node = {
        type: 'leaf', label: leafClass, freq,
        entropy: leafEntropy, n: rows.length, depth, nodeName, stepId
      };
      steps.push({
        type: 'leaf', node, rows, labels, depth, nodeName,
        reason: _leafReason(rows, labels, availFeat, depth)
      });
      return node;
    }

    // ---- Hitung gain untuk setiap fitur ----
    const gains = [];
    for (const fi of availFeat) {
      const isNum = colTypes[fi] === 'num';
      let res;
      if (isNum) {
        // [FIX-7] Pass criterion agar threshold numerik dipilih sesuai kriteria aktif
        res = C45_Utils.infoGainNum(rows, fi, classCol, numThreshold, criterion);
        gains.push({ fi, isNum: true,  ...res, colName: headers[fi] });
      } else {
        res = C45_Utils.infoGainCat(rows, fi, classCol);
        gains.push({ fi, isNum: false, ...res, threshold: null, colName: headers[fi] });
      }
    }

    // [FIX-5] Gain Ratio pre-filter à la Quinlan 1993
    const avgGain = gains.reduce((s, g) => s + g.gain, 0) / gains.length;
    const score = g => {
      if (criterion !== 'gain_ratio') return g.gain;
      return g.gain >= avgGain ? g.gainRatio : -Infinity;
    };

    // [FIX-3] Tie-breaking deterministik alfabetis
    const best = gains.reduce((a, b) => {
      const sa = score(a), sb = score(b);
      if (Math.abs(sa - sb) < 1e-10) {
        return a.colName <= b.colName ? a : b;
      }
      return sa > sb ? a : b;
    });

    const parentH = C45_Utils.entropyFromLabels(labels);
    const node = {
      type: 'split', attr: best.fi, attrName: headers[best.fi],
      isNum: best.isNum, threshold: best.threshold,
      gain: best.gain, gainRatio: best.gainRatio, splitInfo: best.splitInfo,
      parentEntropy: parentH, n: rows.length, depth, nodeName, stepId,
      children: {}
    };

    steps.push({
      type: 'split', node, rows, labels, depth, nodeName,
      gains, best, parentH, avgGain
    });

    // ---- Rekursi ke anak ----
    const nextFeat = best.isNum
      ? availFeat
      : availFeat.filter(f => f !== best.fi);

    if (best.isNum) {
      const leftRows  = rows.filter(r => parseFloat(r[best.fi]) <= best.threshold);
      const rightRows = rows.filter(r => parseFloat(r[best.fi]) >  best.threshold);
      const leftName  = `≤${C45_Utils.fmt(best.threshold)}`;
      const rightName = `>${C45_Utils.fmt(best.threshold)}`;
      node.children[leftName]  = _buildNode(leftRows,  nextFeat, depth + 1, leftName,  rows);
      node.children[rightName] = _buildNode(rightRows, nextFeat, depth + 1, rightName, rows);
    } else {
      const vals = [...new Set(rows.map(r => r[best.fi]))].sort();
      for (const val of vals) {
        const subset = rows.filter(r => r[best.fi] === val);
        if (subset.length === 0) continue;
        node.children[val] = _buildNode(subset, nextFeat, depth + 1, val, rows);
      }
    }

    // [FIX-4] Guard: tidak ada cabang valid → fallback leaf
    if (Object.keys(node.children).length === 0) {
      const leafFallback = {
        type: 'leaf',
        label: C45_Utils.majorityClass(labels),
        freq:  C45_Utils.classFreq(labels),
        entropy: C45_Utils.entropyFromLabels(labels),
        n: rows.length, depth, nodeName, stepId
      };
      steps[steps.length - 1] = {
        type: 'leaf', node: leafFallback, rows, labels, depth, nodeName,
        reason: 'children kosong (fallback)'
      };
      return leafFallback;
    }

    return node;
  }

  /* ============================================================
     INTERNAL: Alasan daun
     ============================================================ */
  function _leafReason(rows, labels, availFeat, depth) {
    if (C45_Utils.isPure(labels))    return 'murni';
    if (rows.length <= minSamples)   return `sampel ≤ ${minSamples}`;
    if (availFeat.length === 0)      return 'fitur habis';
    if (depth >= maxDepth)           return `kedalaman maks (${maxDepth})`;
    return 'daun';
  }

  /* ============================================================
     INTERNAL: Prediksi satu baris
     ============================================================ */
  function _predict(node, row) {
    if (node.type === 'leaf') return node.label;

    const val = row[node.attr];

    if (node.isNum) {
      const branch = parseFloat(val) <= node.threshold
        ? `≤${C45_Utils.fmt(node.threshold)}`
        : `>${C45_Utils.fmt(node.threshold)}`;
      const child = node.children[branch];
      // [FIX-2] Fallback ke majority class dari seluruh subtree
      return child ? _predict(child, row) : _getMajorityFromChildren(node);
    }

    const child = node.children[val];
    // [FIX-2] Fallback majority dari subtree jika nilai kategorik tidak dikenal
    return child ? _predict(child, row) : _getMajorityFromChildren(node);
  }

  /* ============================================================
     INTERNAL: Ambil kelas mayoritas dari seluruh subtree sebuah node
     Digunakan sebagai fallback _predict saat cabang tidak ditemukan.
     ============================================================ */
  function _getMajorityFromChildren(node) {
    const labels = [];
    function collect(n) {
      if (n.type === 'leaf') {
        for (let i = 0; i < n.n; i++) labels.push(n.label);
        return;
      }
      Object.values(n.children).forEach(collect);
    }
    collect(node);
    return labels.length > 0
      ? C45_Utils.majorityClass(labels)
      : (node.label || '?');
  }

  /* ============================================================
     PUBLIC: getters (untuk render & export)
     Tidak ada perubahan — c45_render.js & c45_export.js tetap kompatibel.
     ============================================================ */
  function getTree()      { return tree;       }
  function getSteps()     { return steps;      }
  function getAllClasses() { return allClasses; }
  function getCM()        { return cm;         }
  function getAcc()       { return acc;        }

  // [NEW-1] Expose criterion aktif saat build terakhir
  function getCriterion() { return criterion; }

  // [NEW-2] Expose _predict sebagai public function
  // tree harus sudah ada (setelah processC45()); jika belum, return null
  function predict(row) {
    if (!tree) return null;
    return _predict(tree, row);
  }

  // [NEW-3] Getters untuk hasil evaluasi test set dan split rows
  function getAccTest()   { return accTest;   }
  function getCMTest()    { return cmTest;     }
  function getTrainRows() { return trainRows;  }
  function getTestRows()  { return testRows;   }

  return {
    selectCriterion, processC45,
    getTree, getSteps, getAllClasses, getCM, getAcc,
    getCriterion, predict,                           // [NEW-1] [NEW-2]
    getAccTest, getCMTest, getTrainRows, getTestRows, // [NEW-3]
    _cancelWorker                                    // [W-2] untuk tombol Batalkan di overlay
  };
})();