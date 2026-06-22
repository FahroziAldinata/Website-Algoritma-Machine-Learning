/**
 * src/core/dom_helper.js
 * DOM Helper Module
 * 
 * Menyediakan fungsi-fungsi utilitas untuk membuat elemen DOM secara programatik.
 * Digunakan oleh plugin baru agar renderHTML() lebih ringkas dan konsisten.
 * 
 * Plugin yang sudah ada (Naive Bayes, KNN, C4.5, K-Means, Regression, Apriori)
 * TIDAK di-refactor untuk menggunakan modul ini — modul ini ditujukan untuk
 * pengembangan plugin baru di masa depan.
 * 
 * Semua fungsi tersedia di window.DOMHelper (main thread only).
 */

const DOMHelper = (() => {

  /**
   * Membuat elemen HTML dengan class, atribut, dan children
   * @param {string} tag - Nama tag HTML (e.g. 'div', 'span', 'table')
   * @param {string|string[]} classNames - Nama class CSS atau array class
   * @param {Object} [attrs] - Atribut tambahan { key: value }
   * @param {(string|Node)[]} [children] - Array child berupa string (textContent) atau Node
   * @returns {HTMLElement}
   */
  function createEl(tag, classNames = '', attrs = {}, children = []) {
    const el = document.createElement(tag);

    // Apply class(es)
    if (classNames) {
      const classes = Array.isArray(classNames) ? classNames : classNames.split(' ').filter(Boolean);
      classes.forEach(c => el.classList.add(c));
    }

    // Apply attributes
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'textContent') {
        el.textContent = value;
      } else if (key === 'innerHTML') {
        el.innerHTML = value;
      } else if (key === 'hidden') {
        el.hidden = !!value;
      } else {
        el.setAttribute(key, value);
      }
    });

    // Append children
    children.forEach(child => {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    });

    return el;
  }

  /**
   * Membuat section card (panel langkah perhitungan)
   * @param {number|string} stepNum - Nomor langkah atau simbol (e.g. '✓')
   * @param {string} title - Judul section
   * @param {Node|string} bodyContent - Isi section body
   * @returns {HTMLElement}
   */
  function createSection(stepNum, title, bodyContent) {
    const section = createEl('div', 'section');

    const head = createEl('div', 'section-head', {}, [
      createEl('div', 'step-circle', { textContent: String(stepNum) }),
      createEl('div', 'section-title', { textContent: title })
    ]);

    const body = createEl('div', 'section-body');
    if (typeof bodyContent === 'string') {
      body.innerHTML = bodyContent;
    } else if (bodyContent instanceof Node) {
      body.appendChild(bodyContent);
    }

    section.appendChild(head);
    section.appendChild(body);
    return section;
  }

  /**
   * Membuat tabel HTML dari header dan data
   * @param {string[]} headers - Array nama kolom header
   * @param {(string|number)[][]} rows - Array baris, setiap baris adalah array nilai
   * @param {Object} [opts] - Opsi tambahan
   * @param {boolean} [opts.scrollable=false] - Bungkus dalam tbl-wrap-scroll
   * @param {boolean} [opts.mono=false] - Gunakan font monospace untuk data cells
   * @returns {HTMLElement}
   */
  function createTable(headers, rows, opts = {}) {
    const table = createEl('table');

    // Header
    const thead = createEl('thead');
    const headRow = createEl('tr');
    headers.forEach(h => {
      headRow.appendChild(createEl('th', '', { textContent: String(h) }));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    // Body
    const tbody = createEl('tbody');
    rows.forEach(row => {
      const tr = createEl('tr');
      row.forEach(cell => {
        const cls = opts.mono ? 'mono' : '';
        tr.appendChild(createEl('td', cls, { textContent: String(cell ?? '') }));
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // Bungkus jika scrollable
    if (opts.scrollable) {
      return createEl('div', 'tbl-wrap-scroll', {}, [table]);
    }

    return createEl('div', 'tbl-wrap', {}, [table]);
  }

  /**
   * Membuat metric card (kartu evaluasi)
   * @param {string} label - Label metrik (e.g. 'ACCURACY', 'RMSE')
   * @param {string|number} value - Nilai metrik
   * @param {string} [color='blue'] - Warna: 'green' | 'red' | 'blue' | 'yellow'
   * @returns {HTMLElement}
   */
  function createMetricCard(label, value, color = 'blue') {
    const colorClass = `metric-${color}`;
    return createEl('div', 'metric-card', {}, [
      createEl('div', 'metric-label', { textContent: label }),
      createEl('div', ['metric-val', colorClass], { textContent: String(value) })
    ]);
  }

  /**
   * Membuat grid metric cards
   * @param {{ label: string, value: string|number, color?: string }[]} metrics
   * @returns {HTMLElement}
   */
  function createMetricsGrid(metrics) {
    const grid = createEl('div', 'metrics-grid');
    metrics.forEach(m => {
      grid.appendChild(createMetricCard(m.label, m.value, m.color || 'blue'));
    });
    return grid;
  }

  /**
   * Membuat info/status box
   * @param {string} html - Konten HTML
   * @param {'info'|'warn'|'success'|'error'} [variant='info']
   * @returns {HTMLElement}
   */
  function createInfoBox(html, variant = 'info') {
    const classMap = {
      info: 'info-box',
      warn: 'warn-box',
      success: 'success-box',
      error: 'error-box'
    };
    return createEl('div', classMap[variant] || 'info-box', { innerHTML: html });
  }

  /**
   * Membuat <details> collapsible element
   * @param {string} summaryText - Teks summary yang ditampilkan
   * @param {Node|string} content - Isi detail
   * @param {boolean} [open=false] - Apakah default terbuka
   * @returns {HTMLElement}
   */
  function createDetails(summaryText, content, open = false) {
    const details = createEl('details', '', open ? { open: '' } : {});
    details.appendChild(createEl('summary', '', { textContent: summaryText }));

    if (typeof content === 'string') {
      const div = createEl('div');
      div.innerHTML = content;
      details.appendChild(div);
    } else if (content instanceof Node) {
      details.appendChild(content);
    }

    return details;
  }

  /**
   * Membuat badge / chip
   * @param {string} text - Teks badge
   * @param {'ok'|'fail'|'warn'|'info'} [variant='ok']
   * @returns {HTMLElement}
   */
  function createBadge(text, variant = 'ok') {
    return createEl('span', ['chip', `chip-${variant}`], { textContent: text });
  }

  /**
   * Membuat formula display block
   * @param {string} formulaText - Teks rumus
   * @returns {HTMLElement}
   */
  function createFormula(formulaText) {
    return createEl('div', 'formula', { textContent: formulaText });
  }

  /**
   * Membuat sub-section title
   * @param {string} text - Teks judul sub-section
   * @returns {HTMLElement}
   */
  function createSubTitle(text) {
    return createEl('h4', 'sub-title', { textContent: text });
  }

  /**
   * Membuat horizontal divider
   * @returns {HTMLElement}
   */
  function createDivider() {
    return createEl('hr', 'divider');
  }

  // ==============================
  // Public API
  // ==============================
  return {
    createEl,
    createSection,
    createTable,
    createMetricCard,
    createMetricsGrid,
    createInfoBox,
    createDetails,
    createBadge,
    createFormula,
    createSubTitle,
    createDivider
  };

})();

// Ekspos ke window agar bisa diakses plugin di main thread
if (typeof window !== 'undefined') {
  window.DOMHelper = DOMHelper;
}
