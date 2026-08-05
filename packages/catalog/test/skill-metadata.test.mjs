import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { lintSkill } from '../../../skills/lint-skills.mjs';

const skillsRoot = fileURLToPath(new URL('../../../skills', import.meta.url));

function interfaceBlock(source) {
  const matches = [...source.matchAll(/^interface:\s*$/gm)];
  assert.equal(matches.length, 1, 'metadata must contain exactly one interface block');
  const start = matches[0].index + matches[0][0].length;
  const remainder = source.slice(start).replace(/^\r?\n/, '');
  const block = remainder.match(/^(?:(?: {2}|\t).*(?:\r?\n|$))*/)?.[0] ?? '';
  assert.notEqual(block, '', 'interface block must not be empty');
  return block;
}

function quotedField(block, key) {
  const matches = [
    ...block.matchAll(new RegExp(`^  ${key}:\\s*("(?:\\\\.|[^"\\\\])*")\\s*$`, 'gm')),
  ];
  assert.equal(matches.length, 1, `${key} must exist once under interface and use a quoted string`);
  return JSON.parse(matches[0][1]);
}

test('every installed skill has valid generic Codex UI metadata', () => {
  const skills = readdirSync(skillsRoot)
    .filter((name) => existsSync(path.join(skillsRoot, name, 'SKILL.md')))
    .sort();

  assert.ok(skills.length > 0);
  for (const name of skills) {
    const metadataPath = path.join(skillsRoot, name, 'agents', 'openai.yaml');
    assert.ok(existsSync(metadataPath), `${name} is missing agents/openai.yaml`);
    const skillSource = readFileSync(path.join(skillsRoot, name, 'SKILL.md'), 'utf8');
    assert.doesNotMatch(
      skillSource,
      /^\s*node\s+(?:skills|packages)\//m,
      `${name} has a checkout-relative command and will fail in unrelated repositories`,
    );
    const source = readFileSync(metadataPath, 'utf8');
    const block = interfaceBlock(source);

    const displayName = quotedField(block, 'display_name');
    const shortDescription = quotedField(block, 'short_description');
    const defaultPrompt = quotedField(block, 'default_prompt');

    assert.ok(displayName.length > 0, `${name} display_name is empty`);
    assert.ok(
      shortDescription.length >= 25 && shortDescription.length <= 64,
      `${name} short_description must be 25–64 characters`,
    );
    assert.match(defaultPrompt, new RegExp(`\\$${name}\\b`), `${name} default_prompt must name $${name}`);
  }
});

test('Codex UI metadata fields must be nested under interface', () => {
  const invalid = [
    'interface:',
    'display_name: "Top level"',
    'short_description: "This description is long enough"',
    'default_prompt: "Use $pwa-audit here."',
    '',
  ].join('\n');
  assert.throws(() => interfaceBlock(invalid), /must not be empty/);
});

test('skill lint rejects checkout-relative commands in executable shell fences', () => {
  const wrapper = (command) => [
    '---',
    'name: pwa-test',
    'description: \'Use when asked to "test this PWA".\'',
    '---',
    '```bash',
    command,
    '```',
  ].join('\n');

  for (const command of [
    'node skills/pwa-audit/scripts/run-audit.mjs .',
    'node ./skills/pwa-audit/scripts/run-audit.mjs .',
    'node "skills/pwa-audit/scripts/run-audit.mjs" .',
    '$ node skills/pwa-audit/scripts/run-audit.mjs .',
    'env DEBUG=1 node packages/scanner/cli.mjs .',
    'node --enable-source-maps skills/pwa-audit/scripts/run-audit.mjs .',
    'node --require ./setup.cjs "packages/scanner/cli.mjs" .',
  ]) {
    assert.match(
      lintSkill({ dirName: 'pwa-test', source: wrapper(command), catalogIds: new Set() }).join(
        '\n',
      ),
      /checkout-relative/,
      command,
    );
  }

  assert.deepEqual(
    lintSkill({
      dirName: 'pwa-test',
      source: wrapper('node "<pwa-audit-skill-dir>/scripts/run-audit.mjs" .'),
      catalogIds: new Set(),
    }),
    [],
  );

  const proseOnly = [
    '---',
    'name: pwa-test',
    'description: \'Use when asked to "test this PWA".\'',
    '---',
    'Never run node skills/pwa-audit/scripts/run-audit.mjs from the target repository.',
    '',
    '```text',
    'node packages/scanner/cli.mjs is a deliberately non-executable example.',
    '```',
    '',
    '```bash',
    '# Never run node skills/pwa-audit/scripts/run-audit.mjs from the target repository.',
    'echo "node packages/scanner/cli.mjs is not being executed"',
    'node "<pwa-audit-skill-dir>/scripts/run-audit.mjs" .',
    '```',
  ].join('\n');
  assert.deepEqual(
    lintSkill({ dirName: 'pwa-test', source: proseOnly, catalogIds: new Set() }),
    [],
  );
});
