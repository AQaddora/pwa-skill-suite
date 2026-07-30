import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdown } from '../generate-md.mjs';

function makeEntry(overrides = {}) {
  return {
    id: 'P-101',
    title: 'Input focus zooms the whole page',
    section: 'ios-webkit',
    severity: 'P1',
    detect: ['static', 'runtime'],
    confidence: 'advisory',
    deviceOnly: true,
    aiWrites: '`<input class="text-sm">` on form controls.',
    symptom: 'iOS Safari auto-zooms any focused control whose computed font-size < 16px.',
    correct: 'Computed font-size >= 16px on every input, select, textarea.',
    detectNotes: '[S] scan computed styles. [R] focus each control, assert visualViewport.scale === 1.',
    rule: null,
    probe: null,
    verified: { ios: '18.x', chrome: '13x', date: '2026-07-30' },
    ...overrides,
  };
}

const fixtureEntries = [
  makeEntry({ id: 'P-101', section: 'ios-webkit', severity: 'P1', detect: ['static', 'runtime'], deviceOnly: true }),
  makeEntry({
    id: 'P-108',
    title: 'Grey tap flash on every touch',
    section: 'ios-webkit',
    severity: 'P2',
    detect: ['static'],
    deviceOnly: false,
    aiWrites: null,
  }),
  makeEntry({
    id: 'P-401',
    title: 'No manifest, or not linked',
    section: 'manifest',
    severity: 'P0',
    detect: ['static', 'lighthouse'],
    deviceOnly: false,
    aiWrites: null,
  }),
];

test('renderMarkdown includes each entry id as a heading', () => {
  const md = renderMarkdown(fixtureEntries);
  assert.match(md, /###\s+P-101\s+·\s+Input focus zooms the whole page/);
  assert.match(md, /###\s+P-108\s+·\s+Grey tap flash on every touch/);
  assert.match(md, /###\s+P-401\s+·\s+No manifest, or not linked/);
});

test('renderMarkdown renders severity and bracket-style detect tags per entry', () => {
  const md = renderMarkdown(fixtureEntries);
  // P-101: static+runtime detect, deviceOnly true -> [S][R][D]
  assert.match(md, /P-101 · Input focus zooms the whole page\s+\[P1\] \[S\]\[R\]\[D\]/);
  // P-108: static only, not device-only -> [S], no [D]
  assert.match(md, /P-108 · Grey tap flash on every touch\s+\[P2\] \[S\]/);
  const p108Line = md.split('\n').find((l) => l.includes('P-108 ·'));
  assert.ok(p108Line, 'expected a heading line for P-108');
  assert.ok(!p108Line.includes('[D]'), `did not expect [D] on a non-device-only entry, got: ${p108Line}`);
  // P-401: static+lighthouse -> [S][L]
  assert.match(md, /P-401 · No manifest, or not linked\s+\[P0\] \[S\]\[L\]/);
});

test('renderMarkdown renders the four prose fields as labelled paragraphs, skipping a null aiWrites', () => {
  const md = renderMarkdown(fixtureEntries);
  assert.match(md, /\*\*AI writes:\*\* `<input class="text-sm">` on form controls\./);
  assert.match(md, /\*\*Breaks:\*\* iOS Safari auto-zooms/);
  assert.match(md, /\*\*Correct:\*\* Computed font-size >= 16px/);
  assert.match(md, /\*\*Detect:\*\* \[S\] scan computed styles\./);

  // P-108 has aiWrites: null - its entry block must not contain an "AI writes:" line.
  const blocks = md.split(/(?=### P-)/);
  const p108Block = blocks.find((b) => b.startsWith('### P-108'));
  assert.ok(p108Block, 'expected a block for P-108');
  assert.ok(!p108Block.includes('**AI writes:**'), 'P-108 has aiWrites: null and should render no AI writes line');
});

test('renderMarkdown groups entries under fixed section headings in display order', () => {
  const md = renderMarkdown(fixtureEntries);
  assert.match(md, /§1 · iOS Safari & WebKit/);
  assert.match(md, /§4 · Manifest, install & icons/);
  const iosIdx = md.indexOf('§1 · iOS Safari & WebKit');
  const manifestIdx = md.indexOf('§4 · Manifest, install & icons');
  const p101Idx = md.indexOf('### P-101');
  const p401Idx = md.indexOf('### P-401');
  assert.ok(iosIdx < p101Idx && p101Idx < manifestIdx, 'P-101 should render inside §1, before §4');
  assert.ok(manifestIdx < p401Idx, 'P-401 should render inside §4');

  // Sections with zero entries in the fixture should not appear at all.
  assert.doesNotMatch(md, /§5 · Service worker/);
  assert.doesNotMatch(md, /§12 · What agents never test/);
});

test('renderMarkdown coverage-summary table has correct per-section and per-severity counts computed from input', () => {
  const md = renderMarkdown(fixtureEntries);
  const tableSection = md.slice(md.indexOf('## Coverage summary'));

  // §1 iOS Safari & WebKit: 2 entries (P-101, P-108), 0 P0
  assert.match(tableSection, /\|\s*1\s*\|\s*iOS Safari & WebKit\s*\|\s*2\s*\|\s*0\s*\|/);
  // §4 Manifest, install & icons: 1 entry (P-401), 1 P0
  assert.match(tableSection, /\|\s*4\s*\|\s*Manifest, install & icons\s*\|\s*1\s*\|\s*1\s*\|/);
  // total row: 3 entries, 1 P0
  assert.match(tableSection, /\*\*total\*\*\s*\|\s*\*\*3\*\*\s*\|\s*\*\*1\*\*/);
});

test('renderMarkdown appends the static "Two honest flags" closing notes referencing P-701 and P-111/P-702', () => {
  const md = renderMarkdown(fixtureEntries);
  assert.match(md, /Two honest flags/);
  assert.match(md, /P-701/);
  assert.match(md, /P-111/);
  assert.match(md, /P-702/);
});

test('renderMarkdown is deterministic - same input produces byte-identical output', () => {
  const a = renderMarkdown(fixtureEntries);
  const b = renderMarkdown(fixtureEntries);
  assert.equal(a, b);
});

test('renderMarkdown handles an entry with empty detect array and deviceOnly false (no bracket group at all)', () => {
  const entries = [
    makeEntry({
      id: 'P-1210',
      title: 'Declared "done" from a green build',
      section: 'meta',
      severity: 'P1',
      detect: [],
      deviceOnly: false,
      aiWrites: null,
    }),
  ];
  const md = renderMarkdown(entries);
  assert.match(md, /P-1210 · Declared "done" from a green build\s+\[P1\]\s*\n/);
});
