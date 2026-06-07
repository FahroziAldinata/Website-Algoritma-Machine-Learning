/* =====================================================
   apriori_render.js
   Render results: steps, frequent itemsets, rules, metrics
   ===================================================== */

   function processApriori() {
    if (APR.transactions.length === 0) {
      return alert('Upload dataset terlebih dahulu.');
    }
  
    let result;
    try {
      result = runApriori(
        APR.transactions,
        APR.allItems,
        APR.minSupport,
        APR.minConfidence,
        APR.maxItemsetSize
      );
    } catch (err) {
      return alert('Error: ' + err.message);
    }
  
    APR.lastResult = result; // cache for export
  
    const el = document.getElementById('result-content');
    el.innerHTML = renderResultHTML(result);
    document.getElementById('page-result').style.display = '';
    document.getElementById('page-result').scrollIntoView({ behavior: 'smooth' });
  
    // Bind toggle buttons
    el.querySelectorAll('.excel-toggle').forEach(btn => {
      btn.addEventListener('click', function () {
        const targetId = this.dataset.target;
        const target   = document.getElementById(targetId);
        if (!target) return;
        const open = target.style.display !== 'none';
        target.style.display = open ? 'none' : '';
        this.classList.toggle('open', !open);
      });
    });
  
    // Bind copy buttons
    el.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const text = document.getElementById(this.dataset.target)?.innerText || '';
        navigator.clipboard.writeText(text).then(() => {
          this.textContent = '✓ Tersalin';
          setTimeout(() => (this.textContent = '⧉ Salin'), 1500);
        });
      });
    });
  }
  
  /* ---- Master render ---- */
  function renderResultHTML(result) {
    const { frequentSets, rules, steps, n } = result;
    const { minSupport, minConfidence, maxItemsetSize, transactions, allItems } = APR;
  
    let h = '';
  
    // === SUMMARY HEADER ===
    h += `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:1.5rem">
      <h2 style="font-size:60px;font-weight:300;margin:0">Hasil <strong>Apriori</strong></h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-left:auto">
        <button class="btn btn-green" onclick="exportAprioriExcel(false)">⬇ Download Plain Text</button>
        <button class="btn btn-green" onclick="exportAprioriExcel(true)">⬇ Download Formula Excel</button>
        <button class="btn btn-sm" onclick="resetInput()">↺ Reset</button>
      </div>
    </div>`;
  
    // === METRIC CARDS ===
    h += `<div class="metrics-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
      ${metricCard('Transaksi', n, 'blue')}
      ${metricCard('Item Unik', allItems.length, 'blue')}
      ${metricCard('Frequent Itemsets', frequentSets.length, 'green')}
      ${metricCard('Association Rules', rules.length, rules.length > 0 ? 'green' : 'red')}
      ${metricCard('Min Support', pct(minSupport), 'blue')}
      ${metricCard('Min Confidence', pct(minConfidence), 'blue')}
    </div>`;
  
    // === SECTION: DATASET ===
    h += section('1', 'Dataset Transaksi',
      renderTransactionTable(APR.rawRows));
  
    // === SECTION: 1-ITEMSET SUPPORT ===
    h += section('2', 'Hitung Support Semua Item (C₁ → L₁)',
      renderCandidateStep(steps[0], n, minSupport));
  
    // === SECTION: FREQUENT ITEMSETS PER K ===
    for (let i = 1; i < steps.length; i++) {
      const st = steps[i];
      const k  = st.k;
      const sub = k === 2 ? '₂' : k === 3 ? '₃' : k === 4 ? '₄' : `${k}`;
      h += section(`2.${i}`, `Kandidat ${k}-Itemset (C${sub} → L${sub})`,
        renderCandidateStep(st, n, minSupport));
    }
  
    // === SECTION: ALL FREQUENT ITEMSETS SUMMARY ===
    h += section('3', 'Ringkasan Frequent Itemsets', renderFrequentSummary(frequentSets, n, minSupport));
  
    // === SECTION: ASSOCIATION RULES ===
    if (rules.length > 0) {
      h += section('4', 'Association Rules', renderRulesSection(rules, n, transactions));
    } else {
      h += section('4', 'Association Rules',
        `<div class="warn-box" style="font-size:20px">
          Tidak ada rule yang memenuhi confidence ≥ ${pct(minConfidence)}.
          Coba turunkan threshold confidence atau support.
        </div>`);
    }
  
    // === SECTION: FORMULA REFERENCE ===
    h += section('5', 'Referensi Formula', renderFormulaRef());
  
    return h;
  }
  
  /* ---- Section wrapper ---- */
  function section(num, title, body) {
    return `<div class="section" style="margin-bottom:1rem">
      <div class="section-head">
        <div class="step-circle">${num}</div>
        <div class="section-title">${title}</div>
      </div>
      <div class="section-body">${body}</div>
    </div>`;
  }
  
  function metricCard(label, val, color) {
    return `<div class="metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-val metric-${color}">${val}</div>
    </div>`;
  }
  
  /* ---- Transaction Table ---- */
  function renderTransactionTable(rows) {
    let h = `<div class="tbl-wrap-scroll" style="max-height:280px">
      <table><thead><tr><th>TID</th><th>Items</th><th>Jumlah</th></tr></thead><tbody>`;
    rows.forEach(r => {
      h += `<tr>
        <td class="mono">${r.TID}</td>
        <td>${r.items.map(it => `<span class="item-chip">${it}</span>`).join(' ')}</td>
        <td class="mono">${r.items.length}</td>
      </tr>`;
    });
    h += '</tbody></table></div>';
    return h;
  }
  
  /* ---- Candidate Step ---- */
  function renderCandidateStep(step, n, minSupp) {
    const { k, candidates, frequent } = step;
  
    // Formula explanation
    let formulaHtml = `
    <div class="formula">supp(X) = count(X) / total_transaksi = count(X) / ${n}</div>
    <div class="info-box" style="font-size:18px;margin-bottom:1rem">
      Threshold: support ≥ <strong>${pct(minSupp)}</strong> (${minSupp} × ${n} = <strong>${(minSupp * n).toFixed(2)}</strong> transaksi)
      &nbsp;→&nbsp; count ≥ <strong>${Math.ceil(minSupp * n)}</strong>
    </div>`;
  
    // Candidates table
    let h = formulaHtml;
    h += `<div class="tbl-wrap-scroll" style="max-height:320px"><table>
      <thead><tr>
        <th>Itemset</th>
        <th>Count</th>
        <th>Support</th>
        <th>Kalkulasi</th>
        <th>Status</th>
      </tr></thead><tbody>`;
  
    candidates.forEach(c => {
      const ok = c.support >= minSupp;
      h += `<tr ${ok ? 'class="row-hl"' : ''}>
        <td><span class="itemset-label">{${c.items.join(', ')}}</span></td>
        <td class="mono">${c.count}</td>
        <td class="mono">${pct(c.support)}</td>
        <td class="mono" style="font-size:16px;color:var(--text3)">${c.count}/${n} = ${fmt(c.support)}</td>
        <td><span class="chip ${ok ? 'chip-ok' : 'chip-fail'}">${ok ? '✓ Frequent' : '✗ Pruned'}</span></td>
      </tr>`;
    });
  
    h += `</tbody></table></div>`;
    h += `<div style="margin-top:0.75rem;font-size:18px;color:var(--text2)">
      ${candidates.length} kandidat → <strong style="color:var(--green)">${frequent.length} frequent</strong>
      ${candidates.length - frequent.length > 0 ? ` · <span style="color:var(--red)">${candidates.length - frequent.length} dipruning</span>` : ''}
    </div>`;
  
    // Excel formula block
    const exId = `exc-step-${k}`;
    h += `<div style="margin-top:0.75rem">
      <button class="excel-toggle" data-target="${exId}">
        <span class="tog-icon">▶</span> Formula Excel (L${k})
      </button>
      <div id="${exId}" style="display:none">
        <div class="excel-block">
          <div class="excel-label">Excel — Hitung Support C${k}</div>`;
  
    candidates.slice(0, 8).forEach((c, i) => {
      const row = i + 2;
      const itemsStr = c.items.join(', ');
      const excelFormula = c.items.length === 1
        ? `=COUNTIF(B2:B${n + 1},"*${c.items[0]}*")/${n}`
        : `=SUMPRODUCT((${c.items.map(it => `COUNTIF(B2:B${n + 1},"*${it}*")`).join('*')}>0)*1)/${n}`;
      h += `<div class="exc-row">
        <span class="exc-cell">B${row}</span>
        <span class="exc-formula">${excelFormula}</span>
        <span class="exc-comment">// supp({${itemsStr}}) = ${c.count}/${n} = ${pct(c.support)}</span>
      </div>`;
    });
    if (candidates.length > 8) {
      h += `<div style="color:var(--text3);font-size:15px;font-style:italic">... ${candidates.length - 8} baris lagi</div>`;
    }
    h += `</div></div></div>`;
  
    return h;
  }
  
  /* ---- Frequent Summary ---- */
  function renderFrequentSummary(frequentSets, n, minSupp) {
    // Group by k
    const byK = {};
    frequentSets.forEach(fs => {
      const k = fs.items.length;
      if (!byK[k]) byK[k] = [];
      byK[k].push(fs);
    });
  
    let inner = '';
    Object.keys(byK).sort((a, b) => +a - +b).forEach(k => {
      inner += `<div style="margin-bottom:1rem">
        <div style="font-family:var(--mono);font-size:18px;color:var(--text2);margin-bottom:0.5rem">
          L${k} — ${byK[k].length} itemset frequent (k=${k})
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">`;
      byK[k].sort((a, b) => b.support - a.support).forEach(fs => {
        inner += `<div class="freq-badge">
          <span>{${fs.items.join(', ')}}</span>
          <span class="freq-supp">${pct(fs.support)}</span>
          <span style="font-size:14px;color:var(--text3)">(${fs.count}/${n})</span>
        </div>`;
      });
      inner += `</div></div>`;
    });
  
    if (!inner) return '<div class="warn-box">Tidak ada frequent itemset.</div>';
  
    // Wrap in scrollable container
    return `<div class="tbl-wrap-scroll" style="max-height:260px;padding-right:4px">${inner}</div>`;
  }
  
  /* ---- Rules Section ---- */
  function renderRulesSection(rules, n, transactions) {
    let h = `
    <div class="info-box" style="font-size:18px;margin-bottom:1rem">
      <strong>Rumus:</strong><br>
      • conf(X→Y) = supp(X∪Y) / supp(X)<br>
      • lift(X→Y) = conf(X→Y) / supp(Y)<br>
      • lift &gt; 1 → X dan Y saling memperkuat (positif)
    </div>
    <div class="tbl-wrap-scroll" style="max-height:400px"><table>
      <thead><tr>
        <th>#</th>
        <th>Antecedent (X)</th>
        <th>→</th>
        <th>Consequent (Y)</th>
        <th>supp(X)</th>
        <th>supp(Y)</th>
        <th>supp(X∪Y)</th>
        <th>Confidence</th>
        <th>Lift</th>
        <th>Interpretasi</th>
      </tr></thead><tbody>`;
  
    rules.forEach((r, i) => {
      const liftClass = r.lift > 1 ? 'metric-green' : r.lift < 1 ? 'metric-red' : '';
      const liftIcon  = r.lift > 1 ? '↑' : r.lift < 1 ? '↓' : '=';
      h += `<tr>
        <td class="mono">${i + 1}</td>
        <td><span class="itemset-label">{${r.antecedent.join(', ')}}</span></td>
        <td style="color:var(--accent);font-weight:600;font-size:20px">→</td>
        <td><span class="itemset-label">{${r.consequent.join(', ')}}</span></td>
        <td class="mono">${pct(r.suppX)}</td>
        <td class="mono">${pct(r.suppY)}</td>
        <td class="mono">${pct(r.suppXY)}</td>
        <td class="mono"><strong>${pct(r.confidence)}</strong></td>
        <td class="mono ${liftClass}">${liftIcon} ${fmt(r.lift, 4)}</td>
        <td style="font-size:16px;color:var(--text3)">${r.lift > 1 ? 'Positif' : r.lift < 1 ? 'Negatif' : 'Independen'}</td>
      </tr>`;
    });
  
    h += `</tbody></table></div>`;
  
    // Excel toggle for rules
    const exId = 'exc-rules';
    h += `<div style="margin-top:0.75rem">
      <button class="excel-toggle" data-target="${exId}">
        <span class="tog-icon">▶</span> Formula Excel — Confidence &amp; Lift
      </button>
      <div id="${exId}" style="display:none"><div class="excel-block">
        <div class="excel-label">Excel — Rules (baris mulai B2)</div>`;
  
    rules.slice(0, 6).forEach((r, i) => {
      const row = i + 2;
      h += `<div class="exc-row">
        <span class="exc-cell">Row ${row}</span>
        <span class="exc-formula">Rule: {${r.antecedent.join(',')}}&rarr;{${r.consequent.join(',')}}</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell">Conf</span>
        <span class="exc-formula">=${fmt(r.suppXY,6)}/${fmt(r.suppX,6)}</span>
        <span class="exc-comment">// ${pct(r.suppXY)} / ${pct(r.suppX)} = ${pct(r.confidence)}</span>
      </div>
      <div class="exc-row">
        <span class="exc-cell">Lift</span>
        <span class="exc-formula">=${fmt(r.confidence,6)}/${fmt(r.suppY,6)}</span>
        <span class="exc-comment">// ${pct(r.confidence)} / ${pct(r.suppY)} = ${fmt(r.lift,4)}</span>
      </div>
      <hr class="exc-section-sep">`;
    });
  
    h += `</div></div></div>`;
  
    return h;
  }
  
  /* ---- Formula Reference ---- */
  function renderFormulaRef() {
    return `
    <div class="formula">
  Support   : supp(X)   = count(X) / |T|
  Confidence: conf(X→Y) = supp(X∪Y) / supp(X)
  Lift      : lift(X→Y) = conf(X→Y) / supp(Y)
             lift &gt; 1 → asosiasi positif
             lift = 1 → independen
             lift &lt; 1 → asosiasi negatif
    </div>
    <div class="info-box" style="font-size:18px">
      <strong>Interpretasi Lift:</strong><br>
      • lift &gt; 1: Jika X dibeli, kemungkinan Y juga dibeli lebih tinggi dari rata-rata.<br>
      • lift = 1: X dan Y tidak saling memengaruhi.<br>
      • lift &lt; 1: Jika X dibeli, kemungkinan Y lebih rendah.
    </div>`;
  }