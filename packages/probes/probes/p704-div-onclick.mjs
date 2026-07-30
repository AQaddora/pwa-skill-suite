// P-704 — `<div onClick>` instead of a real control. A non-interactive element (div, span,
// li, …) carrying an `onclick` attribute with no button/link role is not keyboard-focusable
// and announces nothing. Representative cell per engine.
//
// Limitation: handlers added via addEventListener leave no DOM trace and are invisible to a
// runtime probe; the static scanner / code review covers those. This reports what is provable.
import { elementSweep, representativeCells } from '../lib/sweep.mjs';

export default {
  ids: ['P-704'],
  name: 'Non-interactive element used as a control',
  async run(harness) {
    return elementSweep(harness, {
      id: 'P-704',
      cells: representativeCells(harness),
      collect: () => {
        const interactiveTags = ['button', 'a', 'input', 'select', 'textarea', 'summary', 'label'];
        const interactiveRoles = ['button', 'link', 'tab', 'menuitem', 'switch', 'checkbox'];
        const out = [];
        for (const el of document.querySelectorAll('[onclick]')) {
          const tag = el.tagName.toLowerCase();
          if (interactiveTags.includes(tag)) continue;
          const role = (el.getAttribute('role') || '').toLowerCase();
          if (interactiveRoles.includes(role)) continue;
          out.push({
            selector: window.__pwa.cssPath(el),
            detail: `<${tag}> with onclick but no button/link role or keyboard support`,
          });
        }
        return out;
      },
    });
  },
};
