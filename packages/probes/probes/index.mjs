// The full probe set the runner executes, in report order.
import p301 from './p301-overflow.mjs';
import p308 from './p308-touch-targets.mjs';
import p201 from './p201-tabbar-fixed.mjs';
import p202 from './p202-content-behind-bar.mjs';
import p203 from './p203-shell-identity.mjs';
import p204 from './p204-scroll-restore.mjs';
import p207 from './p207-overlay-above-bar.mjs';
import p208 from './p208-back-closes-overlay.mjs';
import p115 from './p115-standalone-back.mjs';
import p509 from './p509-offline-fallback.mjs';
import p703 from './p703-icon-name.mjs';
import p704 from './p704-div-onclick.mjs';
import p705 from './p705-focus-visible.mjs';
import p706 from './p706-focus-trap.mjs';
import p711 from './p711-inert-bg.mjs';
import p101 from './p101-input-font-size.mjs';

export const ALL_PROBES = [
  p301, p308, p201, p202, p203, p204, p207, p208, p115, p509, p703, p704, p705, p706, p711, p101,
];

// Every catalog id these probes assert — used to wire the `probe` field and to build coverage.
export const PROBE_IDS = ALL_PROBES.flatMap((p) => p.ids);
