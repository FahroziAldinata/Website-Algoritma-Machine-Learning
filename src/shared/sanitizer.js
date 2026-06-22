/**
 * src/shared/sanitizer.js
 * Security Sanitizer Module
 * 
 * Tujuan: Menyediakan fungsi sanitasi untuk mencegah kerentanan DOM XSS
 * dan Formula Injection (CSV/Excel Injection) saat merender UI atau melakukan ekspor data.
 */

/**
 * Mengubah karakter khusus HTML menjadi entitas aman untuk mencegah DOM XSS
 * @param {*} val - Nilai input yang akan disanitasi
 * @returns {string} String yang aman untuk disisipkan ke HTML
 */
function escapeHTML(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Melindungi dari Formula Injection di Excel/CSV.
 * Menambahkan single quote (') di depan jika nilai diawali oleh =, +, -, @,
 * kecuali jika nilai tersebut merupakan angka numerik valid (misal: bilangan negatif -5.4).
 * @param {*} val - Nilai sel
 * @returns {*} Nilai yang aman dari injeksi formula
 */
function sanitizeFormula(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "number" || typeof val === "boolean") return val;

  const str = String(val).trim();
  if (str.startsWith("=") || str.startsWith("+") || str.startsWith("-") || str.startsWith("@")) {
    // Cek jika string adalah angka desimal/negatif/positif murni (misal: -12.34 atau +50)
    // Jika ya, jangan disanitasi dengan tanda petik agar tetap dianggap angka oleh Excel.
    if (!isNaN(Number(str))) {
      return val;
    }
    return "'" + val;
  }
  return val;
}

// Ekspos ke global context agar kompatibel dengan lingkungan Worker classic dan ES modules
if (typeof window !== 'undefined') {
  window.escapeHTML = escapeHTML;
  window.sanitizeFormula = sanitizeFormula;
} else if (typeof self !== 'undefined') {
  self.escapeHTML = escapeHTML;
  self.sanitizeFormula = sanitizeFormula;
}
