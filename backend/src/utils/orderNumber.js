/** Generates order numbers like IMZ-2026-000123 */
function generateOrderNumber(sequentialId) {
  const year = new Date().getFullYear();
  const padded = String(sequentialId).padStart(6, '0');
  return `IMZ-${year}-${padded}`;
}

module.exports = { generateOrderNumber };
