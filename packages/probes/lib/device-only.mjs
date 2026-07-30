// The eight device-only catalog entries and their real-device reproduction steps.
//
// Playwright WebKit is not iOS Safari: it has no input-zoom heuristic, no URL-bar viewport
// collapse, no home-screen icon pipeline, no virtual-keyboard geometry, and no ITP eviction.
// These entries can therefore never be PASS from CI/emulation — they are reported UNVERIFIED
// with steps a human runs on a real device. Quietly greening one of these is the worst bug
// this suite can ship, so the honesty lives here in one place.

export const DEVICE_ONLY_REPRODUCTION = {
  'P-101': [
    'Open the app in iOS Safari on a real iPhone.',
    'Tap any text input whose design font-size looks small.',
    'If the whole page zooms in on focus and does not zoom back out, this fails.',
    '(CI can only check computed font-size ≥ 16px — the zoom itself is device-only.)',
  ],
  'P-104': [
    'Install the app to the Home Screen; open it (standalone).',
    'Focus a field near a fixed bottom bar so the keyboard opens.',
    'If the fixed bottom bar detaches, floats, or is covered by the keyboard, this fails.',
  ],
  'P-117': [
    'Open the installed PWA, then background it (Home) for a minute; reopen.',
    'If in-progress state (form input, scroll, route) is lost on resume, this fails.',
  ],
  'P-121': [
    'Cold-launch the installed PWA from the Home Screen icon.',
    'If a white/blank flash shows before first paint (no splash), this fails.',
  ],
  'P-903': [
    'On a real device, focus a field low on the screen so the keyboard opens.',
    'If the keyboard covers the focused field and the app does not scroll it into view, this fails.',
  ],
  'P-904': [
    'On a real device, focus a field on a form with a fixed submit CTA.',
    'If the on-screen keyboard buries the submit button, this fails.',
  ],
  'P-1201': [
    'Open the app on a real iOS device (not the simulator, not desktop emulation).',
    'Walk the primary flows. Anything that only breaks here is a device-only regression.',
  ],
  'P-1206': [
    'On a real device, open every screen that has an input with the keyboard raised.',
    'If layout, fixed elements, or the submit affordance break with the keyboard open, this fails.',
  ],
};

export const DEVICE_ONLY_IDS = Object.keys(DEVICE_ONLY_REPRODUCTION);

/**
 * Build UNVERIFIED probe-shaped results for the device-only entries. P-101 is excluded by
 * default because its own probe reports it (it FAILs on a real, checkable font-size defect
 * and is UNVERIFIED otherwise).
 * @param {object[]} catalog
 * @param {{ exclude?: string[] }} [opts]
 */
export function deviceOnlyResults(catalog, { exclude = ['P-101'] } = {}) {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  return DEVICE_ONLY_IDS.filter((id) => !exclude.includes(id)).map((id) => ({
    ids: [id],
    name: byId.get(id)?.title || id,
    outcome: 'UNVERIFIED',
    findings: [],
    detail: 'device-only: not reproducible in Playwright/emulation (WebKit ≠ iOS Safari)',
    reproduction: DEVICE_ONLY_REPRODUCTION[id].join('\n'),
  }));
}
