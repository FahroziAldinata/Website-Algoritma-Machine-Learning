// ---- LCG Random Number Generator ----
function lcgRand(seed) {
    let s = seed >>> 0;
    return function () {
      s = Math.imul(1664525, s) + 1013904223;
      s = s >>> 0;
      return s / 4294967296;
    };
  }
  
  // ---- Fisher-Yates shuffle pakai LCG ----
  function lcgShuffle(arr, seed) {
    const a = arr.slice();
    const rand = lcgRand(seed);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }