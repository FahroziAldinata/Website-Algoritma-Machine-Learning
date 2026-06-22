/**
 * src/shared/metrics.js
 * Evaluation Metrics for Forecasting
 */

class Metrics {
  /**
   * Menghitung error evaluasi time series
   * @param {Array} actual - Array angka aktual
   * @param {Array} forecast - Array angka prediksi (harus sama panjang dengan actual yang dievaluasi)
   * @returns {object} { mae, mse, rmse, mape }
   */
  static evaluate(actual, forecast) {
    if (!actual || !forecast || actual.length === 0 || forecast.length === 0) {
      return { mae: 0, mse: 0, rmse: 0, mape: 0 };
    }

    const n = Math.min(actual.length, forecast.length);
    let sumAbsErr = 0;
    let sumSqErr = 0;
    let sumAbsPctErr = 0;
    let validMapeCount = 0;

    for (let i = 0; i < n; i++) {
      const a = actual[i];
      const f = forecast[i];
      const err = a - f;
      const absErr = Math.abs(err);
      
      sumAbsErr += absErr;
      sumSqErr += (err * err);

      if (a !== 0) {
        sumAbsPctErr += (absErr / Math.abs(a));
        validMapeCount++;
      }
    }

    const mae = sumAbsErr / n;
    const mse = sumSqErr / n;
    const rmse = Math.sqrt(mse);
    const mape = validMapeCount > 0 ? (sumAbsPctErr / validMapeCount) * 100 : 0;

    return { mae, mse, rmse, mape };
  }
}

if (typeof window !== 'undefined') {
  window.Metrics = Metrics;
} else if (typeof self !== 'undefined') {
  self.Metrics = Metrics;
}
