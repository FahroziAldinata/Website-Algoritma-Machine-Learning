/**
 * src/core/core_ui.js
 * Core UI SPA Shell Controller
 * 
 * Tujuan: Mengatur logika visual Single Page Application (SPA), interaksi DOM,
 * drag-and-drop CSV, rendering pratinjau dataset, pembuatan form parameter secara dinamis,
 * pemanggilan Generic Web Worker, dan visualisasi hasil perhitungan model.
 */

document.addEventListener('DOMContentLoaded', () => {
  initSPA();
});

/**
 * Menampilkan notifikasi toast di sudut kanan atas layar.
 * @param {string} message - Pesan yang ditampilkan
 * @param {'info'|'success'|'warn'|'error'} [type='info'] - Varian warna toast
 * @param {number} [duration=4000] - Durasi tampil dalam ms sebelum hilang
 */
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) { console.warn('Toast container tidak ditemukan.'); return; }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Auto-dismiss
  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}


function initSPA() {
  // Bind menu navigasi
  bindNavigation();

  // Bind drag & drop file upload
  initDropZone();

  // Bind input split slider
  const splitSlider = document.getElementById('split-slider');
  if (splitSlider) {
    splitSlider.addEventListener('input', (e) => {
      updateSplitLabels(e.target.value);
      updateSplitEst();
    });
  }

  // Bind strategy dropdown
  const mvSelect = document.getElementById('mv-strategy-select');
  if (mvSelect) {
    mvSelect.addEventListener('change', () => {
      StateManager.update('mvStrategy', mvSelect.value);
    });
  }

  // Bind split method dropdown (sebelumnya inline onchange)
  const splitMethodSelect = document.getElementById('split-method-select');
  if (splitMethodSelect) {
    splitMethodSelect.addEventListener('change', () => {
      updateSplitEst();
    });
  }

  // Bind tombol Pilih Semua / Bersihkan kolom fitur (sebelumnya inline onclick)
  const btnSelectAll = document.getElementById('btn-select-all-cols');
  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', () => setAllFeatureCols(true));
  }
  const btnClearAll = document.getElementById('btn-clear-all-cols');
  if (btnClearAll) {
    btnClearAll.addEventListener('click', () => setAllFeatureCols(false));
  }

  // Bind target/class column dropdown
  const classSelect = document.getElementById('class-col-select');
  if (classSelect) {
    classSelect.addEventListener('change', () => {
      handleClassColChange(classSelect.value);
    });
  }

  // Bind tombol run model
  const btnRun = document.getElementById('btn-run-model');
  if (btnRun) {
    btnRun.addEventListener('click', runActiveModel);
  }

  // Bind tombol ekspor excel
  const btnPlain = document.getElementById('btn-export-plain');
  if (btnPlain) {
    btnPlain.addEventListener('click', () => triggerExport('plain'));
  }
  const btnFormula = document.getElementById('btn-export-formula');
  if (btnFormula) {
    btnFormula.addEventListener('click', () => triggerExport('formula'));
  }

  // Bind tombol batal kalkulasi
  const btnCancel = document.getElementById('btn-cancel-calc');
  if (btnCancel) {
    btnCancel.addEventListener('click', cancelCalculation);
  }

  // Render menu sidebar & home cards dari daftar registry
  renderSidebarMenu();
  renderHomeCards();

  // Tampilkan halaman Beranda secara default
  switchView('home');
}

/**
 * Mengatur event click pada menu brand logo dan breadcrumb
 */
function bindNavigation() {
  // Sidebar brand logo — klik untuk kembali ke beranda
  const brand = document.getElementById('sidebar-home-btn');
  if (brand) {
    brand.addEventListener('click', () => switchView('home'));
  }
  
  // Breadcrumb home link
  const homeCrumb = document.getElementById('crumb-home');
  if (homeCrumb) {
    homeCrumb.addEventListener('click', () => switchView('home'));
  }
}

/**
 * Me-render menu navigasi algoritma di sidebar secara dinamis
 */
function renderSidebarMenu() {
  const container = document.getElementById('sidebar-menu');
  if (!container) return;

  // Kosongkan menu dinamis (sisakan Beranda)
  const items = container.querySelectorAll('.sidebar-item:not(.static-item)');
  items.forEach(el => el.remove());

  const plugins = registry.getAll();
  plugins.forEach(plugin => {
    const li = document.createElement('li');
    li.className = `sidebar-item plugin-item-${plugin.id}`;
    li.innerHTML = `
      <a href="#" data-plugin-id="${plugin.id}">
        <span class="sidebar-icon">${plugin.icon || '&#9670;'}</span>
        <span class="sidebar-text">${plugin.name}</span>
      </a>
    `;
    li.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      switchView(plugin.id);
    });
    container.appendChild(li);
  });
}

/**
 * Me-render kartu pilihan algoritma di halaman Beranda
 */
function renderHomeCards() {
  const container = document.getElementById('algo-cards-grid');
  if (!container) return;

  container.innerHTML = '';
  const plugins = registry.getAll();

  plugins.forEach(plugin => {
    const card = document.createElement('a');
    card.className = 'algo-card';
    card.href = '#';
    card.innerHTML = `
      <div class="algo-icon">${plugin.icon || '&#9670;'}</div>
      <div class="algo-name">${plugin.name}</div>
      <div class="algo-desc">${plugin.description || ''}</div>
      <div class="algo-badge badge-available">TERSEDIA</div>
    `;
    card.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(plugin.id);
    });
    container.appendChild(card);
  });
}

/**
 * Berpindah tampilan antara Beranda (Home) dan Workspace Algoritma
 * @param {string} viewId - ID algoritma aktif (atau 'home')
 */
function switchView(viewId) {
  const currentPluginId = StateManager.state.activePluginId;

  // Jika klik pada algoritma yang sama, jangan lakukan apa-apa
  if (currentPluginId === viewId) return;

  // Jika pindah ke algoritma lain dan ada data di workspace
  if (viewId !== 'home' && currentPluginId && StateManager.state.rawRows.length > 0) {
    const modal = document.getElementById('reset-workspace-modal');
    if (modal) {
      modal.hidden = false;
      
      // Cleanup previous listeners by cloning
      const btnCancel = document.getElementById('btn-modal-cancel');
      const btnReset = document.getElementById('btn-modal-reset');
      const btnKeep = document.getElementById('btn-modal-keep');
      
      const newCancel = btnCancel.cloneNode(true);
      const newReset = btnReset.cloneNode(true);
      const newKeep = btnKeep.cloneNode(true);
      
      btnCancel.replaceWith(newCancel);
      btnReset.replaceWith(newReset);
      btnKeep.replaceWith(newKeep);

      newCancel.addEventListener('click', () => {
        modal.hidden = true;
      });

      newReset.addEventListener('click', () => {
        modal.hidden = true;
        resetWorkspace();
        _doSwitchView(viewId);
      });

      newKeep.addEventListener('click', () => {
        modal.hidden = true;
        _doSwitchView(viewId);
      });
      
      return;
    }
  }

  // Normal flow
  _doSwitchView(viewId);
}

function resetWorkspace() {
  // Clear file input
  const fileInput = document.getElementById('dataset-upload');
  if (fileInput) fileInput.value = '';

  // Clear state
  StateManager.update('rawRows', []);
  StateManager.update('headers', []);
  StateManager.update('featureCols', []);
  StateManager.update('classCol', '');
  StateManager.update('lastResult', null);

  // Clear preview and results UI
  const previewSection = document.getElementById('preview-section');
  if (previewSection) previewSection.hidden = true;
  const resultSection = document.getElementById('result-section');
  if (resultSection) resultSection.hidden = true;
}

function _doSwitchView(viewId) {
  const homeSection = document.getElementById('home-section');
  const workspaceSection = document.getElementById('workspace-section');
  const resultSection = document.getElementById('result-section');
  const activeCrumb = document.getElementById('crumb-active');
  const sepCrumb = document.getElementById('crumb-sep');

  // Hapus kelas active di sidebar menu
  document.querySelectorAll('#sidebar-menu .sidebar-item').forEach(el => {
    el.classList.remove('active');
  });

  if (viewId === 'home' || !viewId) {
    StateManager.update('activePluginId', null);
    
    // Tampilkan home, sembunyikan workspace & hasil
    if (homeSection) homeSection.hidden = false;
    if (workspaceSection) workspaceSection.hidden = true;
    if (resultSection) resultSection.hidden = true;
    
    if (activeCrumb) activeCrumb.hidden = true;
    if (sepCrumb) sepCrumb.hidden = true;

    const homeItem = document.querySelector('.sidebar-item-home');
    if (homeItem) homeItem.classList.add('active');
  } else {
    const plugin = registry.get(viewId);
    if (!plugin) {
      console.error(`Algoritma [${viewId}] tidak ditemukan.`);
      return;
    }

    StateManager.update('activePluginId', viewId);

    // Tampilkan workspace, sembunyikan home & hasil lama (hanya Sembunyikan hasil lama jika ganti mode atau reset)
    if (homeSection) homeSection.hidden = true;
    if (workspaceSection) workspaceSection.hidden = false;

    // Bersihkan hasil kalkulasi lama jika berganti algoritma, walau data dipertahankan
    StateManager.update('lastResult', null);
    if (resultSection) resultSection.hidden = true;

    // Update Header Workspace
    document.getElementById('current-algo-title').innerHTML = `<strong>${plugin.name}</strong>`;
    document.getElementById('current-algo-desc').textContent = plugin.description || '';
    
    // Sesuaikan Label & Control UI berdasarkan mode algoritma
    const featureColTitle = document.getElementById('feature-col-title');
    const targetColGroup = document.getElementById('target-col-group');
    const splitSliderGroup = document.getElementById('split-slider-group');
    const splitMethodSelect = document.getElementById('split-method-select');
    const mvStrategySelect = document.getElementById('mv-strategy-select');

    // Cek capabilities (Default: assumes target is required)
    const requiresTarget = plugin.uiCapabilities ? plugin.uiCapabilities.requiresTarget : true;
    if (targetColGroup) {
      targetColGroup.style.display = requiresTarget ? 'block' : 'none';
    }

    if (plugin.uiMode === 'forecasting') {
      if (featureColTitle) featureColTitle.textContent = 'Pilih Kolom Tanggal (Waktu)';
      if (splitSliderGroup) splitSliderGroup.style.display = 'none'; // Sembunyikan random split
      if (splitMethodSelect) {
        splitMethodSelect.value = 'time';
        splitMethodSelect.disabled = true; // Kunci ke time-based
      }
      if (mvStrategySelect && (mvStrategySelect.value === 'mode' || mvStrategySelect.value === 'median')) {
         mvStrategySelect.value = 'ffill'; // Default untuk time series
      }
    } else if (plugin.uiMode === 'association') {
      if (featureColTitle) featureColTitle.textContent = 'Pilih Kolom Transaksi';
      if (splitSliderGroup) splitSliderGroup.style.display = 'none';
      if (splitMethodSelect) {
        splitMethodSelect.value = 'none';
        splitMethodSelect.disabled = true;
      }
    } else if (plugin.uiMode === 'clustering') {
      // K-Means mendukung split untuk evaluasi silhouette & DBI
      if (featureColTitle) featureColTitle.textContent = 'Pilih Fitur (Feature Columns)';
      if (splitSliderGroup) splitSliderGroup.style.display = 'block';
      if (splitMethodSelect) {
        splitMethodSelect.disabled = false;
        if (splitMethodSelect.value === 'time' || splitMethodSelect.value === 'stratified') {
          splitMethodSelect.value = 'random';
        }
      }
      if (mvStrategySelect && (mvStrategySelect.value === 'ffill' || mvStrategySelect.value === 'interpolate')) {
         mvStrategySelect.value = 'mode';
      }
    } else {
      // classification, regression
      if (featureColTitle) featureColTitle.textContent = 'Pilih Fitur (Feature Columns)';
      if (splitSliderGroup) splitSliderGroup.style.display = 'block';
      if (splitMethodSelect) {
        splitMethodSelect.disabled = false;
        if (splitMethodSelect.value === 'time' || splitMethodSelect.value === 'none') {
           splitMethodSelect.value = 'random';
        }
      }
      if (mvStrategySelect && (mvStrategySelect.value === 'ffill' || mvStrategySelect.value === 'interpolate')) {
         mvStrategySelect.value = 'mode';
      }
    }

    // Update breadcrumb
    if (sepCrumb) sepCrumb.hidden = false;
    if (activeCrumb) {
      activeCrumb.hidden = false;
      activeCrumb.textContent = plugin.name;
    }

    // Set menu aktif di sidebar
    const menuItem = document.querySelector(`.plugin-item-${plugin.id}`);
    if (menuItem) menuItem.classList.add('active');

    // Build form konfigurasi dinamis
    renderDynamicForm(plugin.configSchema);

    // Reset warnings
    updateValidationWarnings();

    // Sesuaikan ulang pilihan kolom jika dataset sudah dimuat
    if (StateManager.state.rawRows.length > 0) {
      _reAutoSelectColumns(plugin);
    }
  }
}

/**
 * Membuat form input konfigurasi berdasarkan skema konfigurasi plugin
 * @param {object} schema - Skema konfigurasi dari plugin
 */
function renderDynamicForm(schema) {
  const container = document.getElementById('dynamic-config-form');
  if (!container) return;
  container.innerHTML = '';

  if (!schema) return;

  const grid = document.createElement('div');
  grid.className = 'config-form-grid';

  Object.entries(schema).forEach(([key, field]) => {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';

    const label = document.createElement('label');
    label.setAttribute('for', `cfg-${key}`);
    label.textContent = field.label;
    formGroup.appendChild(label);

    let inputEl;
    if (field.type === 'select') {
      inputEl = document.createElement('select');
      inputEl.id = `cfg-${key}`;
      field.options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === field.default) option.selected = true;
        inputEl.appendChild(option);
      });
      
      // Jika ada child dependency (misal Minkowski p hanya muncul saat jarak Minkowski dipilih)
      inputEl.addEventListener('change', () => {
        handleDependencyTrigger(schema);
      });
    } else if (field.type === 'number') {
      inputEl = document.createElement('input');
      inputEl.id = `cfg-${key}`;
      inputEl.type = 'number';
      if (field.min !== undefined) inputEl.min = field.min;
      if (field.max !== undefined) inputEl.max = field.max;
      if (field.step !== undefined) inputEl.step = field.step;
      inputEl.value = field.default;
    } else if (field.type === 'text') {
      inputEl = document.createElement('input');
      inputEl.id = `cfg-${key}`;
      inputEl.type = 'text';
      inputEl.value = field.default || '';
    } else if (field.type === 'checkbox') {
      // Wrapper horizontal
      formGroup.className = 'form-group form-group-row';
      inputEl = document.createElement('input');
      inputEl.id = `cfg-${key}`;
      inputEl.type = 'checkbox';
      inputEl.checked = !!field.default;
    }

    if (inputEl) {
      formGroup.appendChild(inputEl);
      grid.appendChild(formGroup);
    }
  });

  container.appendChild(grid);
  
  // Trigger trigger dependency agar input yang tidak relevan tersembunyi sejak awal
  handleDependencyTrigger(schema);
}

/**
 * Menyembunyikan atau menampilkan parameter berdasarkan properti dependsOn di skema
 */
function handleDependencyTrigger(schema) {
  if (!schema) return;
  
  Object.entries(schema).forEach(([key, field]) => {
    if (field.dependsOn) {
      const parentEl = document.getElementById(`cfg-${field.dependsOn.field}`);
      const childGroup = document.getElementById(`cfg-${key}`)?.closest('.form-group');
      if (parentEl && childGroup) {
        if (parentEl.value === field.dependsOn.value) {
          childGroup.style.display = 'block';
        } else {
          childGroup.style.display = 'none';
        }
      }
    }
  });

  // Backward compatibility for Minkowski p (KNN)
  const metricSelect = document.getElementById('cfg-metric');
  const pGroup = document.getElementById('cfg-p')?.closest('.form-group');
  
  if (metricSelect && pGroup) {
    if (metricSelect.value === 'minkowski') {
      pGroup.style.display = 'flex';
    } else {
      pGroup.style.display = 'none';
    }
  }
}

/**
 * Menginisialisasi Drag & Drop Zone untuk file CSV
 */
function initDropZone() {
  const zone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('csv-input');
  
  if (!zone || !fileInput) return;

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    
    const file = e.dataTransfer.files[0];
    if (file) handleCSVFile(file);
  });

  // Upload zone sudah dalam <label for="csv-input">, jadi klik otomatis membuka file picker
  // Tidak perlu manual fileInput.click()

  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleCSVFile(file);
  });
}

/**
 * Membaca berkas CSV dan memprosesnya
 * @param {File} file - Berkas CSV dari upload
 */
function handleCSVFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const text = e.target.result;
      const { headers, rawRows } = parseCSV(text);
      
      // Update State
      StateManager.reset();
      StateManager.update('headers', headers);
      StateManager.update('rawRows', rawRows);
      
      // Cek apakah plugin aktif adalah mode forecasting
      const activePluginId = StateManager.state.activePluginId;
      const activePlugin = activePluginId ? registry.get(activePluginId) : null;
      const isForecastingMode = activePlugin && activePlugin.uiMode === 'forecasting';

      if (isForecastingMode) {
        // --- Mode Forecasting ---
        // Deteksi kolom tanggal (cari kolom yang sebagian besar nilainya terparsing sebagai tanggal valid)
        const dateCol = _detectDateColumn(headers, rawRows);
        
        // Deteksi kolom numerik pertama (bukan kolom tanggal) sebagai target nilai
        const numericCols = headers.filter(h => h !== dateCol && rawRows.slice(0, 10).every(r => !isNaN(parseFloat(r[h])) && r[h] !== ''));
        const defaultTarget = numericCols[0] || headers.find(h => h !== dateCol) || headers[headers.length - 1];

        StateManager.update('classCol', defaultTarget);
        StateManager.update('featureCols', dateCol ? [dateCol] : []);
      } else {
        // --- Mode Classification / Regression (perilaku asli) ---
        // Pilih kolom kelas (default: kolom terakhir)
        const defaultClass = headers[headers.length - 1];
        StateManager.update('classCol', defaultClass);
        
        // Pilih seluruh kolom fitur kecuali kolom kelas
        const defaultFeatures = headers.filter(h => h !== defaultClass);
        StateManager.update('featureCols', defaultFeatures);
      }

      // Render visual preview
      renderDatasetPreview();
      
      const prevSection = document.getElementById('preview-section');
      if (prevSection) prevSection.hidden = false;

      // Update split & warnings
      updateSplitEst();
      updateValidationWarnings();

    } catch (err) {
      showToast(`Gagal memuat CSV: ${err.message}`, 'error');
    }
  };
  reader.readAsText(file);
}

/**
 * Me-render pratinjau tabel dataset mentah dan dropdown pilihan kolom target/kelas
 */
function renderDatasetPreview() {
  const headers = StateManager.state.headers;
  const rawRows = StateManager.state.rawRows;
  
  // Render info badge
  const infoSpan = document.getElementById('preview-info');
  if (infoSpan) {
    infoSpan.innerHTML = `<span class="chip chip-ok">&#10003; ${rawRows.length} baris, ${headers.length} kolom</span>`;
  }

  // Render dropdown pilihan target/kelas
  const classSelect = document.getElementById('class-col-select');
  if (classSelect) {
    classSelect.innerHTML = headers.map(h => 
      `<option value="${h}" ${h === StateManager.state.classCol ? 'selected' : ''}>${h}</option>`
    ).join('');
  }

  // Render tabel data (maks 8 baris)
  const tbl = document.getElementById('preview-table');
  if (tbl) {
    const maxPreview = 8;
    let html = '<thead><tr>';
    headers.forEach(h => {
      html += `<th>${escapeHTML(h)}</th>`;
    });
    html += '</tr></thead><tbody>';

    rawRows.slice(0, maxPreview).forEach(row => {
      html += '<tr>';
      headers.forEach(h => {
        html += `<td>${escapeHTML(row[h])}</td>`;
      });
      html += '</tr>';
    });

    if (rawRows.length > maxPreview) {
      html += `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--text3);font-size:13px;padding:6px 12px;">... ${rawRows.length - maxPreview} baris lainnya</td></tr>`;
    }
    html += '</tbody>';
    tbl.innerHTML = html;
  }

  // Render checkbox pemilih kolom fitur
  renderColumnSelector();
}

/**
 * Membuat checkbox pemilih kolom fitur (Feature Selector)
 */
function renderColumnSelector() {
  const container = document.getElementById('col-checkboxes');
  if (!container) return;
  container.innerHTML = '';

  const headers = StateManager.state.headers;
  const rawRows = StateManager.state.rawRows;
  const classCol = StateManager.state.classCol;
  const featureCols = StateManager.state.featureCols;

  // Cek apakah plugin aktif membutuhkan target
  const activePluginId = StateManager.state.activePluginId;
  const activePlugin = activePluginId ? registry.get(activePluginId) : null;
  const requiresTarget = activePlugin?.uiCapabilities
    ? activePlugin.uiCapabilities.requiresTarget
    : true;

  // Update label hint kelas (hanya tampil jika ada target)
  const labelHint = document.getElementById('class-col-label-hint');
  if (labelHint) labelHint.textContent = requiresTarget ? classCol : '';

  headers.forEach(h => {
    // Jika kolom ini adalah kolom target DAN algoritma memerlukan target,
    // tampilkan sebagai pill kelas (non-checkable)
    if (h === classCol && requiresTarget) {
      const pill = document.createElement('label');
      pill.className = 'col-pill is-class';
      pill.innerHTML = `<span class="pill-icon">&#9650;</span> ${escapeHTML(h)} <span class="pill-type">target</span>`;
      container.appendChild(pill);
      return;
    }

    // Deteksi jika numerik murni
    const isNumeric = rawRows.every(r => r[h] === '' || r[h] == null || !isNaN(parseFloat(r[h])));
    const isChecked = featureCols.includes(h);

    const pill = document.createElement('label');
    pill.className = 'col-pill' + (isChecked ? ' checked' : '');
    pill.innerHTML = `
      <input type="checkbox" value="${escapeHTML(h)}" ${isChecked ? 'checked' : ''}>
      <span class="pill-icon">${isNumeric ? '&#9632;' : '&#9670;'}</span>
      ${escapeHTML(h)}
      <span class="pill-type">${isNumeric ? 'num' : 'cat'}</span>
    `;

    const input = pill.querySelector('input');
    input.addEventListener('change', () => {
      if (input.checked) {
        pill.classList.add('checked');
        if (!featureCols.includes(h)) featureCols.push(h);
      } else {
        pill.classList.remove('checked');
        const idx = featureCols.indexOf(h);
        if (idx !== -1) featureCols.splice(idx, 1);
      }
      StateManager.update('featureCols', featureCols);
      updateValidationWarnings();
    });

    container.appendChild(pill);
  });
}

/**
 * Menangani perubahan pilihan kolom kelas/target
 * @param {string} newClassCol - Kolom target baru
 */
function handleClassColChange(newClassCol) {
  StateManager.update('classCol', newClassCol);

  // Otomatis hapus kolom kelas baru dari daftar fitur aktif
  let featureCols = StateManager.state.featureCols;
  featureCols = featureCols.filter(f => f !== newClassCol);
  
  // Jika kolom kelas yang lama sekarang kosong dari target, dapat dipertimbangkan masuk kembali ke fitur (opsional)
  // Tetapi agar aman, biarkan user mengaktifkannya kembali secara manual melalui checkbox.
  StateManager.update('featureCols', featureCols);

  renderColumnSelector();
  updateSplitEst();
  updateValidationWarnings();
}

/**
 * Mengatur semua checkbox kolom (Pilih Semua / Bersihkan)
 * @param {boolean} checkAll - status checked
 */
function setAllFeatureCols(checkAll) {
  const headers = StateManager.state.headers;
  const classCol = StateManager.state.classCol;
  
  let featureCols = [];
  if (checkAll) {
    featureCols = headers.filter(h => h !== classCol);
  }
  StateManager.update('featureCols', featureCols);
  
  renderColumnSelector();
  updateValidationWarnings();
}

/**
 * Memperbarui label visual persentase Split data
 * @param {string} val - Nilai persentase training (0-100)
 */
function updateSplitLabels(val) {
  const pTrain = parseInt(val);
  const pTest = 100 - pTrain;
  
  document.getElementById('split-label-train').textContent = pTrain + '%';
  document.getElementById('split-label-test').textContent = pTest + '%';
  document.getElementById('split-label-train-bar').textContent = pTrain + '%';
  document.getElementById('split-label-test-bar').textContent = pTest + '%';
  document.getElementById('split-bar-train').style.width = pTrain + '%';
  document.getElementById('split-bar-test').style.width = pTest + '%';
  
  StateManager.update('testRatio', pTest / 100);
}

/**
 * Memperbarui estimasi jumlah baris training/testing
 */
function updateSplitEst() {
  const el = document.getElementById('split-est-rows');
  if (!el) return;

  const rows = StateManager.state.rawRows;
  if (rows.length === 0) {
    el.textContent = '≈ 0 train / 0 test';
    return;
  }

  const splitSlider = document.getElementById('split-slider');
  const pTrain = splitSlider ? parseInt(splitSlider.value) : 80;
  const pTest = 100 - pTrain;
  
  // Hitung persentase
  const testRatio = pTest / 100;
  const splitMethod = document.getElementById('split-method-select')?.value || 'random';
  
  if (splitMethod === 'none') {
    el.textContent = `≈ ${rows.length} train / 0 test (Tanpa Split)`;
    return;
  }
  
  if (splitMethod === 'time') {
    el.textContent = `≈ ${rows.length} historis (Forecasting)`;
    return;
  }

  const n = rows.length;
  const nTest = Math.max(1, Math.round(n * testRatio));
  const nTrain = n - nTest;

  el.textContent = `≈ ${nTrain} train / ${nTest} test`;
}

/**
 * Melakukan validasi kesiapan algoritma dan menampilkan peringatan jika ada konfigurasi yang kurang
 */
function updateValidationWarnings() {
  const warnDiv = document.getElementById('col-selector-warn');
  if (!warnDiv) return;
  warnDiv.innerHTML = '';

  const activePluginId = StateManager.state.activePluginId;
  const featureCols = StateManager.state.featureCols;
  const rawRows = StateManager.state.rawRows;

  if (rawRows.length === 0) {
    return; // Belum upload data, tidak perlu tampilkan warning dulu
  }

  const plugin = registry.get(activePluginId);
  const uiMode = plugin ? plugin.uiMode : 'classification';

  if (uiMode === 'forecasting') {
    if (featureCols.length !== 1) {
      warnDiv.innerHTML = '<div class="warn-box">&#9888; Forecasting membutuhkan tepat 1 kolom tanggal/waktu sebagai fitur.</div>';
      return;
    }
  } else {
    if (featureCols.length === 0) {
      warnDiv.innerHTML = '<div class="warn-box">&#9888; Pilih setidaknya 1 kolom fitur untuk perhitungan model.</div>';
      return;
    }
  }

  // Validasi khusus algoritma
  if (activePluginId === 'knn' || activePluginId === 'regression' || activePluginId === 'kmeans') {
    // K-NN, Regresi, & K-Means membutuhkan fitur numerik
    const hasNumeric = featureCols.some(c => 
      rawRows.every(r => r[c] === '' || r[c] == null || !isNaN(parseFloat(r[c])))
    );
    if (!hasNumeric) {
      warnDiv.innerHTML = `<div class="warn-box">&#9888; Algoritma ini membutuhkan setidaknya 1 kolom fitur bernilai numerik murni.</div>`;
    }
  }
}

/**
 * Menjalankan perhitungan algoritma terpilih melalui Web Worker asinkron
 */
function runActiveModel() {
  const state = StateManager.state;
  if (state.rawRows.length === 0) {
    showToast('Upload dataset CSV terlebih dahulu.', 'warn');
    return;
  }

  if (state.featureCols.length === 0) {
    showToast('Pilih setidaknya 1 kolom fitur.', 'warn');
    return;
  }

  const plugin = registry.get(state.activePluginId);
  if (!plugin) return;

  // Baca input form dinamis
  const config = {};
  if (plugin.configSchema) {
    Object.keys(plugin.configSchema).forEach(key => {
      const input = document.getElementById(`cfg-${key}`);
      if (input) {
        if (input.type === 'checkbox') {
          config[key] = input.checked;
        } else if (input.type === 'number') {
          config[key] = parseFloat(input.value);
        } else {
          config[key] = input.value;
        }
      }
    });
  }

  // Tambahkan general parameters ke config
  const splitMethod = document.getElementById('split-method-select')?.value || 'random';
  const splitSeed = parseInt(document.getElementById('split-seed-input')?.value || '42');
  const testRatio = splitMethod === 'none' ? 0 : state.testRatio;

  // Ekstraksi path plugin (relative ke worker script: src/shared/generic_worker.js)
  // File worker ada di src/shared/generic_worker.js
  // File plugin ada di src/plugins/id/id_plugin.js
  // Ekstraksi path plugin (relative ke worker script: src/shared/generic_worker.js)
  // Jika plugin mendefinisikan `pluginFolder`, path-nya disesuaikan (misal: forecasting/sma)
  // Jika tidak, default ke konvensi lama: plugins/{id}/{id}_plugin.js
  const pluginFolder = plugin.pluginFolder || plugin.id;
  const pluginPath = `../plugins/${pluginFolder}/${plugin.id}_plugin.js`;

  // Tampilkan loading overlay
  showLoading(true, `Menyiapkan ${plugin.name}...`, 'Melakukan preprocessing data...');

  try {
    // 1. Data Cleaning (Imputasi / Drop)
    const mvStrategy = document.getElementById('mv-strategy-select').value;
    const { cleanRows, report, colTypes } = cleanData(state.rawRows, state.headers, mvStrategy);
    
    StateManager.update('cleanRows', cleanRows);
    StateManager.update('cleanReport', report);
    StateManager.update('colTypes', Object.values(colTypes));

    // 2. Train/Test Split
    // 2. Train/Test Split — Forecasting menggunakan seluruh data historis (tanpa random split)
    let trainRows, testRows;
    if (plugin.uiMode === 'forecasting') {
      // Validasi: Pastikan kolom nilai target adalah numerik
      const valCol = state.classCol;
      const nonNumericRows = cleanRows.filter(r => {
        const v = r[valCol];
        return v === '' || v == null || isNaN(parseFloat(v));
      });
      if (nonNumericRows.length === cleanRows.length) {
        throw new Error(`Kolom target "${valCol}" tidak mengandung nilai numerik. Pastikan Anda memilih kolom angka (bukan teks/boolean) sebagai "Kolom Nilai Aktual".`);
      }
      trainRows = cleanRows;
      testRows  = [];
    } else {
      const split = splitData(cleanRows, state.classCol, testRatio, splitSeed, splitMethod);
      trainRows = split.train;
      testRows  = split.test;
    }
    
    StateManager.update('trainRows', trainRows);
    StateManager.update('testRows', testRows);

    // 3. Persiapkan payload worker
    const payload = {
      pluginId: plugin.id,
      pluginPath: pluginPath,
      trainRows: trainRows,
      testRows: testRows,
      classCol: state.classCol,
      featureCols: state.featureCols,
      config: config,
      seed: splitSeed,
      testRatio: testRatio,
      splitMethod: splitMethod,
      rawRows: cleanRows // untuk mempermudah preprocessing/normalisasi
    };

    // 4. Panggil Web Worker melalui factory
    StateManager.update('isCalculating', true);
    
    const worker = WorkerFactory.getWorker((msg) => {
      handleWorkerMessage(msg, plugin);
    });

    worker.postMessage({
      type: 'RUN',
      payload: payload
    });

  } catch (err) {
    showLoading(false);
    showToast(`Kesalahan inisialisasi: ${err.message}`, 'error');
  }
}

/**
 * Menerima dan menangani pesan callback dari Web Worker
 */
function handleWorkerMessage(msg, plugin) {
  switch (msg.type) {
    case 'PROGRESS':
      showLoading(true, msg.step || 'Pemrosesan', msg.message || '', msg.pct || 0);
      break;
    case 'DONE':
      showLoading(false);
      StateManager.update('isCalculating', false);
      StateManager.update('lastResult', msg.result);
      
      // Render hasil kalkulasi manual
      renderCalculationResult(plugin, msg.result);
      break;
    case 'ERROR':
      showLoading(false);
      StateManager.update('isCalculating', false);
      showToast(`Perhitungan gagal: ${msg.message}`, 'error');
      break;
  }
}

/**
 * Menampilkan loading overlay beserta status progress komputasi
 * @param {boolean} visible - Tampilkan atau sembunyikan
 * @param {string} title - Judul status
 * @param {string} message - Detail status
 * @param {number} pct - Persentase kemajuan (0-100)
 */
function showLoading(visible, title = '', message = '', pct = 0) {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;

  if (visible) {
    overlay.classList.add('active');
    document.getElementById('loader-title').textContent = title;
    document.getElementById('loader-msg').textContent = message;
    
    const fill = document.getElementById('progress-bar-fill');
    if (fill) fill.style.width = `${pct}%`;
    
    const pctSpan = document.getElementById('progress-pct');
    if (pctSpan) pctSpan.textContent = `${pct}%`;
  } else {
    overlay.classList.remove('active');
  }
}

/**
 * Membatalkan proses perhitungan model yang sedang berlangsung
 */
function cancelCalculation() {
  WorkerFactory.terminate();
  StateManager.update('isCalculating', false);
  showLoading(false);
  console.log('Perhitungan dibatalkan oleh pengguna.');
}

/**
 * Me-render output HTML visualisasi hasil perhitungan plugin ke penampung halaman shell
 * @param {AlgorithmPlugin} plugin - Plugin aktif
 * @param {object} result - Hasil komputasi dari Worker
 */
function renderCalculationResult(plugin, result) {
  const section = document.getElementById('result-section');
  const container = document.getElementById('result-container');
  
  if (!section || !container) return;

  container.innerHTML = '';
  
  try {
    // Jalankan renderHTML milik plugin
    plugin.renderHTML(result, container);
    
    // Tampilkan bagian hasil
    section.hidden = false;
    
    // Scroll mulus ke panel hasil
    section.scrollIntoView({ behavior: 'smooth' });
    
  } catch (err) {
    container.innerHTML = `<div class="warn-box">&#9888; Gagal merender tampilan hasil: ${err.message}</div>`;
    section.hidden = false;
  }
}

/**
 * Menjalankan fungsi ekspor file spreadsheet (.xlsx) dari plugin aktif
 * @param {string} mode - Mode ekspor ('plain' | 'formula')
 */
function triggerExport(mode) {
  const state = StateManager.state;
  if (!state.lastResult) {
    showToast('Jalankan kalkulasi model terlebih dahulu sebelum mengekspor.', 'warn');
    return;
  }

  const plugin = registry.get(state.activePluginId);
  if (!plugin) return;

  try {
    const WB = plugin.exportExcel(state.lastResult, mode);
    if (!WB) return;

    const filename = `${plugin.id.toUpperCase()}_Calculator_${mode === 'formula' ? 'Formula' : 'Plain'}.xlsx`;
    saveWB(WB, filename);
  } catch (err) {
    showToast(`Gagal mengekspor berkas Excel: ${err.message}`, 'error');
  }
}

// Event listeners sudah di-bind via addEventListener di initSPA()
// Tidak perlu mengekspos setAllFeatureCols ke window lagi.

/**
 * Mendeteksi kolom yang berisi data tanggal/waktu dari header dan baris sampel
 * @param {Array} headers - Daftar nama kolom
 * @param {Array} rawRows - Baris sampel dataset
 * @returns {string|null} Nama kolom tanggal yang terdeteksi, atau null jika tidak ada
 */
function _detectDateColumn(headers, rawRows) {
  const sample = rawRows.slice(0, Math.min(rawRows.length, 10));
  for (const h of headers) {
    const validDates = sample.filter(r => {
      const v = r[h];
      if (!v || v === '') return false;
      const d = new Date(v);
      return !isNaN(d.getTime());
    });
    // Jika >60% baris sampel valid sebagai tanggal, anggap kolom ini sebagai kolom waktu
    if (validDates.length / sample.length >= 0.6) {
      return h;
    }
  }
  return null;
}

/**
 * Menyesuaikan ulang pilihan kolom saat berganti plugin dengan uiMode berbeda
 * Dipanggil dari switchView() saat data sudah dimuat.
 * @param {object} plugin - Instance plugin yang baru saja diaktifkan
 */
function _reAutoSelectColumns(plugin) {
  const { headers, rawRows } = StateManager.state;
  if (!headers || headers.length === 0) return;

  const requiresTarget = plugin.uiCapabilities
    ? plugin.uiCapabilities.requiresTarget
    : true;

  if (plugin.uiMode === 'forecasting') {
    const dateCol = _detectDateColumn(headers, rawRows);
    const numericCols = headers.filter(h => h !== dateCol && rawRows.slice(0, 10).every(r => !isNaN(parseFloat(r[h])) && r[h] !== ''));
    const defaultTarget = numericCols[0] || headers.find(h => h !== dateCol) || headers[headers.length - 1];
    StateManager.update('classCol', defaultTarget || '');
    StateManager.update('featureCols', dateCol ? [dateCol] : []);

  } else if (!requiresTarget) {
    // Association (Apriori) atau Clustering (K-Means) — tidak ada target/kelas
    // Kosongkan classCol dan jadikan semua kolom sebagai fitur potensial
    StateManager.update('classCol', '');
    StateManager.update('featureCols', [...headers]);

  } else {
    // Classification / Regression — default ke kolom terakhir sebagai target
    const defaultClass = headers[headers.length - 1];
    StateManager.update('classCol', defaultClass);
    StateManager.update('featureCols', headers.filter(h => h !== defaultClass));
  }

  renderDatasetPreview();
  updateSplitEst();
  updateValidationWarnings();
}
