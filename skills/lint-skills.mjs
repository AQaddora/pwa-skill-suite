#!/usr/bin/env node
// Drift linter for the skill suite. For every skills/<name>/SKILL.md it asserts:
//   1. YAML frontmatter exists with a non-empty `name` that equals the directory,
//   2. a non-empty `description` that contains at least one quoted trigger phrase,
//   3. every catalog ID cited in the file (P-###) actually exists in
//      packages/catalog/catalog.json — so a skill's guidance can never cite a
//      rule the catalog doesn't define (guidance and enforcement cannot drift).
//
// Pure-ish: readFrontmatter/lintSkill are testable functions of their inputs;
// main() wires them to the filesystem and exits non-zero on any failure.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = __dirname;
const catalogPath = path.resolve(__dirname, '..', 'packages', 'catalog', 'catalog.json');

// Catalog IDs are P-### or P-#### (e.g. P-101, P-1001). Match greedily so the
// leading three digits of a four-digit ID aren't mistaken for a 3-digit ID.
const ID_RE = /\bP-\d{3,4}\b/g;
// One double- or single-quoted phrase of at least three characters.
const TRIGGER_RE = /["“']([^"“”']{3,})["”']/;

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
  const { name, description, body, hasFrontmatter } = readFrontmatter(source);

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

  const cited = new Set((body.match(ID_RE) || []));
  for (const id of [...cited].sort()) {
    if (!catalogIds.has(id)) problems.push(`cites unknown catalog ID ${id}`);
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
  const catalogIds = loadCatalogIds();
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

  console.log(`\n${skills.length} skill(s) checked, ${failures} failing.`);
  process.exit(failures ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
