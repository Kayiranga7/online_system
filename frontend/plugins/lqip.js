// Vite plugin: generate tiny inline LQIP (low-quality image placeholder) data
// URIs at build AND dev time, straight from the source image, so a placeholder
// can never drift out of sync with the photo it stands in for.
//
// Usage (anywhere in the app, path relative to the Vite root):
//   import lqip from 'virtual:lqip/src/assets/landscaping-hero.webp';
//   // lqip === 'data:image/webp;base64,…'
//
// The module is virtual — nothing is written to disk, and because the result is
// a small data URI it is inlined into the JS bundle (no extra request). Editing
// the source image regenerates it on the next dev reload / build.
import path from 'node:path';
import sharp from 'sharp';

const PREFIX = 'virtual:lqip/';
const RESOLVED_PREFIX = '\u0000' + PREFIX;

export function lqip({ width = 32, blur = 4, quality = 25 } = {}) {
  let root = process.cwd();

  return {
    name: 'lqip',
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      return id.startsWith(PREFIX) ? RESOLVED_PREFIX + id.slice(PREFIX.length) : null;
    },
    async load(id) {
      if (!id.startsWith(RESOLVED_PREFIX)) return null;
      const file = path.resolve(root, id.slice(RESOLVED_PREFIX.length));
      // Watch the source so the placeholder is regenerated when it changes.
      this.addWatchFile(file);
      const buf = await sharp(file)
        .resize({ width, withoutEnlargement: true })
        .blur(blur)
        .webp({ quality })
        .toBuffer();
      return `export default ${JSON.stringify(`data:image/webp;base64,${buf.toString('base64')}`)};`;
    },
  };
}
