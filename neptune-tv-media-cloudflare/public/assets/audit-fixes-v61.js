(() => {
  const originalError = console.error.bind(console);
  const expectedFallback = /catalog_unavailable|hero_hors_norme_unavailable|public_catalog_failed/u;

  console.error = (...args) => {
    const message = args.map((value) => {
      if (value instanceof Error) return `${value.name}: ${value.message}`;
      if (typeof value === 'string') return value;
      try { return JSON.stringify(value); } catch { return String(value); }
    }).join(' ');

    if (expectedFallback.test(message)) {
      console.warn('neptune_catalog_fallback_active');
      return;
    }
    originalError(...args);
  };

  let observer;

  function replaceTag(node, tagName) {
    const replacement = document.createElement(tagName);
    for (const attribute of node.attributes) replacement.setAttribute(attribute.name, attribute.value);
    replacement.innerHTML = node.innerHTML;
    node.replaceWith(replacement);
    return replacement;
  }

  function normalizePrimaryHeadings() {
    const marketingHeading = document.querySelector('.hero-v21__line--future');
    if (marketingHeading && marketingHeading.tagName !== 'H1') replaceTag(marketingHeading, 'h1');

    const directHeading = document.querySelector('main.live-page > h1.sr-only');
    if (directHeading) {
      directHeading.classList.remove('sr-only');
      directHeading.classList.add('audit-primary-heading');
    }
  }

  normalizePrimaryHeadings();
  document.addEventListener('DOMContentLoaded', normalizePrimaryHeadings, { once: true });

  observer = new MutationObserver(normalizePrimaryHeadings);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 15000);
})();
