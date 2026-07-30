// Renders docs/catalog.md FROM packages/catalog/catalog.json, so the doc can
// never drift from the data. `renderMarkdown(entries)` is pure (string in,
// string out); the CLI below just wires it to the filesystem, either writing
// docs/catalog.md or (with --check) diff-checking it without writing.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(__dirname, 'catalog.json');
const docPath = path.resolve(__dirname, '..', '..', 'docs', 'catalog.md');

// Fixed section display order + titles, per the catalog's `section` enum
// (packages/catalog/schema.json). New sections must be added here as well
// as to the schema enum, or their entries silently fall out of the doc.
const SECTIONS = [
  { id: 'ios-webkit', num: '1', title: '§1 · iOS Safari & WebKit' },
  { id: 'app-shell', num: '2', title: '§2 · App shell & navigation' },
  { id: 'responsive', num: '3', title: '§3 · Responsive layout' },
  { id: 'manifest', num: '4', title: '§4 · Manifest, install & icons' },
  { id: 'service-worker', num: '5', title: '§5 · Service worker, caching & updates' },
  { id: 'version-skew', num: '5b', title: '§5b · Version skew & stale client state' },
  { id: 'performance', num: '6', title: '§6 · Performance on real phones' },
  { id: 'accessibility', num: '7', title: '§7 · Accessibility' },
  { id: 'rtl', num: '8', title: '§8 · RTL & internationalisation' },
  { id: 'forms', num: '9', title: '§9 · Forms & the mobile keyboard' },
  { id: 'theming', num: '10', title: '§10 · Theming & system integration' },
  { id: 'build-deploy', num: '11', title: '§11 · Build, deploy & platform config' },
  { id: 'identity-auth', num: '12', title: '§12 · Identity, auth & OAuth' },
  { id: 'in-app-browser', num: '13', title: '§13 · In-app browsers' },
  { id: 'permissions', num: '14', title: '§14 · Permissions' },
  { id: 'media', num: '15', title: '§15 · Media' },
  { id: 'lifecycle', num: '16', title: '§16 · Lifecycle & realtime' },
  { id: 'observability', num: '17', title: '§17 · Observability & error reporting' },
  { id: 'meta', num: '18', title: '§18 · What agents never test (the meta-failures)' },
];

// detect[] value -> bracket-tag letter, in the fixed display order the
// "How to read an entry" legend uses: [S][R][L][V][D].
const DETECT_TAG_ORDER = [
  ['static', 'S'],
  ['runtime', 'R'],
  ['lighthouse', 'L'],
  ['visual', 'V'],
  ['device', 'D'],
];

function areaName(section) {
  return section.title.replace(/^§\S+\s*·\s*/, '');
}

function detectTags(entry) {
  const tags = DETECT_TAG_ORDER.filter(([key]) => entry.detect.includes(key)).map(([, tag]) => tag);
  if (entry.deviceOnly && !tags.includes('D')) {
    tags.push('D');
  }
  return tags;
}

function bracketSuffix(entry) {
  const tags = detectTags(entry);
  const severityTag = `[${entry.severity}]`;
  if (tags.length === 0) {
    return severityTag;
  }
  return `${severityTag} ${tags.map((t) => `[${t}]`).join('')}`;
}

function renderEntry(entry) {
  const lines = [];
  lines.push(`### ${entry.id} · ${entry.title}   ${bracketSuffix(entry)}`);
  if (entry.aiWrites !== null && entry.aiWrites !== undefined) {
    lines.push(`**AI writes:** ${entry.aiWrites}`);
  }
  lines.push(`**Breaks:** ${entry.symptom}`);
  lines.push(`**Correct:** ${entry.correct}`);
  lines.push(`**Detect:** ${entry.detectNotes}`);
  return lines.join('\n');
}

function renderSection(section, entries) {
  const lines = [`# ${section.title}`, ''];
  lines.push(entries.map(renderEntry).join('\n\n'));
  return lines.join('\n');
}

function computeCoverage(entries) {
  const rows = [];
  let totalEntries = 0;
  let totalP0 = 0;

  for (const section of SECTIONS) {
    const inSection = entries.filter((e) => e.section === section.id);
    if (inSection.length === 0) continue;
    const p0 = inSection.filter((e) => e.severity === 'P0').length;
    rows.push({ num: section.num, area: areaName(section), count: inSection.length, p0 });
    totalEntries += inSection.length;
    totalP0 += p0;
  }

  return { rows, totalEntries, totalP0 };
}

function renderCoverageTable(entries) {
  const { rows, totalEntries, totalP0 } = computeCoverage(entries);
  const lines = ['## Coverage summary', '', '| § | area | entries | P0 |', '|---|---|---|---|'];
  for (const row of rows) {
    lines.push(`| ${row.num} | ${row.area} | ${row.count} | ${row.p0} |`);
  }
  lines.push(`| | **total** | **${totalEntries}** | **${totalP0}** |`);
  return lines.join('\n');
}

function pct(count, total) {
  if (total === 0) return 0;
  return Math.round((100 * count) / total);
}

function renderDetectionFeasibility(entries) {
  const total = entries.length;
  const staticCount = entries.filter((e) => e.detect.includes('static')).length;
  const runtimeCount = entries.filter((e) => e.detect.includes('runtime')).length;
  const deviceOnlyCount = entries.filter((e) => e.deviceOnly).length;

  const lines = [
    '**Detection feasibility**',
    '',
    `- **~${pct(staticCount, total)}%** are catchable **statically** — no browser needed, runs on every save.`,
    `- **~${pct(runtimeCount, total)}%** need a **runtime** browser assertion.`,
    `- **~${pct(deviceOnlyCount, total)}%** are **device-only** and must be reported as \`UNVERIFIED\`, never as passing.`,
  ];
  return lines.join('\n');
}

const PREAMBLE = `# The PWA / Frontend AI-Mistake Catalog

Every failure mode an AI coding agent reliably introduces when turning an existing
web app into a mobile PWA — and how to *detect* each one automatically.

This is the source of truth the skill suite is built on. Each entry is written so a
verifier can be generated from it mechanically.

_This file is generated from \`packages/catalog/catalog.json\` by
\`packages/catalog/generate-md.mjs\`. Do not hand-edit — edit the catalog entries and
regenerate._

---

## How to read an entry

\`\`\`
### <ID> · <one-line failure>            [severity] [detection]
AI writes:   what the agent actually produces
Breaks:      the real-world symptom, and why
Correct:     the fix that actually works
Detect:      the concrete assertion that catches it
\`\`\`

**Severity**

| | meaning |
|---|---|
| **P0** | App is broken, uninstallable, unusable, or serves stale/dead code. Ship-blocker. |
| **P1** | Users immediately feel "this is a website in a box, not an app". |
| **P2** | Polish. Noticed by good testers and by you. |

**Detection channel**

| | method |
|---|---|
| **[S]** | Static — source/AST/CSS scan. No browser. Fast, runs on every save. |
| **[R]** | Runtime — Playwright assertion in a mobile WebKit/Chromium context. |
| **[L]** | Lighthouse / manifest / SW audit. |
| **[V]** | Visual regression snapshot at mobile widths. |
| **[D]** | **Real device only** — emulation cannot prove it. Must be flagged as unverifiable in CI, never silently "passed". |

The **[D]** class matters more than it looks. Playwright's WebKit is *not* iOS Safari —
it does not run the iOS input-zoom heuristic, the URL-bar viewport collapse, the
home-screen icon pipeline, or ITP storage eviction. Any suite that claims to verify
those in CI is lying. The honest design reports them as \`UNVERIFIED (device-only)\`.

---
`;

const CLOSING_NOTES = `## Two honest flags

1. **"No zoom allowed" as stated is half-wrong.** Blocking double-tap and input-focus zoom is correct and the suite will enforce it. Blocking *pinch* zoom is a WCAG 1.4.4 failure that iOS Safari overrides anyway — the suite should refuse to emit it and fail the check if it finds it (P-701).
2. **"No text selection allowed" as stated is half-wrong too.** Correct for chrome (tabs, buttons, headers); applying it globally breaks copy on real content and is a common agent overreach. The suite enforces the chrome/content split (P-111, P-702).
`;

/**
 * Render the full catalog Markdown document from an array of catalog
 * entries (the parsed contents of catalog.json, or a fixture subset of it).
 *
 * Purely a function of `entries` — no filesystem access, no hidden state.
 *
 * @param {object[]} entries
 * @returns {string}
 */
export function renderMarkdown(entries) {
  const parts = [PREAMBLE];

  for (const section of SECTIONS) {
    const inSection = entries.filter((e) => e.section === section.id);
    if (inSection.length === 0) continue;
    parts.push(renderSection(section, inSection));
    parts.push('---');
  }

  parts.push(renderCoverageTable(entries));
  parts.push('');
  parts.push(renderDetectionFeasibility(entries));
  parts.push('');
  parts.push(CLOSING_NOTES);

  return `${parts.join('\n\n')}\n`;
}

function loadEntries() {
  return JSON.parse(readFileSync(catalogPath, 'utf8'));
}

function main() {
  const args = process.argv.slice(2);
  const checkMode = args.includes('--check');

  const entries = loadEntries();
  const generated = renderMarkdown(entries);

  if (checkMode) {
    if (!existsSync(docPath)) {
      console.error(`${docPath} does not exist. Run without --check to generate it.`);
      process.exit(1);
    }
    const onDisk = readFileSync(docPath, 'utf8');
    if (onDisk === generated) {
      console.log('docs/catalog.md: up to date with catalog.json.');
      process.exit(0);
    }
    console.error('docs/catalog.md is out of date with catalog.json. Run `node packages/catalog/generate-md.mjs` to regenerate.');
    const diskLines = onDisk.split('\n');
    const genLines = generated.split('\n');
    const maxLines = Math.max(diskLines.length, genLines.length);
    let shown = 0;
    for (let i = 0; i < maxLines && shown < 20; i++) {
      if (diskLines[i] !== genLines[i]) {
        console.error(`  line ${i + 1}:`);
        console.error(`    - ${diskLines[i] ?? '<missing>'}`);
        console.error(`    + ${genLines[i] ?? '<missing>'}`);
        shown++;
      }
    }
    process.exit(1);
  }

  writeFileSync(docPath, generated);
  console.log(`docs/catalog.md: regenerated from ${entries.length} catalog entries.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
