/* =====================================================
   apriori_core.js
   Apriori algorithm: frequent itemset generation + rule mining
   ===================================================== */

/**
 * Main Apriori runner.
 * Returns { frequentSets, rules, steps }
 */
function runApriori(transactions, allItems, minSupport, minConfidence, maxK) {
  // Validasi input
  if (!transactions || transactions.length === 0)
    throw new Error('Tidak ada transaksi. Upload dataset terlebih dahulu.');
  if (!allItems || allItems.length === 0)
    throw new Error('Tidak ada item ditemukan dalam dataset.');
  if (minSupport <= 0 || minSupport > 1)
    throw new Error('Min support harus antara 0 dan 1.');
  if (minConfidence <= 0 || minConfidence > 1)
    throw new Error('Min confidence harus antara 0 dan 1.');
  if (maxK < 2)
    throw new Error('Maksimal panjang itemset minimal 2.');

  const n = transactions.length;
  const steps = [];          // for manual rendering
  const frequentSets = [];   // { items, count, support }

  /* ---- STEP 1: Generate L1 (frequent 1-itemsets) ---- */
  const C1 = allItems.map(item => ({
    items: [item],
    count: countItemset(transactions, [item]),
    support: support(transactions, [item])
  }));

  const L1 = C1.filter(c => c.support >= minSupport);
  frequentSets.push(...L1);
  steps.push({ k: 1, candidates: C1, frequent: L1 });

  /* ---- STEP k: Generate Lk from L(k-1) ---- */
  let prevL = L1;
  for (let k = 2; k <= maxK && prevL.length >= k; k++) {
    // Join step: combine pairs sharing first k-2 items (sorted)
    const sortedPrev = prevL.map(s => ({ ...s, items: [...s.items].sort() }));
    const Ck = [];
    const seen = new Set();

    for (let i = 0; i < sortedPrev.length; i++) {
      for (let j = i + 1; j < sortedPrev.length; j++) {
        const a = sortedPrev[i].items;
        const b = sortedPrev[j].items;
        // Check first k-2 items match
        let valid = true;
        for (let x = 0; x < k - 2; x++) {
          if (a[x] !== b[x]) { valid = false; break; }
        }
        if (!valid) continue;
        // Last items must differ (and b's last > a's last for uniqueness)
        if (a[k - 2] >= b[k - 2]) continue;

        const candidate = [...a, b[k - 2]].sort();
        const key = itemsetKey(candidate);
        if (seen.has(key)) continue;
        seen.add(key);

        // Prune: all (k-1)-subsets must be frequent
        if (!allSubsetsFrequent(candidate, sortedPrev)) continue;

        const cnt  = countItemset(transactions, candidate);
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

  /* ---- GENERATE ASSOCIATION RULES ---- */
  const rules = [];
  for (const fs of frequentSets) {
    if (fs.items.length < 2) continue;
    // Generate all non-trivial splits: antecedent → consequent
    const ps = powerSet(fs.items);
    for (const ant of ps) {
      const con = fs.items.filter(it => !ant.includes(it));
      if (con.length === 0) continue;

      const conf = confidence(transactions, ant, con);
      if (conf < minConfidence) continue;

      const liftVal = lift(transactions, ant, con);
      const suppXY  = support(transactions, fs.items);
      const suppX   = support(transactions, ant);
      const suppY   = support(transactions, con);

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

  // Sort: lift DESC, then confidence DESC (tie-breaking = higher lift first)
  rules.sort((a, b) => {
    if (Math.abs(b.lift - a.lift) > 1e-10) return b.lift - a.lift;
    return b.confidence - a.confidence;
  });

  return { frequentSets, rules, steps, n };
}

/* ---- Helper: all (k-1)-subsets of candidate must be in prevL ---- */
function allSubsetsFrequent(candidate, prevL) {
  const keys = new Set(prevL.map(s => itemsetKey(s.items)));
  for (let skip = 0; skip < candidate.length; skip++) {
    const sub = candidate.filter((_, i) => i !== skip);
    if (!keys.has(itemsetKey(sub))) return false;
  }
  return true;
}