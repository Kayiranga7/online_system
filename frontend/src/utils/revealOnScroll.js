// Reveal-on-scroll: gates the .card-in / .row-in entrance animations behind
// the viewport instead of firing them all at once on page load.
//
// Usage: call initRevealOnScroll() once at app startup. It:
//  - adds .reveal-ready to <html>; the CSS only pre-hides elements under
//    that gate, so content is never lost if JS fails to run,
//  - reveals any element already inside the viewport immediately (batched
//    and staggered in visual order) — deterministic, even if Intersection-
//    Observer callbacks are throttled (backgrounded/occluded tabs),
//  - observes the rest with an IntersectionObserver and reveals them as
//    they scroll into view (still staggered per batch),
//  - watches the DOM (MutationObserver) so SPA route changes register new
//    elements and forget removed ones. Scans run synchronously per
//    mutation batch: rAF-based scheduling would starve in background tabs,
//    where animation frames never fire.

const REVEAL_SELECTOR = '.card-in, .row-in';
const VISIBLE_CLASS = 'is-visible';
const MAX_STAGGER = 14;

let intersectionObserver = null;
let mutationObserver = null;

function revealElement(el, batchIndex) {
  // Stagger comes from --stagger-i; we override it per revealed batch so an
  // element scrolled into view on its own never waits on a large DOM-index
  // delay (see tokens.css for the delay calc).
  el.style.setProperty('--stagger-i', String(Math.min(batchIndex, MAX_STAGGER)));
  el.classList.add(VISIBLE_CLASS);
  if (intersectionObserver) intersectionObserver.unobserve(el);
}

function unobserveTree(node) {
  if (!(node instanceof Element)) return;
  if (node.matches(REVEAL_SELECTOR)) intersectionObserver.unobserve(node);
  node.querySelectorAll(REVEAL_SELECTOR).forEach((el) => intersectionObserver.unobserve(el));
}

function scan() {
  let batch = 0;
  document.querySelectorAll(REVEAL_SELECTOR).forEach((el) => {
    if (el.dataset.revealBound) return;
    el.dataset.revealBound = '1';
    const rect = el.getBoundingClientRect();
    // Already within (or above) the viewport: reveal now. Zero-size boxes
    // (hidden tabs, not-yet-laid-out nodes) wait for the observer instead.
    if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight) {
      revealElement(el, batch++);
    } else {
      intersectionObserver.observe(el);
    }
  });
}

function onMutations(mutationRecords) {
  for (const record of mutationRecords) {
    for (const node of record.removedNodes) unobserveTree(node);
  }
  scan();
}

function onIntersect(entries) {
  const revealed = entries.filter((entry) => entry.isIntersecting);
  if (!revealed.length) return;
  // Stagger each batch of simultaneously-revealed elements in visual order
  // (top-to-bottom, then left-to-right) instead of DOM order.
  revealed.sort(
    (a, b) =>
      a.boundingClientRect.top - b.boundingClientRect.top ||
      a.boundingClientRect.left - b.boundingClientRect.left
  );
  revealed.forEach((entry, i) => revealElement(entry.target, i));
}

export function initRevealOnScroll() {
  if (intersectionObserver) return; // already running (HMR / double init)
  if (typeof IntersectionObserver === 'undefined' || typeof MutationObserver === 'undefined') {
    return; // leave content visible; CSS gate was never applied
  }

  document.documentElement.classList.add('reveal-ready');

  intersectionObserver = new IntersectionObserver(onIntersect, {
    threshold: 0.08,
    rootMargin: '0px 0px -24px 0px',
  });

  scan();

  mutationObserver = new MutationObserver(onMutations);
  mutationObserver.observe(document.body, { childList: true, subtree: true });
}
