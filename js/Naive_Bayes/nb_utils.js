/* ================================================================
   nb_utils.js
   ----------------------------------------------------------------
   CATATAN UNTUK PENGEMBANG:
   - File ini HARUS di-load PERTAMA sebelum file nb_*.js lainnya
   - Semua state global (csvData, headers, lastResult) ada di sini
   - Tidak ada DOM event listener di file ini — murni fungsi & data
================================================================ */


/* ================================================================
   ① SAMPLE DATASETS
   ─────────────────
   Dua dataset bawaan yang bisa dimuat tanpa upload file CSV.
   Digunakan oleh fungsi loadSample() di nb_io.js.
================================================================ */
const SAMPLES = {
  cuaca: `Cuaca,Suhu,Kelembaban,Angin,Main
Cerah,Panas,Tinggi,Lemah,Tidak
Cerah,Panas,Tinggi,Kuat,Tidak
Mendung,Panas,Tinggi,Lemah,Ya
Hujan,Sedang,Tinggi,Lemah,Ya
Hujan,Dingin,Normal,Lemah,Ya
Hujan,Dingin,Normal,Kuat,Tidak
Mendung,Dingin,Normal,Kuat,Ya
Cerah,Sedang,Tinggi,Lemah,Tidak
Cerah,Dingin,Normal,Lemah,Ya
Hujan,Sedang,Normal,Lemah,Ya
Cerah,Sedang,Normal,Kuat,Ya
Mendung,Sedang,Tinggi,Kuat,Ya
Mendung,Panas,Normal,Lemah,Ya
Hujan,Sedang,Tinggi,Kuat,Tidak`,

  buah: `Warna,Bentuk,Ukuran,Tekstur,Buah
Merah,Bulat,Besar,Halus,Apel
Merah,Bulat,Sedang,Halus,Apel
Kuning,Lonjong,Sedang,Halus,Pisang
Kuning,Lonjong,Besar,Kasar,Pisang
Hijau,Bulat,Kecil,Kasar,Jeruk
Orange,Bulat,Sedang,Kasar,Jeruk
Merah,Lonjong,Kecil,Halus,Apel
Kuning,Bulat,Sedang,Halus,Pisang
Hijau,Bulat,Sedang,Kasar,Jeruk
Orange,Lonjong,Besar,Halus,Pisang
Merah,Bulat,Kecil,Halus,Apel
Hijau,Lonjong,Sedang,Kasar,Jeruk`
};


/* ================================================================
   ② STATE GLOBAL
   ──────────────
   Variabel yang diakses & dimodifikasi oleh SEMUA file nb_*.js.
   Diletakkan di sini agar ada satu sumber kebenaran (single source
   of truth) dan tidak perlu passing antar fungsi panjang-panjang.

   csvData    → array of arrays: isi baris CSV setelah dibersihkan
   headers    → array string: nama kolom CSV (baris pertama)
   lastResult → object hasil kalkulasi _runNB(), dipakai export Excel
   sheetName  → nama sheet data di Excel (statis, jangan diubah)
================================================================ */
let csvData    = [];
let headers    = [];
let lastResult = null;
const sheetName = 'Sheet1';   // nama Sheet 1 selalu statis — jangan diubah


/* ================================================================
   ③ colLetter(idx)
   ────────────────
   Mengkonversi indeks kolom 0-based ke huruf kolom Excel.
   Contoh: 0 → "A", 1 → "B", 25 → "Z", 26 → "AA", 27 → "AB"

   Digunakan oleh: excelInfo(), _buildSheet2Plain(), _buildSheet2Formula()
   @param  {number} idx  - indeks kolom, 0-based
   @returns {string}     - huruf kolom Excel (e.g. "A", "AB", "AAA")
================================================================ */
function colLetter(idx) {
  let result = '';
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}


/* ================================================================
   ④ excelInfo(featureCols, classCol, total, classIdx, headers)
   ─────────────────────────────────────────────────────────────
   Menghasilkan kumpulan informasi alamat Excel yang dipakai oleh
   buildResultHTML() saat membangun blok formula di Step 1–3.

   Semua referensi mengacu ke sheet "Sheet1" (nama statis).

   @param  {string[]} featureCols - nama kolom fitur yang aktif
   @param  {string}   classCol    - nama kolom label/kelas
   @param  {number}   total       - jumlah baris data
   @param  {number}   classIdx    - indeks kolom kelas di headers[]
   @param  {string[]} headers     - semua nama kolom CSV
   @returns {object}  { colMap, classColLetter, classRange, dataRow1, dataRowN, nRows }
================================================================ */
function excelInfo(featureCols, classCol, total, classIdx, headers) {
  const dataRow1  = 2;            // baris data mulai (baris 1 = header)
  const dataRowN  = total + 1;    // baris data terakhir
  const nRows     = total;

  // Peta: nama kolom → huruf Excel (berdasarkan urutan di Sheet1)
  const colMap = {};
  headers.forEach((h, i) => { colMap[h] = colLetter(i); });

  const classColLetter = colMap[classCol];

  // Range absolut kolom kelas — format $X$2:$X$N, merujuk Sheet1
  const classRange = `Sheet1!$${classColLetter}$${dataRow1}:$${classColLetter}$${dataRowN}`;

  return { colMap, classColLetter, classRange, dataRow1, dataRowN, nRows };
}


/* ================================================================
   ⑤ toggleExcel(id)
   ──────────────────
   Menampilkan / menyembunyikan blok formula Excel di UI hasil.
   Dipanggil dari atribut onclick HTML yang dibuat oleh buildExcelBlock().

   @param {string} id - id elemen <div> konten blok Excel
================================================================ */
function toggleExcel(id) {
  const block  = document.getElementById(id);
  const btn    = document.getElementById('tog-' + id);
  const isOpen = block.style.display !== 'none';

  if (isOpen) {
    block.style.display = 'none';
    btn.classList.remove('open');
    btn.querySelector('.tog-text').textContent = 'Tampilkan Formula Excel';
    return;
  }

  // Tandai sudah di-render agar tidak di-render ulang saat toggle berikutnya
  if (block.dataset.rendered === 'true') {
    block.style.display = 'block';
    btn.classList.add('open');
    btn.querySelector('.tog-text').textContent = 'Sembunyikan Formula Excel';
    return;
  }

  // Ambil semua .exc-row yang belum di-render (disimpan sementara di template)
  const template = block.querySelector('[data-rows-template]');
  if (!template) {
    // Tidak ada template → fallback render langsung (blok non-chunked)
    block.style.display = 'block';
    btn.classList.add('open');
    btn.querySelector('.tog-text').textContent = 'Sembunyikan Formula Excel';
    return;
  }

  const container = block.querySelector('[data-rows-container]');
  const allRows   = Array.from(template.querySelectorAll('.exc-row'));
  const CHUNK     = 50;
  let   index     = 0;

  block.style.display = 'block';
  btn.classList.add('open');
  btn.querySelector('.tog-text').textContent = 'Sembunyikan Formula Excel';

  function renderChunk() {
    const slice = allRows.slice(index, index + CHUNK);
    slice.forEach(row => container.appendChild(row));
    index += CHUNK;
    if (index < allRows.length) {
      setTimeout(renderChunk, 0);
    } else {
      block.dataset.rendered = 'true';
      template.remove();
    }
  }

  renderChunk();
}


/* ================================================================
   ⑥ copyFormula(text, btn)
   ────────────────────────
   Menyalin teks formula ke clipboard dan menampilkan feedback
   visual sementara ("✓ Disalin") selama 1,5 detik.

   @param {string}      text - string formula yang akan disalin
   @param {HTMLElement} btn  - tombol yang diklik (untuk feedback visual)
================================================================ */
function copyFormula(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Disalin';
    btn.style.color = 'var(--green)';
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.style.color = '';
    }, 1500);
  });
}


/* ================================================================
   ⑦ buildExcelBlock(id, rows)
   ────────────────────────────
   Membangun HTML widget "Tampilkan Formula Excel" yang berisi:
   - Tombol toggle show/hide
   - Tabel formula (cell address | formula | komentar)
   - Tombol "Salin semua" ke clipboard

   Dipanggil dari buildResultHTML() di nb_render.js untuk setiap
   Step (Prior, Likelihood, Posterior, Akurasi).

   @param  {string}   id   - ID unik untuk elemen DOM blok ini
   @param  {Array}    rows - array of { cell: string, formula: string, comment?: string }
   @returns {string}  HTML string siap di-inject ke innerHTML
================================================================ */
function buildExcelBlock(id, rows) {
  // Gabungkan semua formula menjadi satu string untuk tombol "Salin semua"
  const allFormulas = rows.map(r => `${r.cell}\t${r.formula}`).join('\n');

  const rowsHtml = rows.map(r => `
    <div class="exc-row">
      <span class="exc-cell">${r.cell}</span>
      <span class="exc-formula">${escHtml(r.formula)}</span>
      ${r.comment ? `<span class="exc-comment">// ${r.comment}</span>` : ''}
    </div>`).join('');

  return `
    <button class="excel-toggle" id="tog-${id}" onclick="toggleExcel('${id}')">
      <span class="tog-icon">▶</span>
      <span class="tog-text">Tampilkan Formula Excel</span>
    </button>
    <div id="${id}" style="display:none">
      <div class="excel-block">
        <div class="excel-label">
          Formula Excel — Sheet: Perhitungan
          <button class="copy-btn" onclick="copyFormula(${JSON.stringify(allFormulas)}, this)">⧉ Salin semua</button>
        </div>
        <div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.25);border-radius:4px;
          padding:5px 10px;margin-bottom:8px;font-size:14px;color:var(--yellow);font-family:var(--mono)">
          ⚠ Formula merujuk ke <strong>Sheet1</strong> (data) dan <strong>Posterior</strong> (helper nilai posterior).
          Jika kamu mengganti nama sheet data, sesuaikan semua referensi
          <code style="background:rgba(0,0,0,0.3);padding:1px 5px;border-radius:3px">Sheet1!</code>
          di file Excel kamu.
        </div>
        <hr class="exc-section-sep">
        ${rowsHtml}
      </div>
    </div>`;
}


/* ================================================================
   ⑧ escHtml(s)
   ─────────────
   Meng-escape karakter HTML khusus agar formula tidak merusak DOM
   saat di-inject melalui innerHTML.

   Karakter yang di-escape: & < >

   Digunakan oleh: buildExcelBlock()
   @param  {string} s - string mentah (mungkin mengandung < > &)
   @returns {string}  - string aman untuk innerHTML
================================================================ */
function escHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}


/* ================================================================
   ⑨ showInput()
   ──────────────
   Navigasi: tampilkan halaman input (upload + konfigurasi),
   sembunyikan halaman hasil.
   Update breadcrumb dan scroll ke atas.

   Dipanggil dari: tombol "← Kembali ke Input" di halaman hasil
================================================================ */
function showInput() {
  document.getElementById('page-input').style.display  = 'block';
  document.getElementById('page-result').style.display = 'none';
  document.getElementById('bc-current').textContent    = 'Naive Bayes';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


/* ================================================================
   ⑩ showResult()
   ───────────────
   Navigasi: tampilkan halaman hasil kalkulasi,
   sembunyikan halaman input.
   Update breadcrumb dan scroll ke atas.

   Dipanggil dari: buildResultHTML() setelah HTML hasil selesai
   dibangun dan di-inject ke DOM.
================================================================ */
function showResult() {
  document.getElementById('page-input').style.display  = 'none';
  document.getElementById('page-result').style.display = 'block';
  document.getElementById('bc-current').textContent    = 'Hasil';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}