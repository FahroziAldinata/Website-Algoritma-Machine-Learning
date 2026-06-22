/**
 * src/plugins/forecasting/ses_plugin.js
 * Single Exponential Smoothing (SES) Forecasting Plugin
 */

class SESPlugin extends AlgorithmPlugin {
  id = 'ses';
  name = 'Single Exponential Smoothing (SES)';
  description = 'Metode pemulusan eksponensial tunggal untuk data stasioner.';
  uiMode = 'forecasting';
  pluginFolder = 'forecasting'; // Path subfolder untuk Worker importScripts
  
  configSchema = {
    alpha: {
      label: 'Alpha (Konstanta Pemulusan) [0-1]',
      type: 'number',
      default: 0.2,
      min: 0.01,
      max: 1.0,
      step: 0.01
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

    const alpha = parseFloat(config.alpha) || 0.2;
    const horizon = parseInt(config.forecast_horizon) || 3;
    const dateCol = config.featureCols[0];
    const valCol = config.classCol;

    if (trainData.length < 2) {
      throw new Error('Data terlalu sedikit untuk eksponensial smoothing.');
    }
    if (alpha <= 0 || alpha > 1) {
      throw new Error('Nilai Alpha harus berada di antara 0 dan 1.');
    }

    let sortedData = prepareTimeSeriesData(trainData, dateCol);

    onProgress('Kalkulasi', 'Menghitung Exponential Smoothing', 40);

    const historical = [];
    
    // Inisialisasi: F[1] = Y[0]
    let currentForecast = parseFloat(sortedData[0][valCol]);
    
    for (let i = 0; i < sortedData.length; i++) {
      const actual = parseFloat(sortedData[i][valCol]);
      let forecast = null;

      if (i > 0) {
        forecast = currentForecast;
        // Hitung F untuk step selanjutnya
        currentForecast = (alpha * actual) + ((1 - alpha) * forecast);
      }

      historical.push({
        label: String(sortedData[i][dateCol]),
        actual: actual,
        forecast: forecast // null untuk baris pertama
      });
    }

    onProgress('Forecasting', 'Menghitung ramalan masa depan', 70);

    const future = [];
    // Pada SES, forecast ke depan mendatar (flat), sama dengan currentForecast
    const finalForecast = currentForecast;

    for (let i = 1; i <= horizon; i++) {
      future.push({
        label: `T+${i}`,
        actual: null,
        forecast: finalForecast
      });
    }

    onProgress('Selesai', 'Perhitungan selesai', 100);

    const metrics = Metrics.evaluate(
      historical.filter(h => h.forecast !== null).map(h => h.actual),
      historical.filter(h => h.forecast !== null).map(h => h.forecast)
    );

    return {
      alpha,
      horizon,
      dateCol,
      valCol,
      historical,
      future,
      metrics
    };
  }

  renderHTML(result, container) {
    let html = `<h3>Ringkasan SES (Alpha=${result.alpha})</h3>`;
    
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
                     <th>Forecast SES</th>
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
    
    html += this._buildExcelBlock('ses-excel', [
      { cell: `C3`, formula: `=${result.alpha}*B2 + (1-${result.alpha})*C2`, comment: `Formula SES (B2=Aktual_prev, C2=Forecast_prev)` }
    ]);

    container.innerHTML = html;
  }

  exportExcel(result, mode) {
    if (typeof XLSX === 'undefined') throw new Error("SheetJS (XLSX) tidak ditemukan.");
    const wb = XLSX.utils.book_new();

    const wsData = XLSX.utils.json_to_sheet(result.historical.map(d => ({Waktu: d.label, Aktual: d.actual})));
    XLSX.utils.book_append_sheet(wb, wsData, "Dataset");

    const calcRows = [["Waktu", "Aktual", "SES Forecast", "Error"]];
    result.historical.forEach((d, i) => {
      const rowNum = i + 2;
      let fcast = d.forecast !== null ? d.forecast : "";
      
      if (mode === 'formula' && i > 0) {
        if (i === 1) {
          fcast = { f: `B2` }; // F2 = Y1
        } else {
          // F3 = a*Y2 + (1-a)*F2
          fcast = { f: `${result.alpha}*B${rowNum-1} + (1-${result.alpha})*C${rowNum-1}` };
        }
      }
      
      const err = (i > 0 && mode === 'formula') ? { f: `B${rowNum}-C${rowNum}` } : (d.forecast !== null ? d.actual - d.forecast : "");
      calcRows.push([d.label, d.actual, fcast, err]);
    });
    
    let lastRow = result.historical.length + 1;
    result.future.forEach((d, i) => {
      const rowNum = lastRow + i + 1;
      // SES flat forecast, simply ref the last computed forecast (or rather the actual computation for the next step)
      let fcast = d.forecast;
      if (mode === 'formula') {
        if (i === 0) {
           fcast = { f: `${result.alpha}*B${lastRow} + (1-${result.alpha})*C${lastRow}` };
        } else {
           fcast = { f: `C${rowNum-1}` }; // Flat
        }
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

if (typeof registry !== 'undefined') registry.register(new SESPlugin());
