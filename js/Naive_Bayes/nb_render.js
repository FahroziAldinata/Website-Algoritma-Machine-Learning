/* ================================================================
   BUILD RESULT HTML
================================================================ */
function buildResultHTML(d) {
  const {
    classes, classCounts, priors, likelihoods, featureCols, featureVals,
    total, nTrain, nTest, data, exIdx, exRow, exPost, exPred,
    allPreds, correct, accuracy, classCol, classIdx, headers,
    confMat, metrics, macroP, macroR, macroF1, excludedCols, freqMap
  } = d;
  
    // Info Excel helpers
    const ei = excelInfo(featureCols, classCol, total, classIdx, headers);
    const { colMap, classColLetter, classRange, dataRow1, dataRowN } = ei;
  
    let html = '';
  
    /* ---- Header ---- */
    html += `
      <h2 class="page-title">Hasil <strong>Naive Bayes</strong></h2>
      <p class="page-subtitle">Perhitungan manual step-by-step + Formula Excel referensi Sheet Dataset</p>`;
  
    /* ---- Banner kolom yang diabaikan ---- */
    if (excludedCols && excludedCols.length > 0) {
      html += `
        <div style="background:rgba(90,98,117,0.18);border:1px solid var(--border2);
          border-radius:var(--radius);padding:0.65rem 1rem;font-size:17px;
          color:var(--text3);margin-bottom:0.75rem;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-size:19px">&#8856;</span>
          <span><strong style="color:var(--text2)">${excludedCols.length} kolom diabaikan</strong>
          (tidak diikutkan dalam perhitungan):
          ${excludedCols.map(c =>
            `<span style="font-family:var(--mono);background:var(--bg4);border:1px solid var(--border);
              border-radius:4px;padding:1px 7px;font-size:15px;color:var(--text3);margin:0 2px">${c}</span>`
          ).join('')}
          </span>
        </div>`;
  
    }
  
    /* ---- Metrics + Confusion Matrix + P/R/F1 ---- */
    // Clean report banner — selalu tampil
    if (cleanReport) {
      const cr = cleanReport;
      const hasCleaned = cr.missing > 0 || cr.duplicate > 0 || cr.imputed > 0;
  
      if (hasCleaned) {
        // Bangun detail imputasi per kolom
        const imputeRows = Object.entries(cr.imputeDetail || {})
          .filter(([, v]) => v.count > 0)
          .map(([k, v]) => {
            const typeLabel = v.type === 'median'
              ? `<span style="color:var(--accent)">Median</span>`
              : `<span style="color:var(--yellow)">Modus</span>`;
            return `<tr>
              <td style="padding:3px 10px;color:var(--text)">${k}</td>
              <td style="padding:3px 10px;color:var(--text2)">${v.count} sel</td>
              <td style="padding:3px 10px">${typeLabel}</td>
              <td style="padding:3px 10px;font-family:var(--mono);font-size:15px;color:var(--green)">${v.value}</td>
            </tr>`;
          }).join('');
  
        const missCols = Object.entries(cr.missingCols || {})
          .map(([k, v]) => `<strong>${k}</strong>: ${v} sel`).join(' · ');
  
        html += `
          <div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.28);
            border-radius:var(--radius-lg);padding:1rem 1.25rem;font-size:18px;color:var(--yellow);margin-bottom:1rem">
            <div style="font-weight:600;font-size:19px;margin-bottom:8px">⚠ Laporan Pembersihan Data Otomatis</div>
            <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:8px">
              <span>Data asli: <strong style="color:var(--text)">${cr.original.toLocaleString()} baris</strong></span>
              <span>→</span>
              <span>Data bersih: <strong style="color:var(--green)">${cr.final.toLocaleString()} baris</strong></span>
            </div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:${imputeRows ? '10px' : '0'}">
              ${cr.missing > 0 ? `<span style="background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.3);
                border-radius:6px;padding:3px 10px;color:var(--red);font-size:16px">
                ✗ ${cr.missing} baris dihapus (&gt;50% kolom kosong)</span>` : ''}
              ${cr.imputed > 0 ? `<span style="background:rgba(79,156,249,0.1);border:1px solid rgba(79,156,249,0.3);
                border-radius:6px;padding:3px 10px;color:var(--accent);font-size:16px">
                ✎ ${cr.imputed} sel diimputasi</span>` : ''}
              ${cr.duplicate > 0 ? `<span style="background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.3);
                border-radius:6px;padding:3px 10px;color:var(--red);font-size:16px">
                ✗ ${cr.duplicate} duplikat dihapus</span>` : ''}
            </div>
            ${missCols ? `<div style="font-size:15px;color:var(--text3);margin-bottom:8px">Kolom dengan missing value: ${missCols}</div>` : ''}
            ${imputeRows ? `
            <div style="overflow-x:auto;border-top:1px solid rgba(251,191,36,0.18);padding-top:8px;margin-top:4px">
              <div style="font-size:15px;font-weight:600;color:var(--text2);margin-bottom:5px">Detail Imputasi per Kolom:</div>
              <table style="font-size:15px;border-collapse:collapse">
                <thead>
                  <tr style="border-bottom:1px solid rgba(251,191,36,0.2)">
                    <th style="padding:3px 10px;text-align:left;color:var(--text3);font-weight:500">Kolom</th>
                    <th style="padding:3px 10px;text-align:left;color:var(--text3);font-weight:500">Sel Diisi</th>
                    <th style="padding:3px 10px;text-align:left;color:var(--text3);font-weight:500">Metode</th>
                    <th style="padding:3px 10px;text-align:left;color:var(--text3);font-weight:500">Nilai Imputasi</th>
                  </tr>
                </thead>
                <tbody>${imputeRows}</tbody>
              </table>
              <div style="margin-top:8px;font-size:14px;color:var(--text3);border-top:1px solid rgba(251,191,36,0.12);padding-top:6px">
                Numerik → Median (robust vs outlier) &nbsp;|&nbsp; Kategorikal → Modus &nbsp;|&nbsp; &gt;50% kolom kosong → Baris dihapus
              </div>
            </div>` : ''}
          </div>`;
      } else {
        html += `
          <div style="background:var(--green-bg);border:1px solid rgba(52,211,153,0.3);
            border-radius:var(--radius);padding:0.65rem 1rem;font-size:17px;color:var(--green);margin-bottom:1rem;
            display:flex;align-items:center;gap:8px">
            <span style="font-size:20px">✓</span>
            <span>Data bersih: <strong>${cr.original.toLocaleString()} baris</strong> dimuat tanpa missing value, duplikat, atau imputasi.</span>
          </div>`;
      }
    }
  
    html += `
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:1rem 0 0.5rem">
        <div class="metric-card"><div class="metric-label">Total Data</div><div class="metric-val metric-blue">${total.toLocaleString()}</div></div>
        <div class="metric-card"><div class="metric-label">Data Training</div><div class="metric-val metric-blue">${nTrain.toLocaleString()}</div></div>
        <div class="metric-card"><div class="metric-label">Data Testing</div><div class="metric-val metric-blue">${nTest.toLocaleString()}</div></div>
        <div class="metric-card"><div class="metric-label">Fitur</div><div class="metric-val metric-blue">${featureCols.length}</div></div>
        <div class="metric-card"><div class="metric-label">Kelas</div><div class="metric-val metric-blue">${classes.length}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:1rem">
        <div class="metric-card"><div class="metric-label">Benar</div><div class="metric-val metric-green">${correct.toLocaleString()}</div></div>
        <div class="metric-card"><div class="metric-label">Salah</div><div class="metric-val metric-red">${(nTest-correct).toLocaleString()}</div></div>
        <div class="metric-card"><div class="metric-label">Akurasi</div>
          <div class="metric-val ${parseFloat(accuracy)>=70?'metric-green':'metric-red'}">${accuracy}%</div>
        </div>
        <div class="metric-card"><div class="metric-label">Macro Precision</div><div class="metric-val metric-blue">${(macroP*100).toFixed(1)}%</div></div>
        <div class="metric-card"><div class="metric-label">Macro Recall</div><div class="metric-val metric-blue">${(macroR*100).toFixed(1)}%</div></div>
        <div class="metric-card"><div class="metric-label">Macro F1</div><div class="metric-val ${macroF1>=0.7?'metric-green':'metric-red'}">${(macroF1*100).toFixed(1)}%</div></div>
      </div>`;
  
    /* ---- Confusion Matrix ---- */
    html += `
      <div class="section">
        <div class="section-head">
          <div class="step-circle" style="background:var(--yellow);color:#000">CM</div>
          <div class="section-title">Confusion Matrix</div>
        </div>
        <div class="section-body">
          <div class="info-box">
            <strong>Baris</strong> = kelas aktual &nbsp;|&nbsp; <strong>Kolom</strong> = kelas prediksi.<br>
            Diagonal (hijau) = prediksi benar. Luar diagonal (merah) = prediksi salah.
          </div>
          <div class="tbl-wrap" style="overflow-x:auto">
            <table style="min-width:max-content">
              <thead>
                <tr>
                  <th style="background:var(--bg4)">Aktual \\ Prediksi</th>
                  ${classes.map(c=>`<th style="background:var(--bg4)">${c}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${classes.map(actual => `
                <tr>
                  <td style="font-weight:600;background:var(--bg3)">${actual}</td>
                  ${classes.map(pred => {
                    const v    = confMat[actual][pred];
                    const diag = actual === pred;
                    return `<td class="mono" style="text-align:center;font-size:22px;
                      background:${diag ? 'rgba(52,211,153,0.12)' : v > 0 ? 'rgba(248,113,113,0.1)' : ''};
                      color:${diag ? 'var(--green)' : v > 0 ? 'var(--red)' : 'var(--text3)'};
                      font-weight:${diag||v>0?'600':'400'}">
                      ${v}
                    </td>`;
                  }).join('')}
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
  
          <!-- Precision / Recall / F1 per kelas -->
          <div style="margin-top:1.25rem;font-size:20px;font-weight:500;color:var(--text2);margin-bottom:0.5rem">
            Metrik per Kelas
          </div>
          <div class="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Kelas</th><th>TP</th><th>FP</th><th>FN</th>
                  <th>Precision</th><th>Recall</th><th>F1-Score</th>
                </tr>
              </thead>
              <tbody>
                ${classes.map(c => {
                  const m = metrics[c];
                  const pct = v => (v*100).toFixed(2) + '%';
                  const color = v => v >= 0.7 ? 'var(--green)' : v >= 0.5 ? 'var(--yellow)' : 'var(--red)';
                  return `<tr>
                    <td style="font-weight:600">${c}</td>
                    <td class="mono" style="color:var(--green)">${m.tp}</td>
                    <td class="mono" style="color:var(--red)">${m.fp}</td>
                    <td class="mono" style="color:var(--yellow)">${m.fn}</td>
                    <td class="mono" style="color:${color(m.precision)}">${pct(m.precision)}</td>
                    <td class="mono" style="color:${color(m.recall)}">${pct(m.recall)}</td>
                    <td class="mono" style="color:${color(m.f1)};font-weight:600">${pct(m.f1)}</td>
                  </tr>`;
                }).join('')}
                <tr style="border-top:2px solid var(--border2)">
                  <td style="font-weight:600;color:var(--text2)">Macro Avg</td>
                  <td>–</td><td>–</td><td>–</td>
                  <td class="mono" style="font-weight:600">${(macroP*100).toFixed(2)}%</td>
                  <td class="mono" style="font-weight:600">${(macroR*100).toFixed(2)}%</td>
                  <td class="mono" style="font-weight:600;color:${macroF1>=0.7?'var(--green)':'var(--yellow)'}">${(macroF1*100).toFixed(2)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  
    /* ================================================================
       STEP 1 — PRIOR
    ================================================================ */
    // Excel: di Sheet Perhitungan, buat tabel prior.
    // Kolom A=Kelas, B=Jumlah, C=Total, D=P(C)
    // Asumsikan tabel Prior mulai di A1 di Sheet Perhitungan
    const priorExcelRows = [];
    classes.forEach((c, ci) => {
      const sheetRow = ci + 2; // baris 1=header, baris 2 dst = data
      priorExcelRows.push({
        cell: `B${sheetRow}`,
        formula: `=COUNTIF(${classRange},"${c}")`,
        comment: `Hitung jumlah baris kelas "${c}" di Dataset`
      });
      priorExcelRows.push({
        cell: `C${sheetRow}`,
        formula: `=COUNTA(${classRange})`,
        comment: `Total data (semua baris kelas)`
      });
      priorExcelRows.push({
        cell: `D${sheetRow}`,
        formula: `=B${sheetRow}/C${sheetRow}`,
        comment: `P(${c}) = jumlah / total`
      });
    });
  
    html += `
      <div class="section">
        <div class="section-head">
          <div class="step-circle">1</div>
          <div class="section-title">Probabilitas Prior — P(C)</div>
        </div>
        <div class="section-body">
          <div class="info-box">
            <strong>Konsep:</strong> Prior probability adalah probabilitas kemunculan kelas
            sebelum melihat data fitur apapun. Dihitung dari frekuensi relatif setiap kelas dalam dataset.<br><br>
            <strong>Rumus:</strong> P(C) = jumlah data kelas C / total data
          </div>
          <div class="tbl-wrap">
            <table>
              <thead>
                <tr><th>Kelas (C)</th><th>Jumlah Data</th><th>Total Data</th><th>Perhitungan</th><th>P(C)</th></tr>
              </thead>
              <tbody>
                ${classes.map(c => `
                <tr>
                  <td style="font-weight:600">${c}</td>
                  <td class="mono">${classCounts[c]}</td>
                  <td class="mono">${total}</td>
                  <td class="mono">${classCounts[c]} / ${total}</td>
                  <td class="mono" style="color:var(--accent)">${priors[c].toFixed(4)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div class="formula">${classes.map(c =>
            `P(${c}) = ${classCounts[c]}/${total} = ${priors[c].toFixed(4)}`).join('\n')}</div>
  
          ${buildExcelBlock('exc-prior', [
            { cell: 'A1 (header)', formula: 'Kelas', comment: 'Judul kolom — ketik manual' },
            { cell: 'B1 (header)', formula: 'Jumlah', comment: '' },
            { cell: 'C1 (header)', formula: 'Total', comment: '' },
            { cell: 'D1 (header)', formula: 'P(C)', comment: '' },
            ...classes.flatMap((c, ci) => {
              const r = ci + 2;
              return [
                { cell: `A${r}`, formula: c, comment: `Nama kelas — ketik manual` },
                { cell: `B${r}`, formula: `=COUNTIF(${classRange},"${c}")`, comment: `Jumlah baris kelas "${c}"` },
                { cell: `C${r}`, formula: `=COUNTA(${classRange})`, comment: `Total semua data` },
                { cell: `D${r}`, formula: `=B${r}/C${r}`, comment: `P(${c})` }
              ];
            })
          ])}
        </div>
      </div>`;
  
    /* ================================================================
       STEP 2 — LIKELIHOOD PER FITUR
    ================================================================ */
    let likeBody = `
      <div class="info-box">
        <strong>Konsep:</strong> Likelihood = probabilitas nilai fitur xi muncul pada kelas C.
        Laplace Smoothing mencegah nilai nol jika suatu nilai tidak muncul di kelas tertentu.<br><br>
        <strong>Rumus:</strong> P(xi | C) = (COUNTIFS(kolom_fitur, xi, kolom_kelas, C) + 1) / (COUNTIF(kolom_kelas, C) + jumlah_nilai_unik_fitur)
      </div>`;
  
    // Perkiraan posisi baris awal tiap tabel likelihood di Sheet Perhitungan
    // Prior pakai baris 1..(classes.length+1), lalu baris kosong, likelihood mulai dari sini
    let likeSheetRowStart = classes.length + 3; // +1 header +1 baris kosong
  
    featureCols.forEach((feat, fi) => {
      const vals = featureVals[feat];
      const featColLetter = colMap[feat];
      const featRange = `Sheet1!$${featColLetter}$${dataRow1}:$${featColLetter}$${dataRowN}`;
  
      // Buat tabel likelihood untuk fitur ini
      // Kolom: A=Nilai xi, B..=P(xi|C) per kelas
      const hRow  = likeSheetRowStart;
      const tRows = [];
  
      // Rows Excel untuk blok ini
      const excRows = [
        { cell: `A${hRow} (header)`, formula: feat, comment: `Header fitur — ketik manual` },
        ...classes.map((c, ci) => ({
          cell: `${colLetter(ci+1)}${hRow} (header)`,
          formula: `P(${feat}|${c})`,
          comment: 'Header kolom kelas — ketik manual'
        }))
      ];
  
      vals.forEach((v, vi) => {
        const r = hRow + 1 + vi;
        excRows.push({ cell: `A${r}`, formula: v, comment: `Nilai unik "${feat}" — ketik manual` });
  
        classes.forEach((c, ci) => {
          const cnt = (freqMap[feat][c] && freqMap[feat][c][v]) || 0;
          const nC  = classCounts[c];
          const p   = (cnt + 1) / (nC + vals.length);
          const cellAddr = `${colLetter(ci+1)}${r}`;
          excRows.push({
            cell: cellAddr,
            formula: `=(COUNTIFS(${featRange},"${v}",${classRange},"${c}")+1)/(COUNTIF(${classRange},"${c}")+${vals.length})`,
            comment: `P(${feat}="${v}"|${c}) — ${vals.length} nilai unik`
          });
          tRows.push({ v, c, cnt, p });
        });
      });
  
      likeBody += `
        <div style="font-size:36px;font-weight:500;color:var(--text);margin:1.25rem 0 0.3rem;">
          Fitur: <span style="color:var(--accent)">${feat}</span>
        </div>
        <div class="vals-scroll">${vals.join(', ')}</div>
        <div class="tbl-wrap-scroll">
          <table>
            <thead>
              <tr>
                <th>Nilai (xi)</th>
                ${classes.map(c => `<th>P(${feat}&#124;${c})</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${vals.map(v => {
                return `<tr>
                  <td style="font-weight:600">${v}</td>
                  ${classes.map(c => {
                    // Gunakan freqMap & classCounts dari training set, bukan filter ulang data (test set)
                    const cnt = (freqMap[feat][c] && freqMap[feat][c][v]) || 0;
                    const nC  = classCounts[c];
                    const p   = (cnt + 1) / (nC + vals.length);
                    return `<td class="mono">(${cnt}+1)/(${nC}+${vals.length})
                      = <span style="color:var(--accent)">${p.toFixed(4)}</span></td>`;
                  }).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        ${buildExcelBlock(`exc-like-${fi}`, excRows)}`;
  
      // Geser posisi baris untuk fitur berikutnya: header + baris nilai + 2 kosong
      likeSheetRowStart += 1 + vals.length + 2;
    });
  
    html += `
      <div class="section">
        <div class="section-head">
          <div class="step-circle">2</div>
          <div class="section-title">Likelihood dengan Laplace Smoothing — P(xi | C)</div>
        </div>
        <div class="section-body">${likeBody}</div>
      </div>`;
  
    /* ================================================================
       STEP 3 — POSTERIOR
    ================================================================ */
    let postBody = `
      <div class="info-box">
        <strong>Data yang diklasifikasi (baris ke-${exIdx+1} / baris terakhir):</strong><br>
        ${featureCols.map((f,i)=>`<strong>${f}</strong> = ${exRow.features[i]}`).join(' &nbsp;|&nbsp; ')}<br>
        <em style="color:var(--text3)">Label asli: ${exRow.label}</em>
      </div>
      <p style="font-size:30px;color:var(--text2);margin-bottom:0.5rem">
        Rumus posterior:&nbsp;
        <strong style="color:var(--text)">P(C|X) &prop; P(C) &times; P(x1|C) &times; P(x2|C) &times; &hellip;</strong>
      </p>`;
  
    // Baris data contoh di Sheet1
    const excelExRow = exIdx + dataRow1; // baris Excel di Sheet1
  
    classes.forEach(c => {
      // Gunakan freqMap & classCounts dari training set untuk konsistensi dengan Step 2
      let steps = `= ${priors[c].toFixed(4)}`;
      let val   = priors[c];
      let label = `P(${c}|X) = P(${c})`;
  
      featureCols.forEach((feat, fi) => {
        const v    = exRow.features[fi];
        const vals = featureVals[feat];
        const cnt  = (freqMap[feat][c] && freqMap[feat][c][v]) || 0;
        const nC   = classCounts[c];
        const lk   = (cnt + 1) / (nC + vals.length);
        label += ` × P(${feat}=${v}|${c})`;
        steps += ` × ${lk.toFixed(4)}`;
        val   *= lk;
      });
  
      const isWinner = c === exPred;
      postBody += `
        <div style="margin-bottom:4px;font-size:25px;color:var(--text2)">${label}</div>
        <div class="formula" style="${isWinner?'border-left-color:var(--green);color:#a8ffcc':''}">
  ${steps}
  = ${val.toFixed(8)}${isWinner ? '  ← TERBESAR' : ''}
        </div>`;
    });
  
    // Excel untuk posterior: COUNTIF + COUNTIFS merujuk ke baris contoh di Sheet1
    const postExcelRows = [];
  
    // Untuk tiap kelas, hitung posterior mengacu baris excelExRow
    classes.forEach((c, ci) => {
      const cellPost = `${colLetter(ci)}${likeSheetRowStart + 2}`; // posisi perkiraan di sheet Perhitungan
      // Prior
      const priorFormula = `COUNTIF(${classRange},"${c}")/COUNTA(${classRange})`;
      // Likelihood per fitur
      const likeFormulas = featureCols.map((feat, fi) => {
        const featColLetter = colMap[feat];
        const featRange     = `Sheet1!$${featColLetter}$${dataRow1}:$${featColLetter}$${dataRowN}`;
        const vals          = featureVals[feat];
        // Nilai fitur dari baris contoh di Sheet1
        const valRef = `Sheet1!${featColLetter}${excelExRow}`;
        return `(COUNTIFS(${featRange},${valRef},${classRange},"${c}")+1)/(COUNTIF(${classRange},"${c}")+${vals.length})`;
      });
  
      const fullFormula = `=(${priorFormula})*` + likeFormulas.join('*');
      postExcelRows.push({
        cell: `sel P(${c}|X)`,
        formula: fullFormula,
        comment: `Posterior kelas "${c}" untuk baris ke-${exIdx+1}`
      });
    });
  
    // Prediksi = kelas dengan nilai posterior terbesar
    // Asumsikan posterior kelas ada di sel B_n, C_n, D_n dst. — pakai INDEX+MATCH
    const posteriorCells = classes.map((c, ci) => `<sel_posterior_${c}>`).join(', ');
    postExcelRows.push({
      cell: 'sel Prediksi',
      formula: `=INDEX({"${classes.join('","')}"},MATCH(MAX(<sel_posterior_tiap_kelas>),(<sel_posterior_tiap_kelas>),0))`,
      comment: 'Ganti <sel_posterior_tiap_kelas> dengan range sel posterior di atas'
    });
  
    postBody += `
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Kelas</th><th>Nilai Posterior</th><th>Keputusan</th></tr></thead>
          <tbody>
            ${classes.map(c => `
            <tr class="${c===exPred?'row-hl':''}">
              <td style="font-weight:600">${c}</td>
              <td class="mono">${exPost[c].toFixed(8)}</td>
              <td>${c===exPred?`<span class="chip chip-ok">&#10003; Prediksi = ${c}</span>`:'–'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="pred-banner ${exPred===exRow.label?'':'wrong'}">
        <div style="font-weight:600;font-size:20px;margin-bottom:4px">
          ${exPred===exRow.label?'&#10003; Prediksi BENAR':'&#10007; Prediksi SALAH'}
        </div>
        <div style="font-size:20px;opacity:0.85">
          Model memprediksi kelas <strong>${exPred}</strong>.
          Label asli adalah <strong>${exRow.label}</strong>.
        </div>
      </div>
      ${buildExcelBlock('exc-post', postExcelRows)}`;
  
    html += `
      <div class="section">
        <div class="section-head">
          <div class="step-circle">3</div>
          <div class="section-title">Klasifikasi Contoh (Baris Terakhir)</div>
        </div>
        <div class="section-body">${postBody}</div>
      </div>`;
  
    /* ================================================================
       STEP 4 — AKURASI + RUMUS EVALUASI LENGKAP
    ================================================================ */
    // Excel: kolom prediksi menggunakan formula posterior per baris
    const accExcelRows = [];
    const predColIdx = featureCols.length + 2; // setelah kolom fitur + kelas + no
    const predColLetter = colLetter(predColIdx);
  
    // Header
    accExcelRows.push({ cell: `${predColLetter}1`, formula: 'Prediksi', comment: 'Kolom prediksi — ketik manual sebagai header' });
  
    // Untuk baris pertama data (baris 2), buat formula posterior + INDEX/MATCH
    const r2 = dataRow1;
    classes.forEach((c, ci) => {
      const postParts = featureCols.map((feat, fi) => {
        const featColLetter = colMap[feat];
        const featRangeFull = `Sheet1!$${featColLetter}$${dataRow1}:$${featColLetter}$${dataRowN}`;
        const vals = featureVals[feat];
        return `(COUNTIFS(${featRangeFull},Sheet1!${featColLetter}${r2},${classRange},"${c}")+1)/(COUNTIF(${classRange},"${c}")+${vals.length})`;
      });
      const postFormula = `(COUNTIF(${classRange},"${c}")/COUNTA(${classRange}))*` + postParts.join('*');
      accExcelRows.push({
        cell: `Post_${c} di baris ${r2}`,
        formula: `=${postFormula}`,
        comment: `Posterior kelas "${c}" untuk baris ${r2}`
      });
    });
  
    // Formula prediksi (INDEX+MATCH dari posteriors)
    const postFormulasParts = classes.map((c, ci) => {
      const postParts = featureCols.map((feat, fi) => {
        const featColLetter = colMap[feat];
        const featRangeFull = `Sheet1!$${featColLetter}$${dataRow1}:$${featColLetter}$${dataRowN}`;
        const vals = featureVals[feat];
        return `(COUNTIFS(${featRangeFull},Sheet1!${featColLetter}${r2},${classRange},"${c}")+1)/(COUNTIF(${classRange},"${c}")+${vals.length})`;
      });
      return `(COUNTIF(${classRange},"${c}")/COUNTA(${classRange}))*` + postParts.join('*');
    });
    const predFormula = `=INDEX({"${classes.join('","')}"},MATCH(MAX(${postFormulasParts.join(',')}),(${postFormulasParts.join(',')}),0))`;
  
    accExcelRows.push({
      cell: `${predColLetter}${r2}`,
      formula: predFormula,
      comment: `Prediksi kelas untuk baris ${r2} — salin ke baris ${r2+1} hingga ${dataRowN}`
    });
  
    const statusColLetter = colLetter(predColIdx + 1);
    accExcelRows.push({
      cell: `${statusColLetter}${r2}`,
      formula: `=IF(${predColLetter}${r2}=Sheet1!${colMap[classCol]}${r2},"Benar","Salah")`,
      comment: `Bandingkan prediksi vs label asli`
    });
  
    accExcelRows.push({
      cell: `sel Akurasi`,
      formula: `=COUNTIF(${statusColLetter}${r2}:${statusColLetter}${dataRowN},"Benar")/COUNTA(${classRange})*100`,
      comment: `Persentase akurasi keseluruhan`
    });
  
    // ── Bangun tabel rumus evaluasi per kelas ──
    const evalFormulaRows = classes.map(c => {
      const m  = metrics[c];
      const pct = v => (v * 100).toFixed(2) + '%';
      const colorV = v => v >= 0.7 ? 'var(--green)' : v >= 0.5 ? 'var(--yellow)' : 'var(--red)';
      return `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="font-weight:600;padding:10px 12px">${c}</td>
          <td class="mono" style="padding:10px 12px;color:var(--green)">${m.tp}</td>
          <td class="mono" style="padding:10px 12px;color:var(--red)">${m.fp}</td>
          <td class="mono" style="padding:10px 12px;color:var(--yellow)">${m.fn}</td>
          <td style="padding:10px 12px">
            <div class="formula" style="margin:0;font-size:15px;padding:4px 8px">
              TP / (TP + FP) = ${m.tp} / (${m.tp} + ${m.fp}) = ${m.tp + m.fp > 0 ? m.tp + '/' + (m.tp + m.fp) : '–'}
            </div>
            <div style="color:${colorV(m.precision)};font-family:var(--mono);font-size:16px;margin-top:3px">${pct(m.precision)}</div>
          </td>
          <td style="padding:10px 12px">
            <div class="formula" style="margin:0;font-size:15px;padding:4px 8px">
              TP / (TP + FN) = ${m.tp} / (${m.tp} + ${m.fn}) = ${m.tp + m.fn > 0 ? m.tp + '/' + (m.tp + m.fn) : '–'}
            </div>
            <div style="color:${colorV(m.recall)};font-family:var(--mono);font-size:16px;margin-top:3px">${pct(m.recall)}</div>
          </td>
          <td style="padding:10px 12px">
            <div class="formula" style="margin:0;font-size:15px;padding:4px 8px">
              2 × P × R / (P + R) = 2 × ${m.precision.toFixed(3)} × ${m.recall.toFixed(3)} / (${m.precision.toFixed(3)} + ${m.recall.toFixed(3)})
            </div>
            <div style="color:${colorV(m.f1)};font-family:var(--mono);font-size:16px;margin-top:3px;font-weight:600">${pct(m.f1)}</div>
          </td>
        </tr>`;
    }).join('');
  
    html += `
      <div class="section">
        <div class="section-head">
          <div class="step-circle">4</div>
          <div class="section-title">Akurasi — Seluruh Dataset</div>
        </div>
        <div class="section-body">
  
          <!-- ── Rumus evaluasi ── -->
          <div class="info-box" style="margin-bottom:1.25rem">
            <strong>Rumus Evaluasi Klasifikasi:</strong><br><br>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:6px">
              <div>
                <div style="color:var(--text3);font-size:15px;font-family:var(--mono);margin-bottom:3px">ACCURACY</div>
                <div class="formula" style="margin:0;font-size:16px;padding:6px 10px">
                  (TP + TN) / Total Testing = ${correct} / ${nTest}
                  = <span style="color:var(--green);font-weight:600">${accuracy}%</span>
                </div>
              </div>
              <div>
                <div style="color:var(--text3);font-size:15px;font-family:var(--mono);margin-bottom:3px">PRECISION (per kelas)</div>
                <div class="formula" style="margin:0;font-size:16px;padding:6px 10px">TP / (TP + FP)</div>
              </div>
              <div>
                <div style="color:var(--text3);font-size:15px;font-family:var(--mono);margin-bottom:3px">RECALL (per kelas)</div>
                <div class="formula" style="margin:0;font-size:16px;padding:6px 10px">TP / (TP + FN)</div>
              </div>
              <div>
                <div style="color:var(--text3);font-size:15px;font-family:var(--mono);margin-bottom:3px">F1-SCORE (per kelas)</div>
                <div class="formula" style="margin:0;font-size:16px;padding:6px 10px">2 × Precision × Recall / (Precision + Recall)</div>
              </div>
              <div>
                <div style="color:var(--text3);font-size:15px;font-family:var(--mono);margin-bottom:3px">MACRO AVG</div>
                <div class="formula" style="margin:0;font-size:16px;padding:6px 10px">Rata-rata metrik dari semua kelas (bobot sama)</div>
              </div>
            </div>
            <div style="margin-top:10px;font-size:15px;color:var(--text3)">
              <strong style="color:var(--text2)">Keterangan:</strong>
              TP = True Positive &nbsp;|&nbsp; FP = False Positive &nbsp;|&nbsp; FN = False Negative &nbsp;|&nbsp;
              TN = True Negative (kelas lain yang benar)
            </div>
          </div>
  
          <!-- ── Tabel perhitungan evaluasi per kelas ── -->
          <div style="font-size:20px;font-weight:500;color:var(--text2);margin-bottom:0.5rem">
            Perhitungan Evaluasi Tiap Kelas
          </div>
          <div class="tbl-wrap" style="overflow-x:auto">
            <table style="min-width:max-content">
              <thead>
                <tr>
                  <th>Kelas</th>
                  <th>TP</th><th>FP</th><th>FN</th>
                  <th>Precision (rumus)</th>
                  <th>Recall (rumus)</th>
                  <th>F1-Score (rumus)</th>
                </tr>
              </thead>
              <tbody>
                ${evalFormulaRows}
                <tr style="border-top:2px solid var(--border2);background:var(--bg3)">
                  <td style="font-weight:600;padding:10px 12px;color:var(--text2)">Macro Avg</td>
                  <td colspan="3" style="padding:10px 12px;font-size:15px;color:var(--text3)">
                    Rata-rata ${classes.length} kelas
                  </td>
                  <td style="padding:10px 12px">
                    <div class="formula" style="margin:0;font-size:15px;padding:4px 8px">
                      (${classes.map(c=>(metrics[c].precision*100).toFixed(2)+'%').join(' + ')}) / ${classes.length}
                    </div>
                    <div style="font-family:var(--mono);font-size:16px;margin-top:3px;font-weight:600">${(macroP*100).toFixed(2)}%</div>
                  </td>
                  <td style="padding:10px 12px">
                    <div class="formula" style="margin:0;font-size:15px;padding:4px 8px">
                      (${classes.map(c=>(metrics[c].recall*100).toFixed(2)+'%').join(' + ')}) / ${classes.length}
                    </div>
                    <div style="font-family:var(--mono);font-size:16px;margin-top:3px;font-weight:600">${(macroR*100).toFixed(2)}%</div>
                  </td>
                  <td style="padding:10px 12px">
                    <div class="formula" style="margin:0;font-size:15px;padding:4px 8px">
                      (${classes.map(c=>(metrics[c].f1*100).toFixed(2)+'%').join(' + ')}) / ${classes.length}
                    </div>
                    <div style="font-family:var(--mono);font-size:16px;margin-top:3px;font-weight:600;color:${macroF1>=0.7?'var(--green)':'var(--yellow)'}">${(macroF1*100).toFixed(2)}%</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
  
          <hr class="divider" style="margin:1.25rem 0">
  
          <div class="info-box" style="margin-bottom:0.5rem">
            ${nTest > 500 ? `<strong>Data testing besar (${nTest.toLocaleString()} baris)</strong> — menampilkan 500 baris pertama data testing. Download Excel untuk data lengkap.` : `Menampilkan semua ${nTest} baris data testing.`}
          </div>
          <div class="tbl-wrap-scroll" id="acc-table-wrap">
            <table id="acc-table">
              <thead>
                <tr>
                  <th>#</th>
                  ${featureCols.map(f=>`<th>${f}</th>`).join('')}
                  <th>${classCol}</th><th>Prediksi</th><th>Status</th>
                </tr>
              </thead>
              <tbody id="acc-tbody"></tbody>
            </table>
          </div>
  
          ${buildExcelBlock('exc-acc', accExcelRows)}
  
          <div class="page-footer">
            <button class="btn btn-green" onclick="exportExcel('plain')">&#8659; Download Excel (Plain Value)</button>
            <button class="btn btn-green" style="background:rgba(79,156,249,0.15);color:var(--accent);border-color:rgba(79,156,249,0.35)" onclick="exportExcel('formula')">&#8659; Download Excel (Formula)</button>
            <button class="btn btn-sm" onclick="showInput()">&#8592; Kembali ke Input</button>
            <button class="btn btn-sm" onclick="window.location.href='../index.html'">&#8962; Beranda</button>
          </div>
        </div>
      </div>`;
  
    document.getElementById('result-content').innerHTML = html;
    showResult();
  
    // Render tabel akurasi secara async setelah UI tampil
    // Hanya render max 500 baris agar DOM tidak berat
    const RENDER_LIMIT = 500;
    const renderCount  = Math.min(nTest, RENDER_LIMIT);
    const tbody        = document.getElementById('acc-tbody');
    if (tbody) {
      let rowsHtml = '';
      for (let i = 0; i < renderCount; i++) {
        const row = data[i];
        const ok  = allPreds[i].pred === row.label;
        rowsHtml +=
          `<tr>
            <td class="mono" style="color:var(--text3)">${i+1}</td>
            ${row.features.map(v=>`<td>${v}</td>`).join('')}
            <td style="font-weight:500">${row.label}</td>
            <td class="mono">${allPreds[i].pred}</td>
            <td>${ok
              ?'<span class="chip chip-ok">&#10003; Benar</span>'
              :'<span class="chip chip-fail">&#10007; Salah</span>'}</td>
          </tr>`;
      }
      tbody.innerHTML = rowsHtml;
    }
  }