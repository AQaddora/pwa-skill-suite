import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../render-md.mjs';
import { SCANNER_BLIND_SPOTS } from '../visibility.mjs';

const model = {
  blindSpots: SCANNER_BLIND_SPOTS,
  summary: { p0: 2, p1: 0, p2: 0, advisory: 1 },
  grouped: [
    {
      id: 'P-801',
      catalogEntry: {
        id: 'P-801',
        title: 'Physical CSS',
        severity: 'P0',
        confidence: 'high',
        symptom: 'Layout does not mirror in RTL.',
        correct: 'Use logical properties: margin-inline-start, text-align: start.',
      },
      count: 2,
      instances: [
        { file: 'a.css', line: 1, excerpt: 'margin-left: 4px' },
        { file: 'b.css', line: 9, excerpt: 'margin-right: 2px' },
      ],
    },
    {
      id: 'P-302',
      catalogEntry: {
        id: 'P-302',
        title: 'Hardcoded px width',
        severity: 'P1',
        confidence: 'advisory',
        symptom: 'Fixed width overflows narrow phones.',
        correct: 'Use max-width with a fluid base.',
      },
      count: 1,
      instances: [{ file: 'c.css', line: 3, excerpt: 'width: 375px' }],
    },
  ],
};

test('render includes the blind-spots disclosure', () => {
  const md = renderMarkdown(model);
  assert.ok(md.includes('styled-components'));
});

test('P0 section is rendered before the P1 section', () => {
  const md = renderMarkdown(model);
  assert.ok(md.indexOf('P0') < md.indexOf('P1'));
});

test('advisory finding is ranked after high-confidence findings', () => {
  const md = renderMarkdown(model);
  // The advisory group P-302 must appear after the high-confidence P0 group P-801.
  assert.ok(md.indexOf('P-801') < md.indexOf('P-302'));
});

test('root-cause instance count is shown', () => {
  const md = renderMarkdown(model);
  assert.ok(md.includes('2 instances'));
});

test('fix text is pulled verbatim from the catalog entry', () => {
  const md = renderMarkdown(model);
  assert.ok(md.includes('Use logical properties: margin-inline-start, text-align: start.'));
});
