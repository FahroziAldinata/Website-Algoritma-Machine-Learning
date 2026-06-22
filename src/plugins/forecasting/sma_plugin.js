/**
 * src/plugins/forecasting/sma_plugin.js
 * Simple Moving Average (SMA) Forecasting Plugin
 */

class SMAPlugin extends AlgorithmPlugin {
  id = 'sma';
  name = 'Simple Moving Average (SMA)';
  description = 'Metode peramalan nilai rata-rata pergerakan sederhana.';
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
    forecast_horizon: {
      label: 'Forecast Horizon (Bulan/Periode ke Depan)',
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
    const dateCol = config.featureCols[0]; // Hanya 1 fitur (tanggal)
    const valCol = config.classCol; // Target

    if (trainData.length < windowSize) {
      throw new Error(`Data terlalu sedikit. Minimal data historis: ${windowSize}`);
    }

    // Urutkan data berdasarkan tanggal
    let sortedData = prepareTimeSeriesData(trainData, dateCol);

    onProgress('Kalkulasi', 'Menghitung Moving Average', 40);

    const historical = [];
    let sumAbsErr = 0, sumSqErr = 0, countErr = 0;

    for (let i = 0; i < sortedData.length; i++) {
      const actual = parseFloat(sortedData[i][valCol]);
      let forecast = null;

      if (i >= windowSize) {
        let sum = 0;
        for (let j = 1; j <= windowSize; j++) {
          sum += parseFloat(sortedData[i - j][valCol]);
        }
        forecast = sum / windowSize;
        
        const err = actual - forecast;
        sumAbsErr += Math.abs(err);
        sumSqErr += (err * err);
        countErr++;
      }

      historical.push({
        label: String(sortedData[i][dateCol]),
        actual: actual,
        forecast: forecast
      });
    }

    onProgress('Forecasting', 'Menghitung ramalan masa depan', 70);

    const future = [];
    // Menggunakan nilai prediksi terakhir yang berulang atau prediksi dinamis
    // Di sini kita gunakan naive SMA untuk masa depan (menggunakan prediksi terakhir atau data historis terakhir)
    // Untuk lebih akurat secara iteratif:
    const recentValues = historical.slice(-windowSize).map(d => d.actual);
    
    for (let i = 1; i <= horizon; i++) {
      let sum = 0;
      for (let j = 0; j < windowSize; j++) {
         sum += recentValues[recentValues.length - 1 - j];
      }
      const f_val = sum / windowSize;
      future.push({
        label: `T+${i}`,
        actual: null,
        forecast: f_val
      });
      // Geser window
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
      dateCol,
      valCol,
      historical,
      future,
      metrics
    };
  }

  renderHTML(result, container) {
    let html = `<h3>Ringkasan SMA (Window=${result.windowSize})</h3>`;
    
    // Metrics
    html += `
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-title">MAE</div>
          <div class="metric-value">${result.metrics.mae.toFixed(4)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">MSE</div>
          <div class="metric-value">${result.metrics.mse.toFixed(4)}</div>
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

    // SVG Chart
    const chartData = result.historical.concat(result.future);
    const svgHTML = SVGChart.renderLineChart(chartData, { width: 800, height: 350 });
    html += `<div class="chart-container">${svgHTML}</div>`;

    // Table
    html += `<h4 class="mt-md mb-sm">Detail Perhitungan Time Series</h4>
             <div class="fc-table-scroll">
               <table class="fc-table">
                 <thead>
                   <tr>
                     <th style="text-align:left">Waktu (${escapeHTML(result.dateCol)})</th>
                     <th>Aktual (${escapeHTML(result.valCol)})</th>
                     <th>Forecast SMA</th>
                     <th>Error (Aktual - Forecast)</th>
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

    // Excel guide block (dummy for visual representation)
    const excelRows = [
      { cell: 'C4', formula: '=AVERAGE(B1:B3)', comment: 'Formula untuk Moving Average periode ke-4 (dengan window=3)' },
      { cell: 'D4', formula: '=B4-C4', comment: 'Error perhitungan (Aktual - Prediksi)' }
    ];
    html += this._buildExcelBlock('sma-excel-guide', excelRows);

    container.innerHTML = html;
  }

  exportExcel(result, mode) {
    if (typeof XLSX === 'undefined') throw new Error("Pustaka SheetJS (XLSX) tidak ditemukan.");

    const wb = XLSX.utils.book_new();

    // Sheet 1: Dataset Historis
    const wsData = XLSX.utils.json_to_sheet(result.historical.map(d => ({
      Waktu: d.label,
      Aktual: d.actual
    })));
    XLSX.utils.book_append_sheet(wb, wsData, "Dataset");

    // Sheet 2: Perhitungan (Rolling Formula)
    const calcRows = [["Waktu", "Aktual", "SMA Forecast", "Error"]];
    result.historical.forEach((d, i) => {
      const rowNum = i + 2; // +1 untuk header, +1 karena 1-based index
      const fcast = (i >= result.windowSize && mode === 'formula') 
         ? { f: `AVERAGE(B${rowNum - result.windowSize}:B${rowNum - 1})` } 
         : (d.forecast !== null ? d.forecast : "");
      
      const err = (i >= result.windowSize && mode === 'formula')
         ? { f: `B${rowNum}-C${rowNum}` }
         : (d.forecast !== null ? (d.actual - d.forecast) : "");

      calcRows.push([d.label, d.actual, fcast, err]);
    });
    
    // Future
    let lastRow = result.historical.length + 1;
    result.future.forEach((d, i) => {
      const rowNum = lastRow + i + 1;
      const fcast = mode === 'formula' 
         ? { f: `AVERAGE(B${rowNum - result.windowSize}:B${rowNum - 1})` } 
         : d.forecast;
      // Kolom B kosong karena aktual belum ada
      calcRows.push([d.label, "", fcast, ""]);
    });

    const wsCalc = XLSX.utils.aoa_to_sheet(calcRows);
    XLSX.utils.book_append_sheet(wb, wsCalc, "Perhitungan");

    // Sheet 3: Result Summary
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

// Registrasi otomatis jika registry tersedia
if (typeof registry !== 'undefined') {
  registry.register(new SMAPlugin());
}
