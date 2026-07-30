// Utilities injected into the page under test. `installUtils(page)` defines
// `window.__pwa.cssPath(el)` (a compact, human-readable selector for the culprit element)
// and `window.__pwa.isActionable(el)` (does this element behave like a control) so the
// in-page evaluate functions in the probes can name what they found.

const UTILS_SRC = `
window.__pwa = window.__pwa || (function () {
  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return el.tagName.toLowerCase() + '#' + el.id;
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 4) {
      let sel = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(sel + '#' + node.id); break; }
      if (node.classList && node.classList.length) {
        sel += '.' + Array.prototype.slice.call(node.classList, 0, 2).join('.');
      }
      const parent = node.parentElement;
      if (parent) {
        const same = Array.prototype.filter.call(parent.children, (c) => c.tagName === node.tagName);
        if (same.length > 1) sel += ':nth-of-type(' + (Array.prototype.indexOf.call(parent.children, node) + 1) + ')';
      }
      parts.unshift(sel);
      node = parent;
      depth++;
    }
    return parts.join(' > ');
  }

  function accessibleName(el) {
    const aria = (el.getAttribute('aria-label') || '').trim();
    if (aria) return aria;
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const ref = document.getElementById(labelledby);
      if (ref && ref.textContent.trim()) return ref.textContent.trim();
    }
    const title = (el.getAttribute('title') || '').trim();
    if (title) return title;
    const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (text) return text;
    const img = el.querySelector('img[alt]');
    if (img && img.getAttribute('alt').trim()) return img.getAttribute('alt').trim();
    return '';
  }

  function isActionable(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea') return true;
    const role = el.getAttribute('role');
    if (role && ['button', 'link', 'tab', 'menuitem', 'switch', 'checkbox'].includes(role)) return true;
    if (el.hasAttribute('onclick')) return true;
    return false;
  }

  return { cssPath, accessibleName, isActionable };
})();
`;

export async function installUtils(page) {
  await page.evaluate(UTILS_SRC);
}
