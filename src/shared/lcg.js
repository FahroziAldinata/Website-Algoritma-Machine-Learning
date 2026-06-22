/**
 * src/shared/lcg.js
 * Linear Congruential Generator (LCG) Utility
 * 
 * Tujuan: Menyediakan generator angka acak semu (PRNG) deterministik
 * yang sepenuhnya traceable dan reproducible tanpa bergantung pada Math.random().
 * Sangat berguna untuk stratified splitting dan shuffle yang konsisten dengan Excel/Python.
 */

/**
 * Generator angka acak LCG (Multiplier & Increment menggunakan parameter Numerical Recipes)
 * @param {number} seed - Seed awal generator
 * @returns {function} Fungsi generator yang menghasilkan angka [0, 1)
 */
function lcgRand(seed) {
  let s = seed >>> 0;
  return function () {
    s = Math.imul(1664525, s) + 1013904223;
    s = s >>> 0;
    return s / 4294967296;
  };
}

/**
 * Mengacak array secara deterministik menggunakan LCG (Fisher-Yates Shuffle)
 * @param {Array} arr - Array asli yang ingin diacak
 * @param {number} seed - Seed acak
 * @returns {Array} Salinan array yang telah diacak
 */
function lcgShuffle(arr, seed) {
  const a = arr.slice();
  const rand = lcgRand(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Ekspos ke global context agar kompatibel dengan lingkungan Worker classic dan ES modules
if (typeof window !== 'undefined') {
  window.lcgRand = lcgRand;
  window.lcgShuffle = lcgShuffle;
} else if (typeof self !== 'undefined') {
  self.lcgRand = lcgRand;
  self.lcgShuffle = lcgShuffle;
}
