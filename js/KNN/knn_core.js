/* ============================================================
   knn_core.js — Spawn Web Worker, handle progress & hasil
   Komputasi berat ada di knn_worker.js (background thread)
   UI tetap responsif selama proses berlangsung
   ============================================================ */

let knnResult = null;
let _knnWorker = null;  // instance worker aktif

function processKNN() {
  if (rawRows.length === 0) return alert('Upload dataset terlebih dahulu.');

  const featureCols = getSelectedFeatureCols();
  if (featureCols.length === 0) return alert('Pilih minimal 1 kolom fitur.');

  const numericCols = detectNumeric(rawRows, featureCols);
  if (numericCols.length === 0) return alert('KNN membutuhkan minimal 1 fitur numerik.');

  // Baca config dari UI
  const k         = parseInt(document.getElementById('k-value').value);
  const metric    = document.getElementById('distance-metric').value;
  const p         = parseFloat(document.getElementById('minkowski-p').value || 3);
  const weighting = document.querySelector('input[name="weighting"]:checked').value;
  const normType  = document.querySelector('input[name="norm"]:checked').value;
  const testRatio = 1 - (parseInt(document.getElementById('split-slider').value) / 100);
  const seed      = 42;

  // Tampilkan loading overlay
  showLoadingOverlay('Mempersiapkan data...');

  // Terminate worker lama jika masih berjalan
  if (_knnWorker) { _knnWorker.terminate(); _knnWorker = null; }

  // Buat worker baru
  // Path relatif dari knn.html → js/KNN/knn_worker.js
  _knnWorker = new Worker('../js/KNN/knn_worker.js');

  // ---- Terima pesan dari worker ----
  _knnWorker.onmessage = function (e) {
    const msg = e.data;

    if (msg.type === 'PROGRESS') {
      updateLoadingOverlay(msg.message, msg.pct);
      return;
    }

    if (msg.type === 'DONE') {
      _knnWorker.terminate();
      _knnWorker = null;

      knnResult = msg.result;

      hideLoadingOverlay();
      showResultPage();
      renderKNN(knnResult);
      return;
    }

    if (msg.type === 'ERROR') {
      _knnWorker.terminate();
      _knnWorker = null;
      hideLoadingOverlay();
      alert('Error: ' + msg.message);
    }
  };

  // ---- Error tak terduga dari worker ----
  _knnWorker.onerror = function (err) {
    _knnWorker = null;
    hideLoadingOverlay();
    alert('Worker error: ' + (err.message || 'Unknown error'));
  };

  // ---- Kirim data ke worker ----
  _knnWorker.postMessage({
    type: 'RUN',
    payload: {
      rawRows,
      classCol,
      featureCols,
      k, metric, p, weighting, normType, testRatio, seed
    }
  });
}

/* ============================================================
   LOADING OVERLAY — UI feedback selama worker berjalan
   ============================================================ */

function showLoadingOverlay(message) {
  // Buat overlay jika belum ada
  let overlay = document.getElementById('knn-loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'knn-loading-overlay';
    overlay.innerHTML = `
      <div class="knn-loading-box">
        <div class="knn-loading-spinner"></div>
        <div class="knn-loading-title">Memproses K-NN</div>
        <div class="knn-loading-msg" id="knn-loading-msg">Mempersiapkan data...</div>
        <div class="knn-loading-bar-wrap">
          <div class="knn-loading-bar-track">
            <div class="knn-loading-bar-fill" id="knn-loading-bar-fill" style="width:0%"></div>
          </div>
          <div class="knn-loading-pct" id="knn-loading-pct">0%</div>
        </div>
        <div class="knn-loading-hint">UI tetap responsif — komputasi berjalan di background thread</div>
        <button class="btn btn-sm" onclick="cancelKNN()" style="margin-top:1rem;color:var(--red);border-color:var(--red)">
          ✕ Batalkan
        </button>
      </div>
    `;
    // Tambah style inline agar tidak bergantung pada file CSS
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(15,17,23,0.92);
      display:flex;align-items:center;justify-content:center;
      z-index:9999;backdrop-filter:blur(4px);
    `;
    document.body.appendChild(overlay);
  }

  // Inject style loading box jika belum ada
  if (!document.getElementById('knn-loading-style')) {
    const style = document.createElement('style');
    style.id = 'knn-loading-style';
    style.textContent = `
      .knn-loading-box {
        background: var(--bg2);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 2rem 2.5rem;
        text-align: center;
        min-width: 320px;
        max-width: 420px;
        width: 90%;
        box-shadow: 0 24px 64px rgba(0,0,0,0.6);
      }
      .knn-loading-spinner {
        width: 48px; height: 48px;
        border: 3px solid var(--border2);
        border-top-color: var(--accent);
        border-radius: 50%;
        margin: 0 auto 1.25rem;
        animation: knn-spin 0.8s linear infinite;
      }
      @keyframes knn-spin { to { transform: rotate(360deg); } }
      .knn-loading-title {
        font-size: 18px; font-weight: 600; color: var(--text);
        margin-bottom: 0.4rem;
      }
      .knn-loading-msg {
        font-size: 13px; color: var(--accent);
        font-family: var(--mono);
        margin-bottom: 1.25rem;
        min-height: 20px;
      }
      .knn-loading-bar-wrap {
        display: flex; align-items: center; gap: 10px; margin-bottom: 0.75rem;
      }
      .knn-loading-bar-track {
        flex: 1; height: 8px; background: var(--bg4);
        border-radius: 4px; overflow: hidden;
      }
      .knn-loading-bar-fill {
        height: 100%; background: var(--accent);
        border-radius: 4px;
        transition: width 0.3s ease;
      }
      .knn-loading-pct {
        font-size: 13px; font-family: var(--mono);
        color: var(--text2); min-width: 36px; text-align: right;
      }
      .knn-loading-hint {
        font-size: 11px; color: var(--text3); line-height: 1.5;
      }
    `;
    document.head.appendChild(style);
  }

  overlay.style.display = 'flex';
  updateLoadingOverlay(message, 0);
}

function updateLoadingOverlay(message, pct) {
  const msgEl  = document.getElementById('knn-loading-msg');
  const barEl  = document.getElementById('knn-loading-bar-fill');
  const pctEl  = document.getElementById('knn-loading-pct');
  if (msgEl)  msgEl.textContent  = message;
  if (barEl)  barEl.style.width  = Math.min(pct, 100) + '%';
  if (pctEl)  pctEl.textContent  = Math.min(pct, 100) + '%';
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('knn-loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

function cancelKNN() {
  if (_knnWorker) {
    _knnWorker.terminate();
    _knnWorker = null;
  }
  hideLoadingOverlay();
}