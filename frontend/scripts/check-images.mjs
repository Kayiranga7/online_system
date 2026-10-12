#!/usr/bin/env node
/**
 * CI guard: fails if a committed frontend image is oversized or shipped in a
 * legacy raster format.
 *
 * Scope — frontend image assets only:
 *   - src/assets/  source images that the build encodes into AVIF/WebP/JPEG
 *   - public/      files served verbatim
 * Build output (frontend/dist/) and runtime user uploads (backend/uploads/)
 * are not committed frontend assets and are intentionally out of scope.
 *
 * Rules:
 *   1. Every image must be <= MAX_BYTES (default 250 KB; override with the
 *      IMAGE_MAX_KB env var).
 *   2. Raster images must be a modern format (WebP or AVIF). JPEG, PNG, GIF,
 *      BMP and TIFF are rejected. SVG/ICO are vector/icon formats and are
 *      allowed, but still subject to the size budget.
 *
 * Runs automatically before `npm run build` (via the "prebuild" script), and
 * directly via `npm run check:images`.
 */
import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['src/assets', 'public'];

const MAX_BYTES = (Number(process.env.IMAGE_MAX_KB) || 250) * 1024;

const LEGACY_RASTER = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tif', '.tiff']);
const MODERN_RASTER = new Set(['.webp', '.avif']);
const VECTOR = new Set(['.svg', '.ico']);
const IMAGE_EXT = new Set([...LEGACY_RASTER, ...MODERN_RASTER, ...VECTOR]);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

async function main() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    const abs = join(FRONTEND_ROOT, dir);
    if (existsSync(abs)) files.push(...(await walk(abs)));
  }

  const images = files.filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()));
  const failures = [];

  for (const file of images) {
    const { size } = await stat(file);
    const ext = extname(file).toLowerCase();
    const rel = relative(FRONTEND_ROOT, file);

    if (LEGACY_RASTER.has(ext)) {
      failures.push(`${rel} — legacy format "${ext}" (convert to ${[...MODERN_RASTER].join(' or ')})`);
    }
    if (size > MAX_BYTES) {
      failures.push(`${rel} — ${kb(size)} exceeds the ${kb(MAX_BYTES)} budget`);
    }
  }

  if (failures.length) {
    console.error(`\n✖ Image check failed (${failures.length} problem${failures.length === 1 ? '' : 's'}):\n`);
    for (const problem of failures) console.error(`  • ${problem}`);
    console.error(
      `\nAllowed raster formats: ${[...MODERN_RASTER].join(', ')}. ` +
        `Max size: ${kb(MAX_BYTES)} per image (override with IMAGE_MAX_KB).\n`,
    );
    process.exit(1);
  }

  console.log(
    `✔ Image check passed — ${images.length} image${images.length === 1 ? '' : 's'} checked ` +
      `(<= ${kb(MAX_BYTES)} each, modern raster formats only).`,
  );
}

main().catch((err) => {
  console.error('Image check crashed:', err);
  process.exit(1);
});
