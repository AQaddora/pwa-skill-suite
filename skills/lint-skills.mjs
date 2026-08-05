#!/usr/bin/env node
// Drift linter for the skill suite. For every skills/<name>/SKILL.md it asserts:
//   1. YAML frontmatter exists with a non-empty `name` that equals the directory,
//   2. a non-empty `description` that contains at least one quoted trigger phrase,
//   3. every catalog ID cited in the file (P-###) actually exists in
//      packages/catalog/catalog.json — so a skill's guidance can never cite a
//      rule the catalog doesn't define (guidance and enforcement cannot drift),
//   4. executable examples do not assume the audited repository contains this
//      suite's checkout-only `skills/` or `packages/` paths.
//
// Pure-ish: readFrontmatter/lintSkill are testable functions of their inputs;
// main() wires them to the filesystem and exits non-zero on any failure.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = __dirname;
const catalogPath = path.resolve(__dirname, '..', 'packages', 'catalog', 'catalog.json');
const ownershipPath = path.resolve(
  __dirname,
  'pwa-convert',
  'references',
  'catalog-ownership.json',
);

// Catalog IDs are P-### or P-#### (e.g. P-101, P-1001). Match greedily so the
// leading three digits of a four-digit ID aren't mistaken for a 3-digit ID.
const ID_RE = /\bP-\d{3,4}\b/g;
// One double- or single-quoted phrase of at least three characters.
const TRIGGER_RE = /["“']([^"“”']{3,})["”']/;
const SHELL_FENCE_LANGUAGES = new Set([
  'bash',
  'console',
  'sh',
  'shell',
  'shell-session',
  'zsh',
]);

// Match a Node invocation only where a shell command may begin. Its argument tail is
// inspected separately, so Node flags (`--enable-source-maps`, `--require ...`, etc.) may
// precede the non-portable path without hiding it. Restricting this to executable shell
// fences keeps explanatory prose and non-shell examples out of the policy check.
const NODE_SHELL_COMMAND_RE =
  /(?:^|(?:&&|\|\||;|\|)\s*)(?:[$>]\s+)?(?:(?:env(?:\s+-\S+)*|command|npx)\s+|[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)*node\b([^;&|]*)/g;
const CHECKOUT_RELATIVE_ARGUMENT_RE = /(?:^|\s)['"`]?(?:\.\/)?(?:skills|packages)\//;

function executableShellBlocks(source) {
  const blocks = [];
  let active = null;

  for (const line of source.split(/\r?\n/)) {
    if (!active) {
      const opening = /^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_+-]+)?(?:\s+.*)?$/.exec(line);
      if (!opening) continue;
      active = {
        marker: opening[1][0],
        length: opening[1].length,
        executable: SHELL_FENCE_LANGUAGES.has((opening[2] ?? '').toLowerCase()),
        lines: [],
      };
      continue;
    }

    const trimmed = line.trim();
    if (
      trimmed.length >= active.length &&
      [...trimmed].every((character) => character === active.marker)
    ) {
      if (active.executable) blocks.push(active.lines.join('\n'));
      active = null;
      continue;
    }
    active.lines.push(line);
  }

  return blocks;
}

function containsCheckoutRelativeCommand(source) {
  for (const block of executableShellBlocks(source)) {
    // A continued shell command is one logical command for this check.
    const logicalBlock = block.replace(/\\\r?\n[ \t]*/g, ' ');
    for (const line of logicalBlock.split(/\r?\n/)) {
      if (line.trimStart().startsWith('#')) continue;
      for (const match of line.matchAll(NODE_SHELL_COMMAND_RE)) {
        if (CHECKOUT_RELATIVE_ARGUMENT_RE.test(match[1])) return true;
      }
    }
  }
  return false;
}

export function citedCatalogIds(source) {
  const cited = new Set(source.match(ID_RE) || []);
  const rangeRe = /\bP-(\d{3,4})\.\.P-(\d{3,4})\b/g;
  for (const match of source.matchAll(rangeRe)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (end < start || end - start > 200) continue;
    for (let id = start; id <= end; id += 1) cited.add(`P-${id}`);
  }
  return cited;
}

function affirmativeOwnerRoutes(source) {
  const routes = new Set();
  for (const line of source.split(/\r?\n/)) {
    const tableRoute = /^\s*\|.*\|\s*\*\*`(pwa-[a-z0-9-]+)`\*\*\s*\|\s*$/i.exec(line);
    if (tableRoute) routes.add(tableRoute[1]);
    const verifyRoute = /^\s*Hand off to\s+\*\*`(pwa-[a-z0-9-]+)`\*\*/i.exec(line);
    if (verifyRoute) routes.add(verifyRoute[1]);
  }
  return routes;
}

/**
 * Split a SKILL.md into its YAML frontmatter block and body, and pull the
 * single-line `name`/`description` scalars out of the frontmatter. Deliberately
 * minimal — the suite's frontmatter only uses single-line string scalars, so a
 * full YAML parser would be a dependency we don't need.
 *
 * @param {string} source
 * @returns {{ name: string|null, description: string|null, body: string, hasFrontmatter: boolean }}
 */
export function readFrontmatter(source) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source);
  if (!match) {
    return { name: null, description: null, body: source, hasFrontmatter: false };
  }
  const [, front, body] = match;
  const scalar = (key) => {
    const m = new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm').exec(front);
    if (!m) return null;
    return m[1].replace(/^["']|["']$/g, '').trim() || null;
  };
  return { name: scalar('name'), description: scalar('description'), body, hasFrontmatter: true };
}

/**
 * Lint one skill's SKILL.md source against its expected directory name and the
 * set of known catalog IDs. Returns an array of human-readable problems (empty
 * === clean).
 *
 * @param {{ dirName: string, source: string, catalogIds: Set<string> }} args
 * @returns {string[]}
 */
export function lintSkill({ dirName, source, catalogIds }) {
  const problems = [];
  const { name, description, hasFrontmatter } = readFrontmatter(source);

  if (!hasFrontmatter) {
    problems.push('missing YAML frontmatter (--- block)');
    return problems;
  }
  if (!name) problems.push('frontmatter `name` is missing or empty');
  else if (name !== dirName) problems.push(`frontmatter \`name\` "${name}" != directory "${dirName}"`);

  if (!description) problems.push('frontmatter `description` is missing or empty');
  else if (!TRIGGER_RE.test(description)) {
    problems.push('`description` has no quoted trigger phrase (e.g. "audit this PWA")');
  }

  // Scan the whole source (frontmatter description + body): skills legitimately
  // cite catalog IDs in both, and an unknown ID must be caught wherever it appears.
  const cited = citedCatalogIds(source);
  for (const id of [...cited].sort()) {
    if (!catalogIds.has(id)) problems.push(`cites unknown catalog ID ${id}`);
  }

  if (containsCheckoutRelativeCommand(source)) {
    problems.push(
      'contains a checkout-relative `node skills/...` or `node packages/...` command; resolve executables from the selected skill directory so the skill works in any repository',
    );
  }

  return problems;
}

export function lintOwnership({
  entries,
  ownership,
  skillNames,
  orchestratorSource,
  skillSources = null,
}) {
  const problems = [];
  const sections = new Set(entries.map((entry) => entry.section));
  const affirmativeRoutes = affirmativeOwnerRoutes(orchestratorSource);
  for (const section of [...sections].sort()) {
    const owner = ownership[section];
    if (!owner) {
      problems.push(`catalog section "${section}" has no primary skill owner`);
      continue;
    }
    if (!skillNames.has(owner)) {
      problems.push(`catalog section "${section}" names missing skill "${owner}"`);
      continue;
    }
    if (!affirmativeRoutes.has(owner)) {
      problems.push(`pwa-convert does not route catalog owner "${owner}"`);
    }
  }
  for (const section of Object.keys(ownership).sort()) {
    if (!sections.has(section)) problems.push(`ownership map contains unknown section "${section}"`);
  }
  if (skillSources) {
    const citedByOwner = new Map(
      [...skillSources].map(([name, source]) => [name, citedCatalogIds(source)]),
    );
    for (const entry of entries) {
      const owner = ownership[entry.section];
      if (!owner || !skillNames.has(owner)) continue;
      if (!citedByOwner.get(owner)?.has(entry.id)) {
        problems.push(`catalog entry ${entry.id} is not taught by owner skill "${owner}"`);
      }
    }
  }
  return problems;
}

function loadCatalogIds() {
  const entries = JSON.parse(readFileSync(catalogPath, 'utf8'));
  return new Set(entries.map((e) => e.id));
}

function discoverSkills() {
  return readdirSync(skillsDir)
    .filter((name) => {
      const p = path.join(skillsDir, name);
      return statSync(p).isDirectory() && existsSync(path.join(p, 'SKILL.md'));
    })
    .sort();
}

function main() {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const catalogIds = new Set(catalog.map((entry) => entry.id));
  const skills = discoverSkills();
  if (skills.length === 0) {
    console.error('lint-skills: no skills/*/SKILL.md found.');
    process.exit(1);
  }

  let failures = 0;
  for (const dirName of skills) {
    const source = readFileSync(path.join(skillsDir, dirName, 'SKILL.md'), 'utf8');
    const problems = lintSkill({ dirName, source, catalogIds });
    if (problems.length === 0) {
      console.log(`OK   ${dirName}`);
    } else {
      failures += 1;
      console.log(`FAIL ${dirName}`);
      for (const p of problems) console.log(`       - ${p}`);
    }
  }

  const ownership = JSON.parse(readFileSync(ownershipPath, 'utf8'));
  const orchestratorSource = readFileSync(path.join(skillsDir, 'pwa-convert', 'SKILL.md'), 'utf8');
  const skillSources = new Map(
    skills.map((name) => [name, readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8')]),
  );
  const routingProblems = lintOwnership({
    entries: catalog,
    ownership,
    skillNames: new Set(skills),
    orchestratorSource,
    skillSources,
  });
  if (routingProblems.length === 0) {
    console.log('OK   catalog ownership');
  } else {
    failures += 1;
    console.log('FAIL catalog ownership');
    for (const problem of routingProblems) console.log(`       - ${problem}`);
  }

  console.log(`\n${skills.length} skill(s) checked, ${failures} failing.`);
  process.exit(failures ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
