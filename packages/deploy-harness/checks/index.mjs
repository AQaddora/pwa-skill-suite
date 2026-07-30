import p502 from './p502-no-stale-html.mjs';
import p503 from './p503-update-surfaced.mjs';
import p504 from './p504-no-uncontrolled-skip-waiting.mjs';
import p505 from './p505-chunk-recovery.mjs';
import p514 from './p514-sw-manifest-cache-ttl.mjs';
import p520 from './p520-auth-cookie-coherent.mjs';
import p522 from './p522-api-skew-graceful.mjs';
import p523 from './p523-no-cross-user-data.mjs';
import p525 from './p525-storage-schema-boot.mjs';
import p528 from './p528-sw-shell-build-converge.mjs';
import p531 from './p531-breaking-forces-update.mjs';

export const STALE_CODE_CHECKS = [p502, p505, p503, p504, p514];
export const VERSION_SKEW_CHECKS = [p520, p522, p523, p525, p528, p531];
export const ALL_CHECKS = [...STALE_CODE_CHECKS, ...VERSION_SKEW_CHECKS];
