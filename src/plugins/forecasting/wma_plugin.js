/**
 * src/plugins/forecasting/wma_plugin.js
 * Weighted Moving Average (WMA) Forecasting Plugin
 */

class WMAPlugin extends AlgorithmPlugin {
  id = 'wma';
  name = 'Weighted Moving Average (WMA)';
  description = 'Metode peramalan rata-rata bergerak dengan pembobotan.';
  uiMode = 'forecasting';
  pluginFolder = 'forecasting'; // Path subfolder untuk Worker importScripts
  
  configSchema = {
    window_size: {
      label: 'Window Size (Periode N)',
      type: 'number',
      default: 3,
      min: 2,
      step: 1
    },
    weight_mode: {
      label: 'Mode Pembobotan',
      type: 'select',
      options: [
        { value: 'auto', label: 'Otomatis (Linear n, n-1...)' },
        { value: 'custom', label: 'Kustom' }
      ],
      default: 'auto'
    },
    weights_custom: {
      label: 'Bobot Kustom (pisahkan dengan koma, urut dari terlama ke terbaru)',
      type: 'text',
      default: '1, 2, 3'
    },
    forecast_horizon: {
      label: 'Forecast Horizon (Periode ke Depan)',
      type: 'number',
      default: 3,
      min: 1,
      step: 1
    }
  };

  constructor() {
    super();
  }

  async process(trainData, testData, config, onProgress) {
    onProgress('Memulai', 'Menyiapkan data time series', 10);

    const windowSize = parseInt(config.window_size) || 3;
    const horizon = parseInt(config.forecast_horizon) || 3;
    const dateCol = config.featureCols[0];
    const valCol = config.classCol;

    if (trainData.length < windowSize) {
      throw new Error(`Data terlalu sedikit. Minimal data historis: ${windowSize}`);
    }

    // Tentukan bobot
    let weights = [];
    if (config.weight_mode === 'custom') {
      const strW = config.weights_custom || '';
      weights = strW.split(',').map(s => parseFloat(s.trim()));
      if (weights.length !== windowSize) {
        throw new Error(`Jumlah bobot kustom (${weights.length}) harus sama dengan Window Size (${windowSize})`);
      }
      if (weights.some(isNaN)) {
        throw new Error('Bobot kustom mengandung karakter tidak valid.');
      }
    } else {
      // Auto: dari terlama=1 ke terbaru=n
      for (let i = 1; i <= windowSize; i++) {
        weights.push(i);
      }
    }
    const sumW = weights.reduce((a, b) => a + b, 0);
    const normWeights = weights.map(w => w / sumW);

    let sortedData = prepareTimeSeriesData(trainData, dateCol);

    onProgress('Kalkulasi', 'Menghitung Weighted Moving Average', 40);

    const historical = [];
    
    for (let i = 0; i < sortedData.length; i++) {
      const actual = parseFloat(sortedData[i][valCol]);
      let forecast = null;

      if (i >= windowSize) {
        let sum = 0;
        // WMA: sum(Val_j * Weight_j) / sum(Weights)
        // j=0 (terlama), j=windowSize-1 (terbaru)
        for (let j = 0; j < windowSize; j++) {
          sum += parseFloat(sortedData[i - windowSize + j][valCol]) * normWeights[j];
        }
        forecast = sum;
      }

      historical.push({
        label: String(sortedData[i][dateCol]),
        actual: actual,
        forecast: forecast
      });
    }

    onProgress('Forecasting', 'Menghitung ramalan masa depan', 70);

    const future = [];
    const recentValues = historical.slice(-windowSize).map(d => d.actual);
    
    for (let i = 1; i <= horizon; i++) {
      let sum = 0;
      for (let j = 0; j < windowSize; j++) {
         sum += recentValues[j] * normWeights[j];
      }
      const f_val = sum;
      future.push({
        label: `T+${i}`,
        actual: null,
        forecast: f_val
      });
      recentValues.push(f_val);
      recentValues.shift();
    }

    onProgress('Selesai', 'Perhitungan selesai', 100);

    const metrics = Metrics.evaluate(
      historical.filter(h => h.forecast !== null).map(h => h.actual),
      historical.filter(h => h.forecast !== null).map(h => h.forecast)
    );

    return {
      windowSize,
      horizon,
      weights,
      normWeights,
      dateCol,
      valCol,
      historical,
      future,
      metrics
    };
  }

  renderHTML(result, container) {
    let html = `<h3>Ringkasan WMA (Window=${result.windowSize})</h3>`;
    html += `<p style="font-size:12px;color:var(--text2);margin-bottom:15px;">Bobot Relatif (Terlama &rarr; Terbaru): <code>[${result.normWeights.map(w => w.toFixed(3)).join(', ')}]</code></p>`;
    
    html += `
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-title">MAE</div>
          <div class="metric-value">${result.metrics.mae.toFixed(4)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">RMSE</div>
          <div class="metric-value">${result.metrics.rmse.toFixed(4)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">MAPE</div>
          <div class="metric-value">${result.metrics.mape.toFixed(2)}%</div>
        </div>
      </div>
    `;

    const chartData = result.historical.concat(result.future);
    const svgHTML = SVGChart.renderLineChart(chartData, { width: 800, height: 350 });
    html += `<div class="chart-container">${svgHTML}</div>`;

    html += `<h4 class="mt-md mb-sm">Detail Perhitungan Time Series</h4>
             <div class="fc-table-scroll">
               <table class="fc-table">
                 <thead>
                   <tr>
                     <th style="text-align:left">Waktu</th>
                     <th>Aktual</th>
                     <th>Forecast WMA</th>
                     <th>Error</th>
                   </tr>
                 </thead>
                 <tbody>`;

    chartData.forEach(d => {
      const act = d.actual !== null ? d.actual.toFixed(2) : '-';
      const fcast = d.forecast !== null ? d.forecast.toFixed(2) : '-';
      const err = (d.actual !== null && d.forecast !== null) ? (d.actual - d.forecast).toFixed(2) : '-';
      html += `<tr>
                 <td style="text-align:left">${escapeHTML(d.label)}</td>
                 <td class="fc-actual">${act}</td>
                 <td class="fc-forecast">${fcast}</td>
                 <td class="fc-error">${err}</td>
               </tr>`;
    });

    html += `</tbody></table></div>`;
    
    const wFormula = result.normWeights.map((w, i) => `B${i+1}*${w.toFixed(2)}`).join('+');
    html += this._buildExcelBlock('wma-excel', [
      { cell: `C${result.windowSize + 1}`, formula: `=${wFormula}`, comment: `Sesuai bobot normWeights (terlama:terbaru)` }
    ]);

    container.innerHTML = html;
  }

  exportExcel(result, mode) {
    if (typeof XLSX === 'undefined') throw new Error("SheetJS (XLSX) tidak ditemukan.");
    const wb = XLSX.utils.book_new();

    const wsData = XLSX.utils.json_to_sheet(result.historical.map(d => ({Waktu: d.label, Aktual: d.actual})));
    XLSX.utils.book_append_sheet(wb, wsData, "Dataset");

    const calcRows = [["Waktu", "Aktual", "WMA Forecast", "Error"]];
    result.historical.forEach((d, i) => {
      const rowNum = i + 2;
      let fcast = d.forecast !== null ? d.forecast : "";
      if (mode === 'formula' && i >= result.windowSize) {
        const terms = [];
        for (let j=0; j<result.windowSize; j++) {
           terms.push(`B${rowNum - result.windowSize + j}*${result.normWeights[j]}`);
        }
        fcast = { f: terms.join('+') };
      }
      
      const err = (i >= result.windowSize && mode === 'formula') ? { f: `B${rowNum}-C${rowNum}` } : (d.forecast !== null ? d.actual - d.forecast : "");
      calcRows.push([d.label, d.actual, fcast, err]);
    });
    
    let lastRow = result.historical.length + 1;
    result.future.forEach((d, i) => {
      const rowNum = lastRow + i + 1;
      let fcast = d.forecast;
      if (mode === 'formula') {
        const terms = [];
        for (let j=0; j<result.windowSize; j++) {
           terms.push(`B${rowNum - result.windowSize + j}*${result.normWeights[j]}`);
        }
        // Jika B kosong, excel menganggap 0. Harusnya kita refer C untuk prediksi iteratif.
        // Tapi simulasi statis sementara ini pakai d.forecast karena referensi silang kompleks
        fcast = d.forecast; 
      }
      calcRows.push([d.label, "", fcast, ""]);
    });

    const wsCalc = XLSX.utils.aoa_to_sheet(calcRows);
    XLSX.utils.book_append_sheet(wb, wsCalc, "Perhitungan");

    const wsResult = XLSX.utils.json_to_sheet([
      { Metric: "MAE", Value: result.metrics.mae },
      { Metric: "MSE", Value: result.metrics.mse },
      { Metric: "RMSE", Value: result.metrics.rmse },
      { Metric: "MAPE", Value: result.metrics.mape }
    ]);
    XLSX.utils.book_append_sheet(wb, wsResult, "Evaluasi");

    return wb;
  }
}

if (typeof registry !== 'undefined') registry.register(new WMAPlugin());
