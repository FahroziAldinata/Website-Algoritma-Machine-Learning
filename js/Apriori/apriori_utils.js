/* =====================================================
   apriori_utils.js
   Core math: support, confidence, lift
   ===================================================== */

/**
 * Count how many transactions contain ALL items in itemset.
 * @param {string[][]} transactions  - array of item arrays
 * @param {string[]}   itemset
 * @returns {number} count
 */
function countItemset(transactions, itemset) {
  let c = 0;
  for (const t of transactions) {
    if (itemset.every(it => t.includes(it))) c++;
  }
  return c;
}

/**
 * support(X) = count(X) / total_transactions
 */
function support(transactions, itemset) {
  return countItemset(transactions, itemset) / transactions.length;
}

/**
 * confidence(X→Y) = supp(X∪Y) / supp(X)
 */
function confidence(transactions, antecedent, consequent) {
  const union = [...antecedent, ...consequent];
  const suppXY = support(transactions, union);
  const suppX  = support(transactions, antecedent);
  if (suppX === 0) return 0;
  return suppXY / suppX;
}

/**
 * lift(X→Y) = conf(X→Y) / supp(Y)
 */
function lift(transactions, antecedent, consequent) {
  const conf = confidence(transactions, antecedent, consequent);
  const suppY = support(transactions, consequent);
  if (suppY === 0) return 0;
  return conf / suppY;
}

/**
 * Generate all non-empty subsets of an array (power set minus empty set).
 */
function powerSet(arr) {
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

/**
 * Sort itemset key alphabetically for consistent deduplication.
 */
function itemsetKey(items) {
  return [...items].sort().join('|||');
}

/**
 * Format a number as percentage string.
 */
function pct(v, decimals = 2) {
  return (v * 100).toFixed(decimals) + '%';
}

/**
 * Format number to fixed decimals.
 */
function fmt(v, d = 4) {
  return typeof v === 'number' ? v.toFixed(d) : v;
}
