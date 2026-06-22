/* ============================================================
   c45_render.js  —  Render hasil C4.5:
     - Metrik ringkasan
     - Pohon keputusan (teks + visual)
     - Step-by-step accordion (Entropy, Gain, Gain Ratio)
     - Confusion matrix
     - Panel prediksi interaktif

   CHANGELOG (rebuild):
   [FIX-R1] XSS: semua nilai dataset di-escape via esc() sebelum masuk innerHTML
   [FIX-R2] renderResult() terima & gunakan parameter isOverfit → tampilkan warning overfit
   [FIX-R3] _renderConfusionMatrix: hapus asumsi biner hardcoded TP/FN/FP/TN → diagonal = correct
   [FIX-R4] _getDepth: guard array kosong → return 1 bukan -Infinity
   [FIX-R5] _traversePredict fallback pakai _getMajorityFromSubtree, bukan node.label || '?'
   [FIX-R6] _renderFooter: hapus atribut "button" duplikat di tag <button>
   [FIX-R7] _renderEntropyFormula: referensi kolom kelas Excel dinamis (classCol → huruf kolom)
   [FIX-R8] _renderBestAttrDetail: formula COUNTIF numerik pakai operator Excel yg benar (<= / >)
   [NEW-R1] renderResult() terima accTest, cmTest, splitMode → tampilkan panel evaluasi test set
   [NEW-R2] _renderNav: label & subtitle dinamis sesuai splitMode
   [NEW-R3] _renderMetrics: tambah metric card akurasi test jika holdout
   [NEW-R4] _renderTestPanel: confusion matrix + detailed metrics khusus test set
   [NEW-R5] _renderTreeSection: tree-canvas-wrap diberi max-height 520px + overflow scroll
   [NEW-R6] _renderStepsSection: container blocks diberi max-height 600px + overflow scroll
   ============================================================ */

   const C45_Render = (() => {

    const DEPTH_COLORS = [
      'var(--tree-depth-0)',
      'var(--tree-depth-1)',
      'var(--tree-depth-2)',
      'var(--tree-depth-3)',
      'var(--tree-depth-4)',
    ];
  
    /* ============================================================
       [FIX-R1] Helper XSS escape — wajib dipakai di SEMUA tempat
       nilai dari dataset (nama kolom, label kelas, nilai atribut)
       dimasukkan ke dalam HTML string.
       ============================================================ */
    function esc(str) {
      return String(str == null ? '' : str)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#039;');
    }
  
    /* ============================================================
       [FIX-R7] Konversi indeks kolom (0-based) ke huruf kolom Excel
       Contoh: 0→A, 1→B, 25→Z, 26→AA
       ============================================================ */
    function _colToExcelLetter(idx) {
      let result = '';
      let n = idx + 1; // 1-based
      while (n > 0) {
        result = String.fromCharCode(64 + (n % 26 || 26)) + result;
        n = Math.floor((n - 1) / 26);
      }
      return result;
    }
  
    /* ============================================================
       PUBLIC: renderResult
       [FIX-R2] Terima parameter isOverfit dari c45_core.js
       ============================================================ */
    function renderResult({ tree, steps, headers, colTypes, classCol, featCols, allClasses, rows, acc, cm, criterion, isOverfit,
                            accTest, cmTest, splitMode }) {
      // [NEW-R1] normalise: jika splitMode tidak dikirim default ke 'none'
      splitMode = splitMode || 'none';
      const hasTest = splitMode === 'holdout' && accTest != null && cmTest != null;

      const wrap = document.getElementById('result-content');
      wrap.innerHTML = '';
  
      // Breadcrumb update
      document.getElementById('breadcrumb').innerHTML = `
        <a class="crumb" href="../index.html">Beranda</a>
        <span class="sep">/</span>
        <a class="crumb" href="#" onclick="C45_IO.resetInput();document.getElementById('page-input').style.display='block';document.getElementById('page-result').style.display='none';return false;">C4.5</a>
        <span class="sep">/</span>
        <span class="active-crumb">Hasil</span>
      `;
  
      wrap.innerHTML = `
        ${_renderNav(rows, allClasses, acc, isOverfit, hasTest, accTest)}
        ${_renderMetrics(tree, steps, rows, acc, allClasses, isOverfit, hasTest, accTest)}
        ${_renderTreeSection(tree)}
        ${_renderStepsSection(steps, headers, colTypes, classCol, criterion)}
        ${_renderConfusionMatrix(cm, allClasses)}
        ${_renderDetailedMetrics(cm, allClasses)}
        ${hasTest ? _renderTestPanel(cmTest, allClasses, accTest) : ''}
        ${_renderPredictionPanel(tree, headers, colTypes, featCols, classCol, allClasses)}
        ${_renderFooter()}
      `;
  
      // Attach accordion toggle
      wrap.querySelectorAll('.iter-header').forEach(h => {
        h.addEventListener('click', () => {
          const body = h.nextElementSibling;
          h.classList.toggle('open');
          body.classList.toggle('open');
        });
      });
    }
  
    /* ============================================================
       Nav bar atas hasil
       [FIX-R2] Tampilkan label "Akurasi (training)" + warning overfit
       ============================================================ */
    function _renderNav(rows, allClasses, acc, isOverfit, hasTest, accTest) {
      const overfitWarning = isOverfit
        ? `<span style="color:var(--yellow);font-size:14px;margin-left:8px">
             ⚠ 100% pada training — kemungkinan overfit. Gunakan test split untuk evaluasi valid.
           </span>`
        : '';
      // [NEW-R2] Tambah akurasi test di subtitle jika holdout aktif
      const testAccStr = hasTest
        ? ` &nbsp;·&nbsp; Akurasi (test): <strong style="color:var(--accent)">${(accTest*100).toFixed(1)}%</strong>`
        : '';
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:1.5rem">
          <div>
            <h2 class="page-title" style="font-size:60px">Hasil <strong>C4.5</strong></h2>
            <p class="page-subtitle" style="margin-bottom:0">${esc(rows.length)} baris · ${esc(allClasses.length)} kelas · Akurasi (training): <strong style="color:var(--green)">${(acc*100).toFixed(1)}%</strong>${testAccStr}${overfitWarning}</p>
          </div>
        </div>
      `;
    }
  
    /* ============================================================
       Metrik ringkasan
       [FIX-R2] Tampilkan warning di metric card akurasi jika overfit
       [FIX-R4] _getDepth sudah aman (lihat helper di bawah)
       ============================================================ */
    function _renderMetrics(tree, steps, rows, acc, allClasses, isOverfit, hasTest, accTest) {
      const treeDepth  = _getDepth(tree);
      const leafCount  = _countLeaves(tree);
      const splitCount = steps.filter(s => s.type === 'split').length;
  
      const accNote = isOverfit
        ? `<div style="font-size:12px;color:var(--yellow);margin-top:2px">training only</div>`
        : '';

      // [NEW-R3] Card akurasi test — hanya muncul jika holdout aktif
      const testCard = hasTest ? `
          <div class="metric-card">
            <div class="metric-label">Akurasi (test)</div>
            <div class="metric-val" style="color:var(--accent)">${(accTest*100).toFixed(1)}%</div>
          </div>` : '';
  
      return `
        <div class="metrics-grid" style="margin-bottom:1.25rem">
          <div class="metric-card">
            <div class="metric-label">Akurasi (training)</div>
            <div class="metric-val metric-green">${(acc*100).toFixed(1)}%</div>
            ${accNote}
          </div>
          ${testCard}
          <div class="metric-card">
            <div class="metric-label">Kedalaman Pohon</div>
            <div class="metric-val metric-blue">${treeDepth}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Node Split</div>
            <div class="metric-val metric-blue">${splitCount}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Daun (Leaf)</div>
            <div class="metric-val" style="color:var(--yellow)">${leafCount}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Jumlah Aturan</div>
            <div class="metric-val" style="color:var(--yellow)">${leafCount}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Kelas</div>
            <div class="metric-val">${allClasses.length}</div>
          </div>
        </div>
      `;
    }
  
    /* ============================================================
       Pohon keputusan (visual teks)
       ============================================================ */
    function _renderTreeSection(tree) {
      const lines = [];
      _treeToLines(tree, '', true, lines);
      const html = lines.join('\n');
  
      return `
        <div class="section">
          <div class="section-head">
            <div class="step-circle" style="background:var(--yellow);color:#1a1000">&#9650;</div>
            <div class="section-title">Pohon Keputusan C4.5</div>
          </div>
          <div class="section-body">
            <div class="c45-result-banner success" style="margin-bottom:1rem">
              <div class="result-banner-icon">🌳</div>
              <div>
                <div class="result-banner-text">Pohon berhasil dibangun</div>
                <div class="result-banner-sub">Baca dari atas ke bawah; setiap cabang adalah kondisi atribut</div>
              </div>
            </div>
            <div class="tree-canvas-wrap" style="max-height:520px;overflow-y:auto;overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg3);padding:1rem;">
              <pre class="tree-text">${html}</pre>
            </div>
          </div>
        </div>
      `;
    }
  
    function _treeToLines(node, prefix, isLast, lines) {
      const connector  = isLast ? '└── ' : '├── ';
      const depthColor = DEPTH_COLORS[Math.min(node.depth, DEPTH_COLORS.length - 1)];
  
      if (node.type === 'leaf') {
        // [FIX-R1] esc() pada label dan frekuensi
        const freq = Object.entries(node.freq)
          .map(([k,v]) => `${esc(k)}:${v}`).join(', ');
        lines.push(
          `${prefix}${connector}` +
          `<span class="${node.label === Object.keys(node.freq).sort((a,b) => node.freq[b]-node.freq[a])[0] ? 't-leaf-y' : 't-leaf-n'}>` +
          `[DAUN] ${esc(node.label)}</span>` +
          ` <span class="t-branch">(n=${node.n}, {${freq}})</span>`
        );
        return;
      }
  
      // [FIX-R1] esc() pada attrName dan threshold
      const threshStr = node.isNum ? ` [threshold: ${esc(C45_Utils.fmt(node.threshold))}]` : '';
      lines.push(
        `${prefix}${connector}` +
        `<span class="t-split" style="color:${depthColor}">${esc(node.attrName)}${threshStr}</span>` +
        ` <span class="t-branch">(n=${node.n}, H=${C45_Utils.fmt(node.parentEntropy,4)})</span>`
      );
  
      const childExt = prefix + (isLast ? '    ' : '│   ');
      const keys     = Object.keys(node.children);
      keys.forEach((k, i) => {
        const childConn = i < keys.length - 1 ? '├── ' : '└── ';
        lines.push(`${childExt}${childConn}<span class="t-branch">${esc(k)}:</span>`);
        _treeToLines(node.children[k], childExt + '    ', i === keys.length - 1, lines);
      });
    }
  
    /* ============================================================
       Step-by-step accordion
       classCol diteruskan ke _renderEntropyFormula untuk Excel fix
       ============================================================ */
    function _renderStepsSection(steps, headers, colTypes, classCol, criterion) {
      const blocks = steps.map((step, idx) =>
        _renderStep(step, idx, headers, colTypes, classCol, criterion)).join('');
      return `
        <div class="section">
          <div class="section-head">
            <div class="step-circle">S</div>
            <div class="section-title">Perhitungan Manual Step-by-Step (${steps.length} node)</div>
          </div>
          <div class="section-body">
            <div class="info-box" style="margin-bottom:1rem;font-size:18px">
              Klik setiap node untuk membuka/menutup detail perhitungan.
              <strong>Node split</strong> menampilkan tabel Entropy &amp; ${criterion === 'gain_ratio' ? 'Gain Ratio' : 'Information Gain'}.
              <strong>Node daun</strong> menampilkan distribusi kelas.
            </div>
            <div style="max-height:600px;overflow-y:auto;padding-right:4px;">
              ${blocks}
            </div>
          </div>
        </div>
      `;
    }
  
    function _renderStep(step, idx, headers, colTypes, classCol, criterion) {
      const depthBadge = `<span class="depth-badge depth-${Math.min(step.depth, 4)}">depth ${step.depth}</span>`;
  
      if (step.type === 'leaf') {
        const node = step.node;
        // [FIX-R1] esc() pada label kelas
        const freq = Object.entries(node.freq).map(([k,v]) =>
          `<span class="leaf-badge ${k === node.label ? 'yes' : 'no'}" style="margin-right:4px">${esc(k)}: ${v}</span>`).join('');
        const headerCls = node.label ? 'iter-header leaf-yes' : 'iter-header leaf-no';
        return `
          <div class="iter-block">
            <div class="${headerCls}">
              <div class="iter-title">
                <div class="iter-num ${node.label ? 'green' : 'red'}">${idx+1}</div>
                <span>🍃 Daun — <strong>${esc(node.label)}</strong></span>
                ${depthBadge}
                <span style="font-family:var(--mono);font-size:16px;color:var(--text3)">(${esc(step.nodeName)}, n=${node.n})</span>
              </div>
              <span class="iter-chevron">▶</span>
            </div>
            <div class="iter-body">
              <div style="margin-bottom:0.75rem">
                <div style="font-size:18px;color:var(--text3);margin-bottom:0.35rem">Alasan dijadikan daun: <strong style="color:var(--yellow)">${esc(step.reason)}</strong></div>
                <div style="font-size:18px;color:var(--text2);margin-bottom:0.5rem">Distribusi kelas (n = ${node.n}):</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">${freq}</div>
              </div>
              ${_renderEntropyFormula(node.entropy, node.freq, node.n, classCol)}
            </div>
          </div>
        `;
      }
  
      // Split node
      const best       = step.best;
      const scoreLabel = criterion === 'gain_ratio' ? 'Gain Ratio' : 'Info Gain';
      const scoreVal   = criterion === 'gain_ratio' ? best.gainRatio : best.gain;
  
      // [FIX-R1] esc() pada attrName header
      return `
        <div class="iter-block">
          <div class="iter-header split">
            <div class="iter-title">
              <div class="iter-num">${idx+1}</div>
              <span>Split — <strong style="color:var(--accent)">${esc(headers[best.fi])}</strong></span>
              ${depthBadge}
              <span style="font-family:var(--mono);font-size:16px;color:var(--text3)">(${esc(step.nodeName)}, n=${step.rows.length})</span>
            </div>
            <span class="iter-chevron">▶</span>
          </div>
          <div class="iter-body">
  
            <div class="step-divider"><span>① Entropy Parent</span></div>
            ${_renderParentEntropy(step, classCol)}
  
            <div class="step-divider"><span>② Tabel ${scoreLabel} semua atribut</span></div>
            ${_renderGainTable(step.gains, best, headers, criterion)}
  
            <div class="step-divider"><span>③ Atribut Terpilih</span></div>
            <div class="c45-result-banner success" style="margin-top:0">
              <div class="result-banner-icon">🏆</div>
              <div>
                <div class="result-banner-text">
                  <strong>${esc(headers[best.fi])}</strong>${best.isNum ? ` ≤ ${esc(C45_Utils.fmt(best.threshold))}` : ''} dipilih
                </div>
                <div class="result-banner-sub">
                  ${scoreLabel} = <strong style="font-family:var(--mono)">${C45_Utils.fmt(scoreVal, 4)}</strong>
                  ${criterion === 'gain_ratio' ? `&nbsp;|&nbsp; Info Gain = ${C45_Utils.fmt(best.gain,4)} &nbsp;|&nbsp; Split Info = ${C45_Utils.fmt(best.splitInfo,4)}` : ''}
                </div>
              </div>
            </div>
  
            <div class="step-divider"><span>④ Detail Formula Atribut Terpilih</span></div>
            ${_renderBestAttrDetail(best, step, headers, criterion)}
          </div>
        </div>
      `;
    }
  
    /* ---- Entropy formula block ----
       [FIX-R1] esc() pada nilai kelas
       [FIX-R7] Referensi kolom kelas Excel dinamis via classCol
       ============================================================ */
    function _renderEntropyFormula(H, freq, n, classCol) {
      const classColLetter = _colToExcelLetter(classCol != null ? classCol : 0);
  
      const terms = Object.entries(freq).map(([cls, cnt]) => {
        const p = cnt / n;
        return `−(${cnt}/${n}) × log₂(${cnt}/${n}) = −${C45_Utils.fmt(p,4)} × ${C45_Utils.fmt(Math.log2(p),4)} = ${C45_Utils.fmt(-p*Math.log2(p),4)}`;
      });
  
      const entries = Object.entries(freq);
      let excelRows = '';
      entries.forEach(([cls, cnt], i) => {
        const row = i + 2;
        excelRows += `
          <tr>
            <td class="ef-cell ef-addr">A${row}</td>
            <td class="ef-cell ef-formula">${esc(cls)}</td>
            <td class="ef-cell ef-comment">// Nama kelas — ketik manual</td>
          </tr>
          <tr>
            <td class="ef-cell ef-addr">B${row}</td>
            <td class="ef-cell ef-formula">=COUNTIF(Sheet1!$${classColLetter}$2:$${classColLetter}$${n+1},"${esc(cls)}")</td>
            <td class="ef-cell ef-comment">// Jumlah baris kelas "${esc(cls)}" (kolom ${classColLetter})</td>
          </tr>
          <tr>
            <td class="ef-cell ef-addr">C${row}</td>
            <td class="ef-cell ef-formula">=COUNTA(Sheet1!$${classColLetter}$2:$${classColLetter}$${n+1})</td>
            <td class="ef-cell ef-comment">// Total semua data (n=${n})</td>
          </tr>
          <tr>
            <td class="ef-cell ef-addr">D${row}</td>
            <td class="ef-cell ef-formula">=B${row}/C${row}</td>
            <td class="ef-cell ef-comment">// p("${esc(cls)}") = ${cnt}/${n} = ${C45_Utils.fmt(cnt/n, 4)}</td>
          </tr>
          <tr>
            <td class="ef-cell ef-addr">E${row}</td>
            <td class="ef-cell ef-formula">=IF(D${row}=0,0,-(D${row})*LOG(D${row},2))</td>
            <td class="ef-cell ef-comment">// −p × log₂(p) untuk kelas "${esc(cls)}"</td>
          </tr>`;
      });
  
      const lastDataRow = entries.length + 1;
      const excelBlock = `
        <div class="km-excel-block" style="margin-top:1rem">
          <div class="km-excel-header">
            <span>📊 Formula Excel — Sheet: <strong>Entropy</strong></span>
            <button class="km-copy-btn" onclick="C45_Render._copyExcelEntropy(this)">⧉ Salin semua</button>
          </div>
          <div class="km-excel-note">
            ⚠ Kolom kelas ada di kolom <strong>${classColLetter}</strong> Sheet1 (sesuai dataset Anda).
            Kolom A=Kelas, B=Jumlah, C=Total, D=Proporsi, E=Kontribusi Entropy.
          </div>
          <div class="tbl-scroll-both" style="max-height:260px">
            <table class="km-excel-table">
              <thead>
                <tr><th>Sel</th><th>Nilai / Formula</th><th>Keterangan</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td class="ef-cell ef-addr">A1</td>
                  <td class="ef-cell ef-formula">Kelas</td>
                  <td class="ef-cell ef-comment">// Header — ketik manual</td>
                </tr>
                <tr>
                  <td class="ef-cell ef-addr">B1</td>
                  <td class="ef-cell ef-formula">Jumlah</td>
                  <td class="ef-cell ef-comment">// Header</td>
                </tr>
                <tr>
                  <td class="ef-cell ef-addr">C1</td>
                  <td class="ef-cell ef-formula">Total</td>
                  <td class="ef-cell ef-comment">// Header</td>
                </tr>
                <tr>
                  <td class="ef-cell ef-addr">D1</td>
                  <td class="ef-cell ef-formula">Proporsi (p)</td>
                  <td class="ef-cell ef-comment">// Header</td>
                </tr>
                <tr>
                  <td class="ef-cell ef-addr">E1</td>
                  <td class="ef-cell ef-formula">−p·log₂(p)</td>
                  <td class="ef-cell ef-comment">// Header</td>
                </tr>
                ${excelRows}
                <tr>
                  <td class="ef-cell ef-addr">F2</td>
                  <td class="ef-cell ef-formula">=SUM(E2:E${lastDataRow})</td>
                  <td class="ef-cell ef-comment">// Entropy total = ${C45_Utils.fmt(H, 4)} bit</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>`;
  
      return `
        <div class="c45-formula-block">
          <div class="formula-label">Entropy</div>
          H = ${terms.join('<br>&nbsp;&nbsp;+ ')}
          <br><strong style="color:var(--yellow)">H = ${C45_Utils.fmt(H, 4)} bit</strong>
          ${excelBlock}
        </div>
      `;
    }
  
    /* ---- Parent entropy block ---- */
    function _renderParentEntropy(step, classCol) {
      const freq = C45_Utils.classFreq(step.labels);
      const n    = step.labels.length;
      return _renderEntropyFormula(step.parentH, freq, n, classCol);
    }
  
    /* ---- Tabel gain semua atribut ----
       [FIX-R1] esc() pada nama atribut dan nilai threshold
       ============================================================ */
    function _renderGainTable(gains, best, headers, criterion) {
      const scoreKey   = criterion === 'gain_ratio' ? 'gainRatio' : 'gain';
      const scoreLabel = criterion === 'gain_ratio' ? 'Gain Ratio' : 'Info Gain';
      let html = `
        <div class="tbl-wrap" style="margin:0.5rem 0">
          <table class="gain-table">
            <thead>
              <tr>
                <th>Atribut</th>
                <th>Tipe</th>
                ${criterion === 'gain_ratio' ? '<th>Info Gain</th><th>Split Info</th>' : ''}
                <th>${scoreLabel}</th>
              </tr>
            </thead>
            <tbody>`;
      for (const g of gains) {
        const isBest = g.fi === best.fi;
        const tdCls  = isBest ? (criterion === 'gain_ratio' ? 'gain-ratio-best' : 'best-gain') : '';
        const thStr  = g.isNum && g.threshold !== null ? ` (≤${esc(C45_Utils.fmt(g.threshold))})` : '';
        html += `<tr${isBest ? ' class="row-hl"' : ''}>
          <td><strong>${esc(headers[g.fi])}${thStr}</strong>${isBest ? ' <span style="color:var(--green)">★</span>' : ''}</td>
          <td style="font-family:var(--mono);font-size:16px">${g.isNum ? 'numerik' : 'kategorikal'}</td>
          ${criterion === 'gain_ratio' ? `<td class="mono">${C45_Utils.fmt(g.gain,4)}</td><td class="mono">${C45_Utils.fmt(g.splitInfo,4)}</td>` : ''}
          <td class="mono ${tdCls}">${C45_Utils.fmt(g[scoreKey],4)}</td>
        </tr>`;
      }
      html += '</tbody></table></div>';
      return html;
    }
  
    /* ---- Detail formula atribut terpilih ----
       [FIX-R1] esc() pada nama atribut dan nilai cabang
       [FIX-R8] Formula COUNTIF numerik pakai operator Excel yang valid (<= / >)
       ============================================================ */
    function _renderBestAttrDetail(best, step, headers, criterion) {
      const n = step.rows.length;
      if (!best.groups) return '<p style="color:var(--text3);font-size:17px">Tidak ada detail tersedia.</p>';
  
      // [FIX-R8] Helper: konversi nilai cabang ke kriteria COUNTIF Excel yang valid
      function _toExcelCriteria(val, isNum) {
        if (!isNum) return `"${esc(val)}"`;
        // val adalah string seperti "≤2.5" atau ">2.5"
        if (val.startsWith('≤')) return `"<=${val.slice(1)}"`;
        if (val.startsWith('>'))  return `">${val.slice(1)}"`;
        return `"${esc(val)}"`;
      }
  
      const attrColLetter = _colToExcelLetter(best.fi);
  
      let groupLines = '';
      for (const [val, labels] of Object.entries(best.groups)) {
        const freq    = C45_Utils.classFreq(Array.isArray(labels) ? labels : [labels]);
        const cnt     = Array.isArray(labels) ? labels.length : 1;
        const H       = C45_Utils.entropyFromLabels(Array.isArray(labels) ? labels : [labels]);
        const freqStr = Object.entries(freq).map(([k,v]) => `${esc(k)}=${v}`).join(', ');
        groupLines += `
          <div style="margin-bottom:0.6rem">
            <div style="font-size:18px;font-family:var(--mono);color:var(--accent)">${esc(val)}</div>
            <div style="font-size:17px;color:var(--text2);margin-left:1rem">n=${cnt}, {${freqStr}}</div>
            <div style="font-size:17px;color:var(--text2);margin-left:1rem">H(${esc(val)}) = ${C45_Utils.fmtBits(H)}</div>
            <div style="font-size:17px;color:var(--text3);margin-left:1rem">Kontribusi = (${cnt}/${n}) × ${C45_Utils.fmt(H,4)} = ${C45_Utils.fmt((cnt/n)*H, 4)}</div>
          </div>`;
      }
  
      const gainStr = `H(parent) − Σ weighted entropy = ${C45_Utils.fmt(step.parentH,4)} − ${C45_Utils.fmt(step.parentH - best.gain, 4)} = ${C45_Utils.fmt(best.gain,4)}`;
      const grStr   = criterion === 'gain_ratio'
        ? `<br>Gain Ratio = ${C45_Utils.fmt(best.gain,4)} / ${C45_Utils.fmt(best.splitInfo,4)} = <strong style="color:var(--yellow)">${C45_Utils.fmt(best.gainRatio,4)}</strong>`
        : '';
  
      const attrName     = headers[best.fi];
      const groupEntries = Object.entries(best.groups);
      const nTotal       = step.rows.length;
      let excelGainRows  = '';
  
      groupEntries.forEach(([val, labels], i) => {
        const cnt  = Array.isArray(labels) ? labels.length : 1;
        const H    = C45_Utils.entropyFromLabels(Array.isArray(labels) ? labels : [labels]);
        const row  = i + 2;
        // [FIX-R8] Gunakan COUNTIFS untuk numerik (mendukung operator <= dan >)
        const countFormula = best.isNum
          ? `=COUNTIFS(Sheet1!$${attrColLetter}$2:$${attrColLetter}$${nTotal+1},${_toExcelCriteria(val, true)})`
          : `=COUNTIF(Sheet1!$${attrColLetter}$2:$${attrColLetter}$${nTotal+1},${_toExcelCriteria(val, false)})`;
  
        excelGainRows += `
          <tr>
            <td class="ef-cell ef-addr">A${row}</td>
            <td class="ef-cell ef-formula">${esc(val)}</td>
            <td class="ef-cell ef-comment">// Nilai cabang "${esc(val)}" — ketik manual</td>
          </tr>
          <tr>
            <td class="ef-cell ef-addr">B${row}</td>
            <td class="ef-cell ef-formula">${countFormula}</td>
            <td class="ef-cell ef-comment">// Jumlah baris dengan ${esc(attrName)}="${esc(val)}" (n=${cnt})</td>
          </tr>
          <tr>
            <td class="ef-cell ef-addr">C${row}</td>
            <td class="ef-cell ef-formula">${C45_Utils.fmt(H, 6)}</td>
            <td class="ef-cell ef-comment">// H("${esc(val)}") = ${C45_Utils.fmt(H, 4)} — isi dari sheet Entropy</td>
          </tr>
          <tr>
            <td class="ef-cell ef-addr">D${row}</td>
            <td class="ef-cell ef-formula">=(B${row}/$B$${groupEntries.length+2})*C${row}</td>
            <td class="ef-cell ef-comment">// (${cnt}/${nTotal}) × ${C45_Utils.fmt(H,4)} = ${C45_Utils.fmt((cnt/nTotal)*H,4)}</td>
          </tr>`;
      });
  
      const lastGrRow = groupEntries.length + 1;
      const totalRow  = groupEntries.length + 2;
      const gainRow   = groupEntries.length + 4;
      const siRow     = groupEntries.length + 5;
      const grRow     = groupEntries.length + 6;
  
      const excelGainBlock = `
        <div class="km-excel-block" style="margin-top:1rem">
          <div class="km-excel-header">
            <span>📊 Formula Excel — Sheet: <strong>Gain_${esc(attrName.replace(/\s+/g,'_'))}</strong></span>
            <button class="km-copy-btn" onclick="C45_Render._copyExcelGain(this)">⧉ Salin semua</button>
          </div>
          <div class="km-excel-note">
            ⚠ Kolom atribut <strong>${esc(attrName)}</strong> ada di kolom <strong>${attrColLetter}</strong> Sheet1.
            ${criterion === 'gain_ratio' ? 'Split Info dan Gain Ratio dihitung otomatis di baris bawah.' : ''}
          </div>
          <div class="tbl-scroll-both" style="max-height:300px">
            <table class="km-excel-table">
              <thead>
                <tr><th>Sel</th><th>Nilai / Formula</th><th>Keterangan</th></tr>
              </thead>
              <tbody>
                <tr><td class="ef-cell ef-addr">A1</td><td class="ef-cell ef-formula">Cabang</td><td class="ef-cell ef-comment">// Header</td></tr>
                <tr><td class="ef-cell ef-addr">B1</td><td class="ef-cell ef-formula">Jumlah</td><td class="ef-cell ef-comment">// Header</td></tr>
                <tr><td class="ef-cell ef-addr">C1</td><td class="ef-cell ef-formula">H(cabang)</td><td class="ef-cell ef-comment">// Header — entropy tiap cabang</td></tr>
                <tr><td class="ef-cell ef-addr">D1</td><td class="ef-cell ef-formula">Kontribusi</td><td class="ef-cell ef-comment">// Header — (n_v/n) × H(v)</td></tr>
                ${excelGainRows}
                <tr>
                  <td class="ef-cell ef-addr">B${totalRow}</td>
                  <td class="ef-cell ef-formula">=SUM(B2:B${lastGrRow})</td>
                  <td class="ef-cell ef-comment">// Total n = ${nTotal}</td>
                </tr>
                <tr>
                  <td class="ef-cell ef-addr">D${totalRow}</td>
                  <td class="ef-cell ef-formula">=SUM(D2:D${lastGrRow})</td>
                  <td class="ef-cell ef-comment">// Σ weighted entropy = ${C45_Utils.fmt(step.parentH - best.gain, 4)}</td>
                </tr>
                <tr>
                  <td class="ef-cell ef-addr">A${gainRow}</td>
                  <td class="ef-cell ef-formula">Info Gain</td>
                  <td class="ef-cell ef-comment">// Label — ketik manual</td>
                </tr>
                <tr>
                  <td class="ef-cell ef-addr">B${gainRow}</td>
                  <td class="ef-cell ef-formula">=${C45_Utils.fmt(step.parentH,6)}-D${totalRow}</td>
                  <td class="ef-cell ef-comment">// H(parent) − Σ weighted = ${C45_Utils.fmt(best.gain, 4)}</td>
                </tr>
                ${criterion === 'gain_ratio' ? `
                <tr>
                  <td class="ef-cell ef-addr">A${siRow}</td>
                  <td class="ef-cell ef-formula">Split Info</td>
                  <td class="ef-cell ef-comment">// Label — ketik manual</td>
                </tr>
                <tr>
                  <td class="ef-cell ef-addr">B${siRow}</td>
                  <td class="ef-cell ef-formula">=${groupEntries.map(([_,lb]) => {
                      const cnt = Array.isArray(lb) ? lb.length : 1;
                      const p   = cnt / nTotal;
                      return `IF(${C45_Utils.fmt(p,6)}=0,0,-(${C45_Utils.fmt(p,6)})*LOG(${C45_Utils.fmt(p,6)},2))`;
                    }).join('+')}
                  </td>
                  <td class="ef-cell ef-comment">// SplitInfo = ${C45_Utils.fmt(best.splitInfo, 4)}</td>
                </tr>
                <tr>
                  <td class="ef-cell ef-addr">A${grRow}</td>
                  <td class="ef-cell ef-formula">Gain Ratio</td>
                  <td class="ef-cell ef-comment">// Label — ketik manual</td>
                </tr>
                <tr>
                  <td class="ef-cell ef-addr">B${grRow}</td>
                  <td class="ef-cell ef-formula">=IF(B${siRow}=0,0,B${gainRow}/B${siRow})</td>
                  <td class="ef-cell ef-comment">// Gain Ratio = ${C45_Utils.fmt(best.gainRatio, 4)}</td>
                </tr>` : ''}
              </tbody>
            </table>
          </div>
        </div>`;
  
      return `
        <div class="c45-formula-block">
          <div class="formula-label">Detail ${esc(attrName)}</div>
          ${groupLines}
          <div style="margin-top:0.5rem;border-top:1px dashed rgba(251,191,36,0.2);padding-top:0.5rem">
            Information Gain = ${gainStr}${grStr}
          </div>
          ${excelGainBlock}
        </div>
      `;
    }
  
    /* ============================================================
       Confusion Matrix
       [FIX-R3] Hapus asumsi biner hardcoded TP/FN/FP/TN.
                Untuk semua jumlah kelas: diagonal = correct (tp style),
                off-diagonal nonzero = error (fp style).
                Label tooltip "TP/FP" hanya berlaku biner — di sini
                kita cukup highlight diagonal hijau, sisanya merah jika > 0.
       [FIX-R1] esc() pada nama kelas
       ============================================================ */
    function _renderConfusionMatrix(cm, allClasses) {
      let headerRow = '<tr><th>↓ Aktual / Prediksi →</th>';
      allClasses.forEach(c => { headerRow += `<th style="color:var(--accent)">${esc(c)}</th>`; });
      headerRow += '</tr>';
  
      let rows = '';
      cm.forEach((row, i) => {
        rows += `<tr><th style="color:var(--green)">${esc(allClasses[i])}</th>`;
        row.forEach((v, j) => {
          // [FIX-R3] Diagonal = prediksi benar (hijau), off-diagonal > 0 = error (merah)
          const cls = i === j ? 'tp' : (v > 0 ? 'fp' : '');
          rows += `<td class="${cls}" style="text-align:center;font-family:var(--mono)">${v}</td>`;
        });
        rows += '</tr>';
      });
  
      return `
        <div class="section">
          <div class="section-head">
            <div class="step-circle" style="background:var(--green);color:#0d2d22">M</div>
            <div class="section-title">Confusion Matrix (Training)</div>
          </div>
          <div class="section-body">
            <div class="conf-matrix-wrap">
              <table class="conf-matrix">
                <thead>${headerRow}</thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }
  
    /* ============================================================
       Evaluasi Lanjutan: Precision, Recall, F1, Class Accuracy
       [FIX-R1] esc() pada nama kelas
       ============================================================ */
    function _renderDetailedMetrics(cm, allClasses) {
      const { metrics, macro, weighted, totalSupport } = C45_Utils.precisionRecallF1(cm, allClasses);
  
      const pct = v => `${(v * 100).toFixed(1)}%`;
      const bar = (v, color) => `
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;background:var(--bg2);border-radius:3px;height:8px;overflow:hidden">
            <div style="width:${(v*100).toFixed(1)}%;height:100%;background:${color};border-radius:3px;transition:width .3s"></div>
          </div>
          <span style="font-family:var(--mono);font-size:15px;color:var(--text2);min-width:40px">${pct(v)}</span>
        </div>`;
  
      let classRows = '';
      metrics.forEach(m => {
        const f1Color = m.f1 >= 0.8 ? 'var(--green)' : m.f1 >= 0.5 ? 'var(--yellow)' : 'var(--red,#f87171)';
        classRows += `
          <tr>
            <td style="font-family:var(--mono);font-weight:600;color:var(--accent)">${esc(m.cls)}</td>
            <td>${bar(m.precision, 'var(--accent)')}</td>
            <td>${bar(m.recall,    'var(--green)')}</td>
            <td>${bar(m.f1,        f1Color)}</td>
            <td>${bar(m.classAcc,  'var(--yellow)')}</td>
            <td style="font-family:var(--mono);font-size:16px;color:var(--text3);text-align:center">${m.support}</td>
            <td style="font-family:var(--mono);font-size:14px;color:var(--text3);text-align:center">${m.tp}/${m.fp}/${m.fn}</td>
          </tr>`;
      });
  
      const avgCard = (label, color, p, r, f) => `
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-lg);padding:0.85rem 1rem;flex:1;min-width:180px">
          <div style="font-size:16px;color:var(--text3);margin-bottom:0.5rem">${label}</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center">
            <div>
              <div style="font-family:var(--mono);font-size:22px;color:${color};font-weight:700">${pct(p)}</div>
              <div style="font-size:13px;color:var(--text3)">Precision</div>
            </div>
            <div>
              <div style="font-family:var(--mono);font-size:22px;color:${color};font-weight:700">${pct(r)}</div>
              <div style="font-size:13px;color:var(--text3)">Recall</div>
            </div>
            <div>
              <div style="font-family:var(--mono);font-size:22px;color:${color};font-weight:700">${pct(f)}</div>
              <div style="font-size:13px;color:var(--text3)">F1-Score</div>
            </div>
          </div>
        </div>`;
  
      const bestF1  = metrics.reduce((a, b) => a.f1 > b.f1 ? a : b);
      const worstF1 = metrics.reduce((a, b) => a.f1 < b.f1 ? a : b);
      const interpretNote = allClasses.length === 2
        ? `Dataset biner — perhatikan kelas <strong>${esc(worstF1.cls)}</strong> (F1 terendah: ${pct(worstF1.f1)}) yang mungkin butuh lebih banyak data.`
        : `Kelas <strong>${esc(bestF1.cls)}</strong> tertinggi (F1 ${pct(bestF1.f1)}), kelas <strong>${esc(worstF1.cls)}</strong> terendah (F1 ${pct(worstF1.f1)}).`;
  
      return `
        <div class="section">
          <div class="section-head">
            <div class="step-circle" style="background:var(--accent);color:#fff">E</div>
            <div class="section-title">Evaluasi Lanjutan — Precision, Recall &amp; F1</div>
          </div>
          <div class="section-body">
  
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:1.25rem">
              ${avgCard('Macro Average', 'var(--accent)', macro.precision, macro.recall, macro.f1)}
              ${avgCard('Weighted Average', 'var(--green)', weighted.precision, weighted.recall, weighted.f1)}
            </div>
  
            <div class="info-box" style="margin-bottom:1rem;font-size:17px">
              📌 <strong>Macro</strong> = rata-rata sederhana antar kelas (sensitif terhadap kelas kecil).
              <strong>Weighted</strong> = rata-rata berbobot jumlah sampel tiap kelas.
              ${interpretNote}
            </div>
  
            <div class="tbl-scroll-both">
              <table style="width:100%;border-collapse:collapse;font-size:17px">
                <thead>
                  <tr style="border-bottom:1px solid var(--border)">
                    <th style="text-align:left;padding:6px 10px;color:var(--text3);font-weight:500">Kelas</th>
                    <th style="text-align:left;padding:6px 10px;color:var(--text3);font-weight:500;min-width:160px">Precision</th>
                    <th style="text-align:left;padding:6px 10px;color:var(--text3);font-weight:500;min-width:160px">Recall</th>
                    <th style="text-align:left;padding:6px 10px;color:var(--text3);font-weight:500;min-width:160px">F1-Score</th>
                    <th style="text-align:left;padding:6px 10px;color:var(--text3);font-weight:500;min-width:160px">Akurasi Kelas</th>
                    <th style="text-align:center;padding:6px 10px;color:var(--text3);font-weight:500">Support</th>
                    <th style="text-align:center;padding:6px 10px;color:var(--text3);font-weight:500">TP/FP/FN</th>
                  </tr>
                </thead>
                <tbody>${classRows}</tbody>
                <tfoot>
                  <tr style="border-top:1px solid var(--border);background:var(--bg3)">
                    <td style="padding:6px 10px;font-size:15px;color:var(--text3)">Macro avg</td>
                    <td style="padding:6px 10px;font-family:var(--mono);font-size:16px;color:var(--accent)">${pct(macro.precision)}</td>
                    <td style="padding:6px 10px;font-family:var(--mono);font-size:16px;color:var(--green)">${pct(macro.recall)}</td>
                    <td style="padding:6px 10px;font-family:var(--mono);font-size:16px;color:var(--yellow)">${pct(macro.f1)}</td>
                    <td colspan="3" style="padding:6px 10px;font-size:15px;color:var(--text3)"></td>
                  </tr>
                  <tr style="background:var(--bg3)">
                    <td style="padding:6px 10px;font-size:15px;color:var(--text3)">Weighted avg</td>
                    <td style="padding:6px 10px;font-family:var(--mono);font-size:16px;color:var(--accent)">${pct(weighted.precision)}</td>
                    <td style="padding:6px 10px;font-family:var(--mono);font-size:16px;color:var(--green)">${pct(weighted.recall)}</td>
                    <td style="padding:6px 10px;font-family:var(--mono);font-size:16px;color:var(--yellow)">${pct(weighted.f1)}</td>
                    <td style="padding:6px 10px;font-family:var(--mono);font-size:16px;color:var(--text3);text-align:center" colspan="2">${totalSupport} sampel</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
  
            <details style="margin-top:1rem">
              <summary style="font-size:17px;color:var(--text3);cursor:pointer;user-select:none">▶ Definisi metrik</summary>
              <div style="margin-top:0.75rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;font-size:16px">
                <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-lg);padding:0.75rem 1rem">
                  <div style="color:var(--accent);font-weight:600;margin-bottom:4px">Precision</div>
                  Dari semua prediksi kelas X, berapa yang benar?<br>
                  <span style="font-family:var(--mono);font-size:15px;color:var(--text3)">TP / (TP + FP)</span>
                </div>
                <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-lg);padding:0.75rem 1rem">
                  <div style="color:var(--green);font-weight:600;margin-bottom:4px">Recall (Sensitivity)</div>
                  Dari semua data kelas X yang sebenarnya, berapa yang terdeteksi?<br>
                  <span style="font-family:var(--mono);font-size:15px;color:var(--text3)">TP / (TP + FN)</span>
                </div>
                <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-lg);padding:0.75rem 1rem">
                  <div style="color:var(--yellow);font-weight:600;margin-bottom:4px">F1-Score</div>
                  Harmonic mean antara Precision dan Recall. Baik untuk dataset tidak seimbang.<br>
                  <span style="font-family:var(--mono);font-size:15px;color:var(--text3)">2 × P × R / (P + R)</span>
                </div>
                <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-lg);padding:0.75rem 1rem">
                  <div style="color:var(--yellow);font-weight:600;margin-bottom:4px">Akurasi Kelas</div>
                  Proporsi prediksi benar untuk kelas ini vs semua data.<br>
                  <span style="font-family:var(--mono);font-size:15px;color:var(--text3)">(TP + TN) / Total</span>
                </div>
              </div>
            </details>
  
          </div>
        </div>
      `;
    }
  
    /* ============================================================
       [NEW-R4] Panel Evaluasi Test Set
       Ditampilkan hanya jika splitMode === 'holdout'.
       Berisi confusion matrix dan precision/recall/F1 test set,
       menggunakan kembali _renderConfusionMatrix &
       _renderDetailedMetrics yang sudah ada.
       ============================================================ */
    function _renderTestPanel(cmTest, allClasses, accTest) {
      // Reuse _renderConfusionMatrix tapi ganti judul
      let headerRow = '<tr><th>↓ Aktual / Prediksi →</th>';
      allClasses.forEach(c => { headerRow += `<th style="color:var(--accent)">${esc(c)}</th>`; });
      headerRow += '</tr>';

      let cmRows = '';
      cmTest.forEach((row, i) => {
        cmRows += `<tr><th style="color:var(--green)">${esc(allClasses[i])}</th>`;
        row.forEach((v, j) => {
          const cls = i === j ? 'tp' : (v > 0 ? 'fp' : '');
          cmRows += `<td class="${cls}" style="text-align:center;font-family:var(--mono)">${v}</td>`;
        });
        cmRows += '</tr>';
      });

      // Detailed metrics dari test set
      const { metrics, macro, weighted, totalSupport } = C45_Utils.precisionRecallF1(cmTest, allClasses);
      const pct = v => `${(v * 100).toFixed(1)}%`;
      const bar = (v, color) => `
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;background:var(--bg2);border-radius:3px;height:8px;overflow:hidden">
            <div style="width:${(v*100).toFixed(1)}%;height:100%;background:${color};border-radius:3px;transition:width .3s"></div>
          </div>
          <span style="font-family:var(--mono);font-size:15px;color:var(--text2);min-width:40px">${pct(v)}</span>
        </div>`;

      let classRows = '';
      metrics.forEach(m => {
        const f1Color = m.f1 >= 0.8 ? 'var(--green)' : m.f1 >= 0.5 ? 'var(--yellow)' : 'var(--red,#f87171)';
        classRows += `
          <tr>
            <td style="font-family:var(--mono);font-weight:600;color:var(--accent)">${esc(m.cls)}</td>
            <td>${bar(m.precision, 'var(--accent)')}</td>
            <td>${bar(m.recall,    'var(--green)')}</td>
            <td>${bar(m.f1,        f1Color)}</td>
            <td>${bar(m.classAcc,  'var(--yellow)')}</td>
            <td style="font-family:var(--mono);font-size:16px;color:var(--text3);text-align:center">${m.support}</td>
            <td style="font-family:var(--mono);font-size:14px;color:var(--text3);text-align:center">${m.tp}/${m.fp}/${m.fn}</td>
          </tr>`;
      });

      return `
        <div class="section">
          <div class="section-head">
            <div class="step-circle" style="background:var(--accent);color:#fff">T</div>
            <div class="section-title">Evaluasi Test Set — Akurasi: <strong style="color:var(--accent)">${(accTest*100).toFixed(1)}%</strong></div>
          </div>
          <div class="section-body">

            <div class="info-box" style="margin-bottom:1rem;font-size:18px">
              📋 Hasil evaluasi pada <strong>data yang tidak digunakan saat training</strong>.
              Ini adalah estimasi performa model pada data baru (generalisasi).
            </div>

            <div style="font-size:18px;font-weight:500;color:var(--text);margin-bottom:0.65rem">
              Confusion Matrix (Test Set)
            </div>
            <div class="conf-matrix-wrap" style="margin-bottom:1.25rem">
              <table class="conf-matrix">
                <thead>${headerRow}</thead>
                <tbody>${cmRows}</tbody>
              </table>
            </div>

            <div style="font-size:18px;font-weight:500;color:var(--text);margin-bottom:0.65rem">
              Precision, Recall &amp; F1 (Test Set)
            </div>
            <div class="tbl-scroll-both">
              <table style="width:100%;border-collapse:collapse;font-size:17px">
                <thead>
                  <tr style="border-bottom:1px solid var(--border)">
                    <th style="text-align:left;padding:6px 10px;color:var(--text3);font-weight:500">Kelas</th>
                    <th style="text-align:left;padding:6px 10px;color:var(--text3);font-weight:500;min-width:160px">Precision</th>
                    <th style="text-align:left;padding:6px 10px;color:var(--text3);font-weight:500;min-width:160px">Recall</th>
                    <th style="text-align:left;padding:6px 10px;color:var(--text3);font-weight:500;min-width:160px">F1-Score</th>
                    <th style="text-align:left;padding:6px 10px;color:var(--text3);font-weight:500;min-width:160px">Akurasi Kelas</th>
                    <th style="text-align:center;padding:6px 10px;color:var(--text3);font-weight:500">Support</th>
                    <th style="text-align:center;padding:6px 10px;color:var(--text3);font-weight:500">TP/FP/FN</th>
                  </tr>
                </thead>
                <tbody>${classRows}</tbody>
                <tfoot>
                  <tr style="border-top:1px solid var(--border);background:var(--bg3)">
                    <td style="padding:6px 10px;font-size:15px;color:var(--text3)">Macro avg</td>
                    <td style="padding:6px 10px;font-family:var(--mono);font-size:16px;color:var(--accent)">${pct(macro.precision)}</td>
                    <td style="padding:6px 10px;font-family:var(--mono);font-size:16px;color:var(--green)">${pct(macro.recall)}</td>
                    <td style="padding:6px 10px;font-family:var(--mono);font-size:16px;color:var(--yellow)">${pct(macro.f1)}</td>
                    <td colspan="3" style="padding:6px 10px;font-size:15px;color:var(--text3)"></td>
                  </tr>
                  <tr style="background:var(--bg3)">
                    <td style="padding:6px 10px;font-size:15px;color:var(--text3)">Weighted avg</td>
                    <td style="padding:6px 10px;font-family:var(--mono);font-size:16px;color:var(--accent)">${pct(weighted.precision)}</td>
                    <td style="padding:6px 10px;font-family:var(--mono);font-size:16px;color:var(--green)">${pct(weighted.recall)}</td>
                    <td style="padding:6px 10px;font-family:var(--mono);font-size:16px;color:var(--yellow)">${pct(weighted.f1)}</td>
                    <td style="padding:6px 10px;font-family:var(--mono);font-size:16px;color:var(--text3);text-align:center" colspan="2">${totalSupport} sampel</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

          </div>
        </div>
      `;
    }

    /* ============================================================
       Panel Prediksi Interaktif
       [FIX-R1] esc() pada nama kolom dan tipe
       ============================================================ */
    function _renderPredictionPanel(tree, headers, colTypes, featCols, classCol, allClasses) {
      const inputs = featCols.map(fi => `
        <div class="pred-input-card">
          <div class="pred-input-label">${esc(headers[fi])} <span style="font-size:13px">[${esc(colTypes[fi])}]</span></div>
          <input type="text" id="pred-input-${fi}" placeholder="${colTypes[fi] === 'num' ? '0.0' : 'nilai'}" style="width:100%">
        </div>
      `).join('');
  
      return `
        <div class="section">
          <div class="section-head">
            <div class="step-circle" style="background:#a78bfa;color:#1a1030">P</div>
            <div class="section-title">Prediksi Data Baru</div>
          </div>
          <div class="section-body">
            <div class="pred-input-grid">${inputs}</div>
            <div style="margin-top:1rem;display:flex;gap:10px;flex-wrap:wrap">
              <button class="btn btn-primary" onclick="C45_Render.predictManual()">&#9654; Prediksi</button>
              <button class="btn btn-sm" onclick="C45_Render.clearPrediction()">&#8635; Bersihkan</button>
            </div>
            <div id="pred-result" style="margin-top:1rem"></div>
          </div>
        </div>
      `;
    }
  
    /* ============================================================
       PUBLIC: predictManual
       [FIX-R5] _traversePredict fallback pakai _getMajorityFromSubtree
       [FIX-R1] esc() pada label prediksi dan path
       ============================================================ */
    function predictManual() {
      const state    = C45_IO.getState();
      const tree     = C45_Core.getTree();
      const featCols = state.featCols;
      const headers  = state.headers;
      const colTypes = state.colTypes;
  
      const row = new Array(headers.length).fill('');
      let valid  = true;
      for (const fi of featCols) {
        const inp = document.getElementById(`pred-input-${fi}`);
        if (!inp || inp.value.trim() === '') { valid = false; break; }
        row[fi] = inp.value.trim();
      }
  
      const resDiv = document.getElementById('pred-result');
      if (!valid) {
        resDiv.innerHTML = `<div class="warn-box" style="font-size:18px">⚠ Isi semua kolom fitur.</div>`;
        return;
      }
  
      const pred     = _traversePredict(tree, row, []);
      // [FIX-R1] esc() pada path items dan label
      const pathHtml = pred.path.map(p =>
        `<span style="font-family:var(--mono);color:var(--text2)">${esc(p)}</span>`).join(' → ');
  
      resDiv.innerHTML = `
        <div class="c45-result-banner success">
          <div class="result-banner-icon">🎯</div>
          <div>
            <div class="result-banner-text">Prediksi: <strong>${esc(pred.label)}</strong></div>
            <div class="result-banner-sub" style="margin-top:4px">Jalur: ${pathHtml}</div>
          </div>
        </div>
      `;
    }
  
    /* [FIX-R5] _traversePredict: fallback ke majority dari subtree,
       bukan node.label || '?' yang bisa undefined/salah tipe */
    function _traversePredict(node, row, path) {
      if (node.type === 'leaf') return { label: node.label, path };
  
      const val = row[node.attr];
      let branch;
      if (node.isNum) {
        branch = parseFloat(val) <= node.threshold
          ? `≤${C45_Utils.fmt(node.threshold)}`
          : `>${C45_Utils.fmt(node.threshold)}`;
      } else {
        branch = val;
      }
      path.push(`${node.attrName}=${val}`);
      const child = node.children[branch];
      if (!child) {
        // [FIX-R5] Kumpulkan majority dari seluruh subtree
        return { label: _getMajorityFromSubtree(node), path };
      }
      return _traversePredict(child, row, path);
    }
  
    function _getMajorityFromSubtree(node) {
      const labels = [];
      function collect(n) {
        if (n.type === 'leaf') {
          for (let i = 0; i < n.n; i++) labels.push(n.label);
          return;
        }
        Object.values(n.children).forEach(collect);
      }
      collect(node);
      return labels.length > 0 ? C45_Utils.majorityClass(labels) : '?';
    }
  
    function clearPrediction() {
      const state = C45_IO.getState();
      state.featCols.forEach(fi => {
        const inp = document.getElementById(`pred-input-${fi}`);
        if (inp) inp.value = '';
      });
      const r = document.getElementById('pred-result');
      if (r) r.innerHTML = '';
    }
  
    /* ============================================================
       Copy helpers untuk Excel block
       ============================================================ */
    function _copyExcelEntropy(btn) {
      const block = btn.closest('.km-excel-block');
      const rows  = block.querySelectorAll('tbody tr');
      const lines = [];
      rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length >= 2) {
          const addr    = cells[0].textContent.trim();
          const formula = cells[1].textContent.trim();
          const comment = cells[2] ? cells[2].textContent.trim() : '';
          lines.push(`${addr}\t${formula}\t${comment}`);
        }
      });
      navigator.clipboard.writeText(lines.join('\n')).then(() => {
        btn.textContent = '✓ Tersalin!';
        setTimeout(() => { btn.textContent = '⧉ Salin semua'; }, 2000);
      });
    }
  
    function _copyExcelGain(btn) {
      _copyExcelEntropy(btn); // same logic
    }
  
    /* ============================================================
       Footer
       [FIX-R6] Hapus atribut "button" duplikat di setiap tag <button>
       ============================================================ */
    function _renderFooter() {
      return `
        <div class="page-footer">
          <button class="btn btn-green" onclick="C45_Export.exportExcelPlainText()">Download Excel Plain Text</button>
          <button class="btn btn-green" onclick="C45_Export.exportExcelFormula()">Download Excel Nilai</button>
          <button class="btn btn-sm" onclick="C45_Export.goBack()">Kembali ke Input</button>
          <button class="btn btn-sm" onclick="C45_Export.goHome()">Beranda</button>
        </div>
      `;
    }
  
    /* ============================================================
       Helpers
       [FIX-R4] _getDepth: guard children kosong → return 1 bukan -Infinity
       ============================================================ */
    function _getDepth(node) {
      if (!node || node.type === 'leaf') return 0;
      const childDepths = Object.values(node.children).map(_getDepth);
      if (childDepths.length === 0) return 1; // split node tanpa children (edge case FIX-R4)
      return 1 + Math.max(...childDepths);
    }
  
    function _countLeaves(node) {
      if (!node || node.type === 'leaf') return 1;
      return Object.values(node.children).reduce((s, c) => s + _countLeaves(c), 0);
    }
  
    return { renderResult, predictManual, clearPrediction, _copyExcelEntropy, _copyExcelGain };
  })();