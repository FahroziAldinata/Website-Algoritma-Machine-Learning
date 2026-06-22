/**
 * src/plugins/apriori/apriori_plugin.js
 * Apriori Association Rule Mining Algorithm Plugin
 * 
 * Tujuan: Mengimplementasikan algoritma Apriori untuk menemukan frequent itemsets
 * dan association rules (aturan asosiasi).
 * Mendukung input data transaksi dinamis, batasan minimal support & confidence,
 * filter pruning dengan validasi subset frequent, kalkulasi nilai lift untuk korelasi
 * itemset, serta ekspor Excel formula/plain.
 */

class AprioriPlugin extends AlgorithmPlugin {
  constructor() {
    super();
    this.id = 'apriori';
    this.name = 'Apriori Association Rules';
    this.icon = '&#9839;';
    this.description = 'Menemukan frequent itemset dan aturan asosiasi (association rules) berdasarkan support, confidence, dan lift.';
    this.uiMode = 'association';
    this.uiCapabilities = { requiresTarget: false };
    
    this.configSchema = {
      minSupport: {
        label: 'Minimum Support (Rasio)',
        type: 'number',
        min: 0.01,
        max: 1.00,
        step: 0.01,
        default: 0.20
      },
      minConfidence: {
        label: 'Minimum Confidence (Rasio)',
        type: 'number',
        min: 0.01,
        max: 1.00,
        step: 0.01,
        default: 0.60
      },
      maxK: {
        label: 'Maksimum Panjang Itemset (K)',
        type: 'number',
        min: 2,
        max: 10,
        step: 1,
        default: 3
      }
    };
  }

  _countItemset(transactions, itemset) {
    let c = 0;
    for (const t of transactions) {
      if (itemset.every(it => t.includes(it))) c++;
    }
    return c;
  }

  _support(transactions, itemset) {
    return this._countItemset(transactions, itemset) / transactions.length;
  }

  _confidence(transactions, antecedent, consequent) {
    const union = [...antecedent, ...consequent];
    const suppXY = this._support(transactions, union);
    const suppX  = this._support(transactions, antecedent);
    if (suppX === 0) return 0;
    return suppXY / suppX;
  }

  _lift(transactions, antecedent, consequent) {
    const conf = this._confidence(transactions, antecedent, consequent);
    const suppY = this._support(transactions, consequent);
    if (suppY === 0) return 0;
    return conf / suppY;
  }

  _powerSet(arr) {
    const result = [];
    const total = 1 << arr.length;
    for (let mask = 1; mask < total; mask++) {
      const subset = [];
      for (let i = 0; i < arr.length; i++) {
        if (mask & (1 << i)) subset.push(arr[i]);
      }
      result.push(subset);
    }
    return result;
  }

  _itemsetKey(items) {
    return [...items].sort().join('|||');
  }

  _allSubsetsFrequent(candidate, prevL) {
    const keys = new Set(prevL.map(s => this._itemsetKey(s.items)));
    for (let skip = 0; skip < candidate.length; skip++) {
      const sub = candidate.filter((_, i) => i !== skip);
      if (!keys.has(this._itemsetKey(sub))) return false;
    }
    return true;
  }

  /**
   * Logika utama komputasi Apriori di background thread (Worker)
   */
  async process(trainRowsDummy, testRowsDummy, config, onProgress) {
    const {
      minSupport = 0.20,
      minConfidence = 0.60,
      maxK = 3,
      rawRows
    } = config;

    onProgress('Preprocessing', 'Mengekstrak transaksi dari dataset...', 10);
    
    // Deteksi kolom TID dan item
    const headers = Object.keys(rawRows[0] || {});
    const tidCol = headers.find(h => /^(tid|no|id|transaction.?id)$/i.test(h));

    const transactions = [];
    const tids = [];
    const rawRowsTransformed = [];

    rawRows.forEach((r, idx) => {
      const tid = tidCol ? (r[tidCol] || `T${idx + 1}`) : `T${idx + 1}`;
      const items = [];
      headers.forEach(h => {
        if (h === tidCol) return;
        const val = String(r[h]).trim();
        if (val !== "" && val !== "-" && val !== "null" && val !== "undefined") {
          items.push(val);
        }
      });
      if (items.length > 0) {
        transactions.push(items);
        tids.push(tid);
        rawRowsTransformed.push({ TID: tid, items });
      }
    });

    const itemSet = new Set();
    transactions.forEach(t => t.forEach(it => itemSet.add(it)));
    const allItems = [...itemSet].sort();

    const n = transactions.length;
    const steps = [];
    const frequentSets = [];

    // L1 - Frequent 1-itemsets
    onProgress('Iterasi 1', 'Mengevaluasi support 1-itemset...', 30);
    const C1 = allItems.map(item => ({
      items: [item],
      count: this._countItemset(transactions, [item]),
      support: this._support(transactions, [item])
    }));
    const L1 = C1.filter(c => c.support >= minSupport);
    frequentSets.push(...L1);
    steps.push({ k: 1, candidates: C1, frequent: L1 });

    // Lk - Frequent k-itemsets
    let prevL = L1;
    for (let k = 2; k <= maxK && prevL.length >= k; k++) {
      onProgress(`Iterasi ${k}`, `Mengevaluasi support ${k}-itemset...`, Math.min(30 + k * 15, 80));

      const sortedPrev = prevL.map(s => ({ ...s, items: [...s.items].sort() }));
      const Ck = [];
      const seen = new Set();

      for (let i = 0; i < sortedPrev.length; i++) {
        for (let j = i + 1; j < sortedPrev.length; j++) {
          const a = sortedPrev[i].items;
          const b = sortedPrev[j].items;
          
          let valid = true;
          for (let x = 0; x < k - 2; x++) {
            if (a[x] !== b[x]) { valid = false; break; }
          }
          if (!valid) continue;
          if (a[k - 2] >= b[k - 2]) continue;

          const candidate = [...a, b[k - 2]].sort();
          const key = this._itemsetKey(candidate);
          if (seen.has(key)) continue;
          seen.add(key);

          // Prune step
          if (!this._allSubsetsFrequent(candidate, sortedPrev)) continue;

          const cnt  = this._countItemset(transactions, candidate);
          const supp = cnt / n;
          Ck.push({ items: candidate, count: cnt, support: supp });
        }
      }

      const Lk = Ck.filter(c => c.support >= minSupport);
      steps.push({ k, candidates: Ck, frequent: Lk });
      if (Lk.length === 0) break;
      frequentSets.push(...Lk);
      prevL = Lk;
    }

    onProgress('Rule Mining', 'Membangun aturan asosiasi (Association Rules)...', 85);
    const rules = [];
    for (const fs of frequentSets) {
      if (fs.items.length < 2) continue;
      
      const ps = this._powerSet(fs.items);
      for (const ant of ps) {
        const con = fs.items.filter(it => !ant.includes(it));
        if (con.length === 0) continue;

        const conf = this._confidence(transactions, ant, con);
        if (conf < minConfidence) continue;

        const liftVal = this._lift(transactions, ant, con);
        const suppXY  = this._support(transactions, fs.items);
        const suppX   = this._support(transactions, ant);
        const suppY   = this._support(transactions, con);

        rules.push({
          antecedent: ant,
          consequent: con,
          suppX,
          suppY,
          suppXY,
          confidence: conf,
          lift: liftVal,
          count: fs.count
        });
      }
    }

    rules.sort((a, b) => {
      if (Math.abs(b.lift - a.lift) > 1e-10) return b.lift - a.lift;
      return b.confidence - a.confidence;
    });

    onProgress('Selesai', 'Perhitungan Apriori selesai.', 100);

    return {
      frequentSets,
      rules,
      steps,
      n,
      allItems,
      rawRowsTransformed,
      minSupport,
      minConfidence,
      maxK
    };
  }

  /**
   * Menggambar visualisasi manual step-by-step di DOM (Main Thread)
   */
  renderHTML(r, container) {
    const pct = v => (v * 100).toFixed(1) + '%';
    const fmt = (n, d = 4) => {
      if (typeof n !== 'number' || isNaN(n)) return '—';
      return parseFloat(n.toFixed(d)).toString();
    };

    let html = `
      <!-- Ringkasan Metrik -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:1.5rem">
        <div class="metric-card"><div class="metric-label">Total Transaksi</div><div class="metric-val metric-blue">${r.n}</div></div>
        <div class="metric-card"><div class="metric-label">Item Unik</div><div class="metric-val metric-blue">${r.allItems.length}</div></div>
        <div class="metric-card"><div class="metric-label">Frequent Itemsets</div><div class="metric-val metric-green">${r.frequentSets.length}</div></div>
        <div class="metric-card"><div class="metric-label">Association Rules</div><div class="metric-val metric-${r.rules.length > 0 ? 'green' : 'red'}">${r.rules.length}</div></div>
      </div>
    `;

    // 1. Dataset Transaksi
    const dsTableRows = r.rawRowsTransformed.slice(0, 30).map(row => `
      <tr>
        <td class="mono">${escapeHTML(row.TID)}</td>
        <td>${row.items.map(it => `<span class="item-chip">${escapeHTML(it)}</span>`).join(' ')}</td>
        <td class="mono">${row.items.length}</td>
      </tr>
    `).join('');

    html += `
      <div class="section">
        <div class="section-head"><div class="step-circle">1</div><div class="section-title">Dataset Transaksi (Sampel 30 Pertama)</div></div>
        <div class="section-body">
          <div class="tbl-wrap-scroll" style="max-height:280px">
            <table>
              <thead><tr><th>TID</th><th>Daftar Item</th><th>Jumlah Item</th></tr></thead>
              <tbody>${dsTableRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // 2. Kandidat Langkah
    r.steps.forEach(st => {
      const k = st.k;
      const sub = k === 2 ? '₂' : k === 3 ? '₃' : k === 4 ? '₄' : `${k}`;

      let stepRows = st.candidates.map(c => {
        const ok = c.support >= r.minSupport;
        return `
          <tr ${ok ? 'class="row-hl"' : ''}>
            <td><span class="itemset-label">{${escapeHTML(c.items.join(', '))}}</span></td>
            <td class="mono">${c.count}</td>
            <td class="mono">${pct(c.support)}</td>
            <td class="mono" style="font-size:12px;color:var(--text3)">${c.count}/${r.n} = ${fmt(c.support)}</td>
            <td><span class="chip ${ok ? 'chip-ok' : 'chip-fail'}">${ok ? '✓ Frequent' : '✗ Pruned'}</span></td>
          </tr>
        `;
      }).join('');

      // Formula Excel block
      const excelRows = st.candidates.slice(0, 8).map((c, idx) => {
        const row = idx + 2;
        const excelFormula = c.items.length === 1
          ? `=COUNTIF(B2:B${r.n + 1},"*${c.items[0]}*")/${r.n}`
          : `=SUMPRODUCT((${c.items.map(it => `COUNTIF(B2:B${r.n + 1},"*${it}*")`).join('*')}>0)*1)/${r.n}`;
        
        return {
          cell: `B${row}`,
          formula: excelFormula,
          comment: `supp({${c.items.join(', ')}}) = ${c.count}/${r.n} = ${pct(c.support)}`
        };
      });

      const excelBlockHtml = excelRows.length > 0 ? `
        <div style="margin-top:10px;">
          <button class="excel-toggle" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'; this.classList.toggle('open');">
            <span class="tog-icon">▶</span> Tampilkan Formula Excel (L${k})
          </button>
          <div style="display:none;">
            <div class="excel-block">
              <div class="excel-label">Excel — Hitung Support C${k}</div>
              ${excelRows.map(er => `
                <div class="exc-row">
                  <span class="exc-cell">${er.cell}</span>
                  <span class="exc-formula">${escapeHTML(er.formula)}</span>
                  <span class="exc-comment">// ${escapeHTML(er.comment)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      ` : '';

      html += `
        <div class="section">
          <div class="section-head"><div class="step-circle">2.${k}</div><div class="section-title">Kandidat ${k}-Itemset (C${sub} &rarr; L${sub})</div></div>
          <div class="section-body">
            <div class="info-box">
              Ambang Batas Support: &ge; <strong>${pct(r.minSupport)}</strong> (jumlah minimal kemunculan &ge; <strong>${Math.ceil(r.minSupport * r.n)}</strong> transaksi)
            </div>
            <div class="tbl-wrap-scroll" style="max-height:280px">
              <table>
                <thead>
                  <tr><th>Itemset</th><th>Count</th><th>Support</th><th>Kalkulasi</th><th>Status</th></tr>
                </thead>
                <tbody>${stepRows}</tbody>
              </table>
            </div>
            <div style="margin-top:8px;font-size:12px;color:var(--text2)">
              ${st.candidates.length} kandidat &rarr; <strong style="color:var(--green)">${st.frequent.length} frequent</strong>
            </div>
            ${excelBlockHtml}
          </div>
        </div>
      `;
    });

    // 3. Ringkasan Frequent Itemsets
    const byK = {};
    r.frequentSets.forEach(fs => {
      const k = fs.items.length;
      if (!byK[k]) byK[k] = [];
      byK[k].push(fs);
    });

    let freqSummaryHtml = '';
    Object.keys(byK).sort((a, b) => +a - +b).forEach(k => {
      freqSummaryHtml += `
        <div style="margin-bottom:12px">
          <div style="font-family:var(--mono);font-size:13px;color:var(--text2);margin-bottom:4px">L${k} &mdash; ${byK[k].length} itemset frequent</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${byK[k].sort((a, b) => b.support - a.support).map(fs => `
              <div class="freq-badge" style="display:flex;align-items:center;background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:3px 8px;font-size:12px;">
                <span style="font-weight:600;margin-right:6px;">{${escapeHTML(fs.items.join(', '))}}</span>
                <span style="color:var(--accent);font-family:var(--mono);margin-right:6px;">${pct(fs.support)}</span>
                <span style="color:var(--text3);font-size:11px;">(${fs.count}/${r.n})</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });

    html += `
      <div class="section">
        <div class="section-head"><div class="step-circle">3</div><div class="section-title">Ringkasan Frequent Itemsets Terbentuk</div></div>
        <div class="section-body">
          ${freqSummaryHtml || '<div class="warn-box">Tidak ada frequent itemset yang memenuhi kriteria.</div>'}
        </div>
      </div>
    `;

    // 4. Association Rules
    if (r.rules.length > 0) {
      const ruleTableRows = r.rules.map((rule, idx) => {
        const liftClass = rule.lift > 1 ? 'metric-green' : rule.lift < 1 ? 'metric-red' : '';
        const liftIcon  = rule.lift > 1 ? '↑' : rule.lift < 1 ? '↓' : '=';
        return `
          <tr>
            <td class="mono">${idx + 1}</td>
            <td><span class="itemset-label">{${escapeHTML(rule.antecedent.join(', '))}}</span></td>
            <td style="color:var(--accent);font-weight:600;font-size:18px">&rarr;</td>
            <td><span class="itemset-label">{${escapeHTML(rule.consequent.join(', '))}}</span></td>
            <td class="mono">${pct(rule.suppX)}</td>
            <td class="mono">${pct(rule.suppY)}</td>
            <td class="mono">${pct(rule.suppXY)}</td>
            <td class="mono"><strong>${pct(rule.confidence)}</strong></td>
            <td class="mono ${liftClass}">${liftIcon} ${fmt(rule.lift)}</td>
            <td style="font-size:12px;color:var(--text3)">${rule.lift > 1 ? 'Korelasi Positif' : rule.lift < 1 ? 'Korelasi Negatif' : 'Independen'}</td>
          </tr>
        `;
      }).join('');

      html += `
        <div class="section">
          <div class="section-head"><div class="step-circle">4</div><div class="section-title">Daftar Association Rules (Aturan Asosiasi)</div></div>
          <div class="section-body">
            <div class="tbl-wrap-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Antecedent (X)</th>
                    <th>&rarr;</th>
                    <th>Consequent (Y)</th>
                    <th>supp(X)</th>
                    <th>supp(Y)</th>
                    <th>supp(X∪Y)</th>
                    <th>Confidence</th>
                    <th>Lift</th>
                    <th>Asosiasi</th>
                  </tr>
                </thead>
                <tbody>${ruleTableRows}</tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="section">
          <div class="section-head"><div class="step-circle">4</div><div class="section-title">Association Rules</div></div>
          <div class="section-body">
            <div class="warn-box">
              Tidak ada aturan asosiasi yang memenuhi syarat minimum confidence &ge; ${pct(r.minConfidence)}.
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  /**
   * Ekspor workbook SheetJS untuk Apriori
   */
  exportExcel(r, mode) {
    const fm = (mode === 'formula');
    const n = r.n;

    const WB = newWB();

    // 1. Sheet Dataset
    const ds1 = [['TID', 'Items', '# Items']];
    r.rawRowsTransformed.forEach(row => {
      ds1.push([row.TID, row.items.join(', '), row.items.length]);
    });
    const ws1 = aoaToWS(ds1);
    addWS(WB, ws1, '1_Dataset');

    // 2. Sheet Perhitungan Support
    const ds2 = [['Iterasi', 'Itemset', 'Count', 'Support', 'Formula Support', 'Min Support', 'Status']];
    r.steps.forEach(st => {
      st.candidates.forEach(c => {
        const supp = c.count / n;
        const ok = supp >= r.minSupport;
        ds2.push([
          `L${st.k}`,
          `{${c.items.join(', ')}}`,
          c.count,
          fm ? fc(`C${ds2.length + 1}/${n}`) : nc(supp),
          `=C${ds2.length + 1}/${n}`,
          nc(r.minSupport),
          ok ? 'Frequent' : 'Pruned'
        ]);
      });
    });
    const ws2 = aoaToWS(ds2);
    addWS(WB, ws2, '2_Perhitungan');

    // 3. Sheet Frequent Itemsets Summary
    const ds3 = [['#', 'K', 'Itemset', 'Count', 'Support', 'Formula']];
    r.frequentSets.forEach((fs, idx) => {
      const supp = fs.count / n;
      ds3.push([
        idx + 1,
        fs.items.length,
        `{${fs.items.join(', ')}}`,
        fs.count,
        fm ? fc(`D${ds3.length + 1}/${n}`) : nc(supp),
        `=D${ds3.length + 1}/${n}`
      ]);
    });
    const ws3 = aoaToWS(ds3);
    addWS(WB, ws3, '3_FrequentItemsets');

    // 4. Sheet Association Rules
    const ds4h = [
      '#', 'Antecedent (X)', 'Consequent (Y)',
      'count(X∪Y)', 'count(X)', 'count(Y)',
      'supp(X∪Y)', 'supp(X)', 'supp(Y)',
      'Confidence', 'Lift', 'Interpretasi',
      'Formula Confidence', 'Formula Lift'
    ];
    const ds4 = [ds4h];

    r.rules.forEach((rule, idx) => {
      const row = idx + 2;
      const colSuppXY  = 'G';
      const colSuppX   = 'H';
      const colSuppY   = 'I';
      const colConf    = 'J';

      ds4.push([
        idx + 1,
        rule.antecedent.join(', '),
        rule.consequent.join(', '),
        rule.count,
        Math.round(rule.suppX * n),
        Math.round(rule.suppY * n),
        fm ? fc(`D${row}/${n}`) : nc(rule.suppXY),
        fm ? fc(`E${row}/${n}`) : nc(rule.suppX),
        fm ? fc(`F${row}/${n}`) : nc(rule.suppY),
        fm ? fc(`${colSuppXY}${row}/${colSuppX}${row}`) : nc(rule.confidence),
        fm ? fc(`${colConf}${row}/${colSuppY}${row}`) : nc(rule.lift),
        rule.lift > 1 ? 'Positif' : rule.lift < 1 ? 'Negatif' : 'Independen',
        `=${colSuppXY}${row}/${colSuppX}${row}`,
        `=${colConf}${row}/${colSuppY}${row}`
      ]);
    });
    const ws4 = aoaToWS(ds4);
    addWS(WB, ws4, '4_Rules');

    // 5. Sheet Evaluasi
    const ds5 = [
      ['Metrik', 'Nilai', 'Formula/Keterangan'],
      ['Total Transaksi', n, '=COUNTA(1_Dataset!A:A)-1'],
      ['Total Item Unik', r.allItems.length, r.allItems.join(', ')],
      ['Min Support (threshold)', r.minSupport, `${(r.minSupport * 100).toFixed(0)}%`],
      ['Min Confidence (threshold)', r.minConfidence, `${(r.minConfidence * 100).toFixed(0)}%`],
      ['Jumlah Frequent Itemsets', r.frequentSets.length, ''],
      ['Jumlah Association Rules', r.rules.length, '']
    ];

    const ws5 = aoaToWS(ds5);
    addWS(WB, ws5, '5_EvaluasiMetrik');

    return WB;
  }
}

// Registrasi plugin ke registry
if (typeof registry !== 'undefined') {
  registry.register(new AprioriPlugin());
}
