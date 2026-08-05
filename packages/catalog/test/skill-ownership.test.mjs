import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lintOwnership } from '../../../skills/lint-skills.mjs';

const entries = [{ id: 'P-101', section: 'ios-webkit' }];

test('catalog ownership accepts a known section routed to an installed skill', () => {
  assert.deepEqual(
    lintOwnership({
      entries,
      ownership: { 'ios-webkit': 'pwa-native-feel' },
      skillNames: new Set(['pwa-native-feel']),
      orchestratorSource: '| iOS/WebKit | **`pwa-native-feel`** |',
      skillSources: new Map([['pwa-native-feel', 'Covers P-101.']]),
    }),
    [],
  );
});

test('catalog ownership rejects negated mentions and lessons missing from the owner', () => {
  const negated = lintOwnership({
    entries,
    ownership: { 'ios-webkit': 'pwa-native-feel' },
    skillNames: new Set(['pwa-native-feel']),
    orchestratorSource: 'Do not route to `pwa-native-feel`.',
    skillSources: new Map([['pwa-native-feel', 'Covers P-101.']]),
  });
  assert.match(negated.join('\n'), /does not route/);

  const negatedHandoff = lintOwnership({
    entries,
    ownership: { 'ios-webkit': 'pwa-native-feel' },
    skillNames: new Set(['pwa-native-feel']),
    orchestratorSource: 'Do not Hand off to **`pwa-native-feel`**.',
    skillSources: new Map([['pwa-native-feel', 'Covers P-101.']]),
  });
  assert.match(negatedHandoff.join('\n'), /does not route/);

  const untaught = lintOwnership({
    entries,
    ownership: { 'ios-webkit': 'pwa-native-feel' },
    skillNames: new Set(['pwa-native-feel']),
    orchestratorSource: '| iOS/WebKit | **`pwa-native-feel`** |',
    skillSources: new Map([['pwa-native-feel', 'No catalog lesson here.']]),
  });
  assert.match(untaught.join('\n'), /P-101 is not taught/);
});

test('catalog ownership rejects missing, stale, absent, and unrouted owners', () => {
  assert.match(
    lintOwnership({
      entries,
      ownership: { stale: 'pwa-missing' },
      skillNames: new Set(),
      orchestratorSource: '',
    }).join('\n'),
    /no primary skill owner|unknown section/,
  );

  assert.match(
    lintOwnership({
      entries,
      ownership: { 'ios-webkit': 'pwa-native-feel' },
      skillNames: new Set(['pwa-native-feel']),
      orchestratorSource: '',
    }).join('\n'),
    /does not route/,
  );
});
