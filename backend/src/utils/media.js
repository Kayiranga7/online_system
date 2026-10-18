/**
 * The API used to invent `/placeholder/<id>.jpg` paths for catalogue rows that
 * had no image - the image_url columns were NOT NULL, so attaching only an AR
 * model needed something to store. Nothing ever served those paths, so the
 * client requested a URL that 404s (and, on a split deployment, from the wrong
 * origin as well).
 *
 * New writes store NULL instead (see migration 006), and these helpers keep a
 * value already in the database from reaching a client, so an older backend and
 * a newer frontend can be deployed in either order.
 */

const PLACEHOLDER_PATTERN = /^(?:\/api)?\/placeholder\//i;

function isPlaceholderImageUrl(url) {
  return typeof url === 'string' && PLACEHOLDER_PATTERN.test(url);
}

function normalizeImageUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  return isPlaceholderImageUrl(url) ? null : url;
}

/**
 * Controllers return database rows verbatim, so this is the one place that has
 * to keep invented paths out of a response. Mutates and returns the rows.
 */
function stripPlaceholderImages(rows) {
  const list = Array.isArray(rows) ? rows : [rows];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    if ('primary_image' in row) row.primary_image = normalizeImageUrl(row.primary_image);
    if ('image_url' in row) row.image_url = normalizeImageUrl(row.image_url);
  }
  return rows;
}

module.exports = { isPlaceholderImageUrl, normalizeImageUrl, stripPlaceholderImages };
