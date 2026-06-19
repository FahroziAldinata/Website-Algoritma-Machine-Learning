/* ================================================================
   COL SELECTOR — render pill checkbox untuk tiap kolom
================================================================ */
function renderColSelector() {
  const classIdx = parseInt(document.getElementById('class-col-select').value);
  const classCol = headers[classIdx];

  // Update hint label
  const hint = document.getElementById('class-col-label-hint');
  if (hint) hint.textContent = classCol;

  const container = document.getElementById('col-checkboxes');
  if (!container) return;

  // Ambil state centang sebelumnya (untuk preserve pilihan user saat ganti class col)
  const prevState = {};
  container.querySelectorAll('.col-pill[data-col]').forEach(pill => {
    prevState[pill.dataset.col] = pill.classList.contains('checked');
  });

  // Deteksi kolom yang kemungkinan besar ID/nama (heuristik):
  // - nama kolom mengandung kata: id, no, nomor, nama, name, kode, code, index, serial, uuid
  // - seluruh nilainya unik (cardinality = total baris)
  const suspectKeywords = /^(id|no|nomor|nomer|nama|name|kode|code|index|serial|uuid|seq|row|num)$/i;
  const suspectContains = /(^|\s|_|-)(id|no|nama|name|kode|code|index|serial|uuid)($|\s|_|-)/i;

  function isSuspectCol(colName, colIdx) {
    if (suspectKeywords.test(colName.trim())) return true;
    if (suspectContains.test(colName)) return true;
    // Cek cardinality: jika semua nilai unik → kemungkinan ID
    const vals = csvData.map(r => r[colIdx]);
    const unique = new Set(vals);
    if (unique.size === csvData.length && csvData.length > 4) return true;
    return false;
  }

  container.innerHTML = headers.map((h, i) => {
    const isClass = i === classIdx;

    if (isClass) {
      return `<label class="col-pill is-class" title="Kolom ini adalah label/kelas target">
        <span class="pill-icon">&#9670;</span>
        <span>${h}</span>
        <span class="pill-type">kelas</span>
      </label>`;
    }

    // Tentukan state awal: preserve jika pernah di-set user, otherwise deteksi otomatis
    let checked;
    if (h in prevState) {
      checked = prevState[h];
    } else {
      // Auto-uncheck jika dicurigai sebagai ID/nama
      checked = !isSuspectCol(h, i);
    }

    // Deteksi tipe kolom untuk label kecil
    const isNum = cleanReport && cleanReport.colTypes && cleanReport.colTypes[i] === 'numeric';
    const typeLabel = isNum ? 'num' : 'kat';
    const typeColor = isNum ? 'color:var(--accent)' : 'color:var(--yellow)';

    const autoWarning = !checked ? ' title="Kolom ini dideteksi sebagai ID/Nama dan dinonaktifkan otomatis. Klik untuk mengaktifkan."' : '';

    return `<label class="col-pill ${checked ? 'checked' : ''}" data-col="${h}" data-idx="${i}"
              onclick="toggleColPill(this)"${autoWarning}>
        <input type="checkbox" ${checked ? 'checked' : ''}>
        <span class="pill-icon">${checked ? '&#10003;' : '&#10005;'}</span>
        <span>${h}</span>
        <span class="pill-type" style="${typeColor}">${typeLabel}</span>
      </label>`;
  }).join('');

  updateColSelectorWarn();
}

function toggleColPill(pill) {
  if (pill.classList.contains('is-class')) return;
  const cb = pill.querySelector('input[type=checkbox]');
  const nowChecked = !cb.checked;
  cb.checked = nowChecked;
  pill.classList.toggle('checked', nowChecked);
  pill.querySelector('.pill-icon').innerHTML = nowChecked ? '&#10003;' : '&#10005;';
  updateColSelectorWarn();
}

function setAllCols(state) {
  const classIdx = parseInt(document.getElementById('class-col-select').value);
  document.querySelectorAll('.col-pill[data-col]').forEach(pill => {
    if (pill.classList.contains('is-class')) return;
    const cb = pill.querySelector('input[type=checkbox]');
    cb.checked = state;
    pill.classList.toggle('checked', state);
    pill.querySelector('.pill-icon').innerHTML = state ? '&#10003;' : '&#10005;';
  });
  updateColSelectorWarn();
}

function updateColSelectorWarn() {
  const warn = document.getElementById('col-selector-warn');
  if (!warn) return;
  const checked = document.querySelectorAll('.col-pill[data-col].checked').length;
  const total   = document.querySelectorAll('.col-pill[data-col]').length;
  const excluded = total - checked;

  if (checked === 0) {
    warn.innerHTML = `<span style="color:var(--red);font-size:17px">&#9888; Minimal 1 kolom fitur harus dipilih!</span>`;
  } else if (excluded > 0) {
    warn.innerHTML = `<span style="color:var(--yellow);font-size:17px">
      &#9998; ${checked} fitur dipilih &nbsp;&middot;&nbsp;
      <strong style="color:var(--red)">${excluded} kolom diabaikan</strong>
      (tidak akan diproses)
    </span>`;
  } else {
    warn.innerHTML = `<span style="color:var(--green);font-size:17px">&#10003; Semua ${checked} kolom fitur dipilih</span>`;
  }
}

/* ================================================================
   AMBIL KOLOM FITUR YANG AKTIF (dicentang user)
================================================================ */
function getActiveFeatureCols() {
  const classIdx = parseInt(document.getElementById('class-col-select').value);
  const active = [];
  document.querySelectorAll('.col-pill[data-col].checked').forEach(pill => {
    const idx = parseInt(pill.dataset.idx);
    if (idx !== classIdx) active.push({ name: headers[idx], idx });
  });
  return active;  // array of { name, idx }
}