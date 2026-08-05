// Helper for probes that need one driven page rather than a full-matrix sweep (structure,
// overlays, focus). Opens a representative cell on the first available engine, installs the
// in-page utils, runs the probe body, and always tears the page down.
import { installUtils } from './inpage.mjs';

export function firstCell(harness) {
  return { engine: harness.engines[0], width: 390, height: 844, orientation: 'portrait' };
}

export async function withPage(harness, opts = {}, fn) {
  const cell = { ...firstCell(harness), ...opts };
  const { page, close } = await harness.openPage({
    engine: cell.engine,
    width: cell.width,
    height: cell.height,
    orientation: cell.orientation,
    route: opts.route || harness.config.routes[0] || '/',
    displayMode: opts.displayMode || null,
    rtl: opts.rtl || false,
    authenticated: opts.authenticated ?? (harness.config.auth != null),
  });
  try {
    await installUtils(page);
    return await fn(page, cell);
  } finally {
    await close();
  }
}
