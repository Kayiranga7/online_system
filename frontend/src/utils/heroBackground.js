// Build-time optimised variants of the landscaping backdrop photo.
// `vite-imagetools` (see vite.config.js) encodes the source WebP into the
// formats served at runtime, and the resulting URLs are handed to CSS as custom
// properties. Consumers spread `heroBackground` onto the element that owns the
// `.hero` / `.page` class; the stylesheets then layer the photo with
// `var(--hero-image)`, upgrading to `var(--hero-image-modern)` inside an
// `@supports (image-set(type(...)))` guard.
//
// `--hero-lqip` is a tiny, blurred placeholder generated from the same source at
// build time by the `lqip()` Vite plugin (see plugins/lqip.js). It is a data
// URI, so it paints straight from the JS payload — no request, no blank flash —
// and CSS layers it beneath the photo. Being derived from the source, it can't
// drift: change the image and the placeholder regenerates.
//
// The plain JPEG stays as the fallback for browsers without image-set() support.
import jpegUrl from '../assets/landscaping-hero.webp?format=jpeg&quality=82';
import webpUrl from '../assets/landscaping-hero.webp?format=webp&quality=80';
import avifUrl from '../assets/landscaping-hero.webp?format=avif&quality=52';
import lqip from 'virtual:lqip/src/assets/landscaping-hero.webp';

export const heroBackground = {
  '--hero-image': `url("${jpegUrl}")`,
  '--hero-image-modern': `image-set(url("${avifUrl}") type("image/avif"), url("${webpUrl}") type("image/webp"), url("${jpegUrl}") type("image/jpeg"))`,
  '--hero-lqip': `url("${lqip}")`,
};
