import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runScan } from '../cli.mjs';
import { buildReport } from '../../report/index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(HERE, '..', 'cli.mjs');
const P701_CATALOG_ENTRY = {
  id: 'P-701',
  title: 'Pinch zoom disabled',
  section: 'accessibility',
  severity: 'P0',
  confidence: 'high',
  deviceOnly: false,
  rule: 'packages/scanner/rules/p701-user-scalable.mjs',
};
const P514_CATALOG_ENTRY = {
  id: 'P-514',
  title: 'Service worker cache TTL',
  section: 'service-worker',
  severity: 'P0',
  confidence: 'advisory',
  deviceOnly: false,
  rule: 'packages/scanner/rules/p514-sw-cache-ttl.mjs',
};
const P112_CATALOG_ENTRY = {
  id: 'P-112',
  title: 'Broad touch callout suppression',
  section: 'ios-webkit',
  severity: 'P2',
  confidence: 'high',
  deviceOnly: false,
  rule: 'packages/scanner/rules/p112-touch-callout.mjs',
};
const P103_CATALOG_ENTRY = {
  id: 'P-103',
  title: 'Safe-area padding missing',
  section: 'ios-webkit',
  severity: 'P0',
  confidence: 'advisory',
  deviceOnly: false,
  rule: 'packages/scanner/rules/p103-safe-area-env.mjs',
};
const P302_CATALOG_ENTRY = {
  id: 'P-302',
  title: 'Hardcoded layout width',
  section: 'responsive',
  severity: 'P1',
  confidence: 'advisory',
  deviceOnly: false,
  rule: 'packages/scanner/rules/p302-hardcoded-px-widths.mjs',
};
const P801_CATALOG_ENTRY = {
  id: 'P-801',
  title: 'Physical CSS in an RTL app',
  section: 'rtl',
  severity: 'P0',
  confidence: 'high',
  deviceOnly: false,
  rule: 'packages/scanner/rules/p801-physical-css.mjs',
};
const P561_CATALOG_ENTRY = {
  id: 'P-561',
  title: 'Service-worker registration rejection is unhandled',
  section: 'service-worker',
  severity: 'P0',
  confidence: 'high',
  deviceOnly: false,
  rule: 'packages/scanner/rules/p561-sw-register-no-catch.mjs',
};
const REQUIRED_UNSUPPORTED_WEB_EXTENSIONS = [
  '.astro',
  '.mdx',
  '.php',
  '.erb',
  '.ejs',
  '.liquid',
  '.hbs',
  '.pug',
  '.razor',
  '.cshtml',
];

function tmpProject(files) {
  const dir = mkdtempSync(join(tmpdir(), 'scan-'));
  for (const [name, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), contents);
  }
  return dir;
}

test('runScan on a directory with nothing to flag returns zero findings', async () => {
  const dir = tmpProject({ 'readme.txt': 'hello world' });
  try {
    const { findings } = await runScan(dir);
    assert.equal(findings.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an empty repository has zero rule coverage and never reports rule PASS', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scan-empty-'));
  try {
    const scan = await runScan(dir, { detectSurfaces: true });
    assert.equal(scan.blocked, false);
    assert.equal(scan.filesScanned, 0);
    assert.equal(scan.coverageById['P-701'], 0);

    const report = buildReport({
      findings: scan.findings,
      catalog: [P701_CATALOG_ENTRY],
      surfaces: scan.surfaces,
      coverageById: scan.coverageById,
      incompleteCoverageById: scan.incompleteCoverageById,
    });
    assert.equal(report.outcomesByEntry.get('P-701'), 'UNVERIFIED');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a current baselined finding remains FAIL and disclosed instead of becoming PASS', () => {
  const dir = tmpProject({
    'index.html': '<meta name="viewport" content="width=device-width, maximum-scale=1">',
    '.pwa-audit-baseline': 'index.html:1:P-701\n',
  });
  try {
    const cli = spawnSync(
      process.execPath,
      [CLI_PATH, dir, '--json', '--baseline', join(dir, '.pwa-audit-baseline')],
      { encoding: 'utf8' },
    );
    assert.equal(cli.status, 0, cli.stderr);
    const report = JSON.parse(cli.stdout);
    assert.equal(report.findings.some((finding) => finding.id === 'P-701'), false);
    assert.equal(report.baselinedFindings.length, 1);
    assert.equal(report.baselinedFindings[0].id, 'P-701');
    assert.equal(report.outcomes['P-701'], 'FAIL');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unsupported Astro markup cannot produce a false P-701 PASS', async () => {
  const dir = tmpProject({
    'package.json': '{"scripts":{"build":"astro build"}}',
    'src/layout.astro': '<meta name="viewport" content="width=device-width, maximum-scale=1">',
  });
  try {
    const scan = await runScan(dir, { detectSurfaces: true });
    assert.equal(scan.blocked, false);
    assert.equal(scan.findings.some((finding) => finding.id === 'P-701'), false);
    assert.equal(scan.coverageById['P-701'], 0);
    assert.equal(scan.incompleteCoverageById['P-701'], 1);

    const report = buildReport({
      findings: scan.findings,
      catalog: [P701_CATALOG_ENTRY],
      surfaces: scan.surfaces,
      coverageById: scan.coverageById,
      incompleteCoverageById: scan.incompleteCoverageById,
    });
    assert.equal(report.outcomesByEntry.get('P-701'), 'UNVERIFIED');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('supported CSS cannot hide a zoom lock in unsupported Astro source', async () => {
  const dir = tmpProject({
    'src/styles.css': ':root { touch-action: manipulation; }',
    'src/layout.astro': '<meta name="viewport" content="width=device-width, maximum-scale=1">',
  });
  try {
    const scan = await runScan(dir, { detectSurfaces: true });
    assert.equal(scan.blocked, false);
    assert.equal(scan.coverageById['P-701'], 1);
    assert.equal(scan.incompleteCoverageById['P-701'], 1);
    assert.equal(scan.findings.some((finding) => finding.id === 'P-701'), false);

    const report = buildReport({
      findings: scan.findings,
      catalog: [P701_CATALOG_ENTRY],
      surfaces: scan.surfaces,
      coverageById: scan.coverageById,
      incompleteCoverageById: scan.incompleteCoverageById,
    });
    assert.equal(report.outcomesByEntry.get('P-701'), 'UNVERIFIED');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('.htm markup is inspected and contributes surfaces instead of disappearing', async () => {
  const dir = tmpProject({
    'src/clean.css': ':root { touch-action: manipulation; }',
    'index.htm':
      '<meta name="viewport" content="width=device-width, user-scalable=no"><form class="h-screen w-screen"><input type="number"></form>',
  });
  try {
    const scan = await runScan(dir, { detectSurfaces: true });
    assert.equal(scan.blocked, false);
    assert.equal(scan.surfaces.forms, true);
    assert.ok(
      scan.findings.some(
        (finding) => finding.id === 'P-701' && finding.file === 'index.htm',
      ),
    );
    assert.ok(
      scan.findings.some(
        (finding) => finding.id === 'P-102' && finding.file === 'index.htm',
      ),
    );
    assert.ok(
      scan.findings.some(
        (finding) => finding.id === 'P-107' && finding.file === 'index.htm',
      ),
    );

    const report = buildReport({
      findings: scan.findings,
      catalog: [P701_CATALOG_ENTRY],
      surfaces: scan.surfaces,
      coverageById: scan.coverageById,
      incompleteCoverageById: scan.incompleteCoverageById,
    });
    assert.equal(report.outcomesByEntry.get('P-701'), 'FAIL');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('clean CSS cannot produce P-701 or P-112 PASS beside unparsed Vue/Svelte styles', async () => {
  const dir = tmpProject({
    'src/styles.css':
      ':root { touch-action: manipulation; }\n.app-nav { -webkit-touch-callout: none; }',
    'src/Unsafe.vue':
      '<template><main>Vue</main></template><style>:root { touch-action: none; } main { -webkit-touch-callout: none; }</style>',
    'src/Unsafe.svelte':
      '<main>Svelte</main><style>body { touch-action: pan-y; } article { -webkit-touch-callout: none; }</style>',
  });
  try {
    const scan = await runScan(dir, { detectSurfaces: true });
    assert.equal(scan.blocked, false);
    assert.equal(
      scan.findings.some((finding) => ['P-701', 'P-112'].includes(finding.id)),
      false,
    );
    assert.ok(scan.coverageById['P-701'] > 0);
    assert.ok(scan.coverageById['P-112'] > 0);
    assert.equal(scan.incompleteCoverageById['P-701'], 2);
    assert.equal(scan.incompleteCoverageById['P-112'], 2);

    const report = buildReport({
      findings: scan.findings,
      catalog: [P701_CATALOG_ENTRY, P112_CATALOG_ENTRY],
      surfaces: scan.surfaces,
      coverageById: scan.coverageById,
      incompleteCoverageById: scan.incompleteCoverageById,
    });
    assert.equal(report.outcomesByEntry.get('P-701'), 'UNVERIFIED');
    assert.equal(report.outcomesByEntry.get('P-112'), 'UNVERIFIED');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('embedded Vue/Svelte styles keep partially parsed CSS rules UNVERIFIED', async () => {
  const dir = tmpProject({
    'src/base.css': '.safe { inline-size: 100%; }',
    'src/App.vue': [
      '<template><main dir="rtl">Vue</main></template>',
      '<style scoped>',
      '.bottom { position: fixed; bottom: 0; padding-bottom: 12px; width: 400px; margin-left: 20px; }',
      '</style>',
    ].join('\n'),
    'src/App.svelte': [
      '<main dir="rtl">Svelte</main>',
      '<style lang="scss">',
      '.bottom { position: fixed; bottom: 0; padding-bottom: 12px; width: 420px; margin-right: 20px; }',
      '</style>',
    ].join('\n'),
  });
  try {
    const scan = await runScan(dir, { detectSurfaces: true });
    assert.equal(scan.blocked, false);
    for (const id of ['P-103', 'P-302', 'P-801']) {
      assert.equal(scan.incompleteCoverageById[id], 2, `${id} must mark both SFCs incomplete`);
      assert.equal(scan.findings.some((finding) => finding.id === id), false);
    }

    const report = buildReport({
      findings: scan.findings,
      catalog: [P103_CATALOG_ENTRY, P302_CATALOG_ENTRY, P801_CATALOG_ENTRY],
      surfaces: scan.surfaces,
      coverageById: scan.coverageById,
      incompleteCoverageById: scan.incompleteCoverageById,
    });
    for (const id of ['P-103', 'P-302', 'P-801']) {
      assert.equal(report.outcomesByEntry.get(id), 'UNVERIFIED');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('all required unsupported web template extensions make coverage incomplete', async () => {
  const files = Object.fromEntries(
    REQUIRED_UNSUPPORTED_WEB_EXTENSIONS.map((ext, index) => [
      `views/template-${index}${ext}`,
      '<meta name="viewport" content="width=device-width">',
    ]),
  );
  const dir = tmpProject(files);
  try {
    const scan = await runScan(dir);
    assert.equal(scan.blocked, false);
    assert.equal(scan.coverageById['P-701'], 0);
    assert.equal(
      scan.incompleteCoverageById['P-701'],
      REQUIRED_UNSUPPORTED_WEB_EXTENSIONS.length,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unsupported deployment config prevents a provider-rule false PASS', async () => {
  const dir = tmpProject({
    'sw.js': "self.addEventListener('install', () => {});",
    '_headers': '/sw.js\n  Cache-Control: no-cache\n',
    'firebase.json': '{"hosting":{}}',
  });
  try {
    const scan = await runScan(dir, { detectSurfaces: true });
    assert.equal(scan.surfaces['service-worker'], true);
    assert.equal(scan.coverageById['P-514'], 1);
    assert.equal(scan.incompleteCoverageById['P-514'], 1);

    const report = buildReport({
      findings: scan.findings,
      catalog: [P514_CATALOG_ENTRY],
      surfaces: scan.surfaces,
      coverageById: scan.coverageById,
      incompleteCoverageById: scan.incompleteCoverageById,
    });
    assert.equal(report.outcomesByEntry.get('P-514'), 'UNVERIFIED');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('generated service-worker plugin configuration makes the SW surface present', async () => {
  const dir = tmpProject({
    'package.json': '{"devDependencies":{"vite-plugin-pwa":"latest"}}',
    'vite.config.ts':
      "import { VitePWA } from 'vite-plugin-pwa'; export default { plugins: [VitePWA({ registerType: 'autoUpdate' })] };",
  });
  try {
    const scan = await runScan(dir, { detectSurfaces: true });
    assert.equal(scan.blocked, false);
    assert.equal(scan.surfaces['service-worker'], true);

    const report = buildReport({
      findings: scan.findings,
      catalog: [P514_CATALOG_ENTRY, P561_CATALOG_ENTRY],
      surfaces: scan.surfaces,
      coverageById: scan.coverageById,
      incompleteCoverageById: scan.incompleteCoverageById,
    });
    assert.notEqual(report.outcomesByEntry.get('P-514'), 'N/A');
    assert.equal(report.outcomesByEntry.get('P-514'), 'UNVERIFIED');
    assert.ok(scan.coverageById['P-561'] > 0);
    assert.equal(scan.incompleteCoverageById['P-561'], 2);
    assert.equal(scan.incompleteCoverageById['P-502'], 2);
    assert.equal(report.outcomesByEntry.get('P-561'), 'UNVERIFIED');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const plugin of ['gatsby-plugin-offline', '@vite-pwa/sveltekit']) {
  test(`${plugin} establishes generated service-worker coverage`, async () => {
    const dir = tmpProject({
      'package.json': JSON.stringify({ dependencies: { [plugin]: 'latest' } }),
      'src/main.ts': 'export const app = true;',
    });
    try {
      const scan = await runScan(dir, { detectSurfaces: true });
      assert.equal(scan.blocked, false);
      assert.equal(scan.surfaces['service-worker'], true);
      assert.equal(scan.incompleteCoverageById['P-502'], 1);
      assert.equal(scan.incompleteCoverageById['P-561'], 1);

      const report = buildReport({
        findings: scan.findings,
        catalog: [P561_CATALOG_ENTRY],
        surfaces: scan.surfaces,
        coverageById: scan.coverageById,
        incompleteCoverageById: scan.incompleteCoverageById,
      });
      assert.equal(report.outcomesByEntry.get('P-561'), 'UNVERIFIED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('runScan skips node_modules', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scan-'));
  mkdirSync(join(dir, 'node_modules'));
  writeFileSync(join(dir, 'node_modules', 'lib.css'), 'a { width: 500px; }');
  try {
    const { findings } = await runScan(dir);
    assert.equal(findings.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a contained symlinked stylesheet is inspected under its repository path', async () => {
  const dir = tmpProject({
    'src/clean.css': ':root { touch-action: manipulation; }',
    'shared/unsafe.source': ':root { touch-action: none; }',
  });
  symlinkSync('../shared/unsafe.source', join(dir, 'src', 'unsafe.css'));
  try {
    const scan = await runScan(dir);
    assert.equal(scan.blocked, false);
    assert.ok(
      scan.findings.some(
        (finding) => finding.id === 'P-701' && finding.file === 'src/unsafe.css',
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an external file symlink blocks the scan instead of disappearing', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'scan-external-link-'));
  const dir = join(parent, 'repo');
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(parent, 'outside.css'), ':root { touch-action: none; }');
  symlinkSync(join(parent, 'outside.css'), join(dir, 'src', 'outside.css'));
  try {
    const scan = await runScan(dir);
    assert.equal(scan.blocked, true);
    assert.ok(scan.diagnostics.some((diagnostic) => diagnostic.code === 'SYMLINK_OUTSIDE_ROOT'));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a cyclic directory symlink blocks the scan instead of disappearing', async () => {
  const dir = tmpProject({ 'src/clean.css': ':root { touch-action: manipulation; }' });
  symlinkSync('.', join(dir, 'src', 'loop'));
  try {
    const scan = await runScan(dir);
    assert.equal(scan.blocked, true);
    assert.ok(scan.diagnostics.some((diagnostic) => diagnostic.code === 'SYMLINK_CYCLE'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a nonexistent target is BLOCKED and the CLI exits nonzero with a precise diagnostic', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'scan-missing-'));
  const missing = join(parent, 'does-not-exist');
  try {
    const result = await runScan(missing);
    assert.equal(result.blocked, true);
    assert.equal(result.diagnostics[0].code, 'TARGET_NOT_FOUND');
    assert.match(result.diagnostics[0].message, /does not exist/i);

    const cli = spawnSync(process.execPath, [CLI_PATH, missing, '--json'], { encoding: 'utf8' });
    assert.equal(cli.status, 2, cli.stderr);
    const report = JSON.parse(cli.stdout);
    assert.equal(report.status, 'BLOCKED');
    assert.equal(report.blocked, true);
    assert.equal(report.diagnostics[0].code, 'TARGET_NOT_FOUND');
    assert.ok(Object.values(report.outcomes).every((outcome) => outcome === 'BLOCKED'));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a rule exception blocks the scan instead of becoming a clean result', async () => {
  const dir = tmpProject({ 'app.js': 'const app = true;' });
  const explodingRule = {
    slug: 'test-exploding-rule',
    ids: ['P-TEST'],
    appliesTo() {
      return true;
    },
    check() {
      throw new Error('synthetic rule failure');
    },
  };
  try {
    const result = await runScan(dir, { rules: [explodingRule] });
    assert.equal(result.blocked, true);
    assert.equal(result.findings.length, 0);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      ['RULE_EXECUTION_FAILED'],
    );
    assert.match(result.diagnostics[0].message, /test-exploding-rule.*app\.js.*synthetic rule failure/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a supplied rule without applicability metadata blocks the ruleset', async () => {
  const dir = tmpProject({ 'app.js': 'const app = true;' });
  try {
    const result = await runScan(dir, {
      rules: [{ slug: 'missing-applicability', ids: ['P-TEST'], check: () => [] }],
    });
    assert.equal(result.blocked, true);
    assert.equal(result.diagnostics[0].code, 'RULESET_LOAD_FAILED');
    assert.match(result.diagnostics[0].message, /appliesTo/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an invalid applicability result blocks the scan instead of inventing coverage', async () => {
  const dir = tmpProject({ 'app.js': 'const app = true;' });
  try {
    const result = await runScan(dir, {
      rules: [
        {
          slug: 'invalid-applicability',
          ids: ['P-TEST'],
          appliesTo: () => 'probably',
          check: () => [],
        },
      ],
    });
    assert.equal(result.blocked, true);
    assert.equal(result.coverageById['P-TEST'], 0);
    assert.equal(result.diagnostics[0].code, 'RULE_EXECUTION_FAILED');
    assert.match(result.diagnostics[0].message, /expected a boolean/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an invalid partial-coverage result blocks the scan instead of inventing PASS', async () => {
  const dir = tmpProject({ 'app.js': 'const app = true;' });
  try {
    const result = await runScan(dir, {
      rules: [
        {
          slug: 'invalid-coverage-completeness',
          ids: ['P-TEST'],
          appliesTo: () => true,
          coverageComplete: () => 'completely',
          check: () => [],
        },
      ],
    });
    assert.equal(result.blocked, true);
    assert.equal(result.diagnostics[0].code, 'RULE_EXECUTION_FAILED');
    assert.match(result.diagnostics[0].message, /coverageComplete.*expected a boolean/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('explicit audit ignores avoid duplicate ambiguous build artifacts', async () => {
  const dir = tmpProject({
    '.pwa-auditignore': 'out/\nbuild/\ndist/\n',
    'out/duplicate.css': 'main { width: 500px; }',
    '.hosting-snapshot/duplicate.css': 'main { width: 600px; }',
    'build/duplicate.css': 'main { width: 650px; }',
    'dist/duplicate.css': 'main { width: 675px; }',
    'src/fluid.css': 'main { width: 100%; }',
  });
  try {
    const result = await runScan(dir);
    assert.equal(result.blocked, false);
    assert.equal(result.findings.some((finding) => finding.file.includes('duplicate.css')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ambiguous build/out/dist names are audited when they contain authored source', async () => {
  const dir = tmpProject({
    'src/clean.css': ':root { touch-action: manipulation; }',
    'build/mobile.css': ':root { touch-action: none; }',
    'out/mobile.htm':
      '<meta name="viewport" content="width=device-width, maximum-scale=1">',
    'dist/mobile.css': 'main { width: 500px; }',
  });
  try {
    const scan = await runScan(dir);
    assert.equal(scan.blocked, false);
    assert.ok(
      scan.findings.some(
        (finding) => finding.id === 'P-701' && finding.file === 'build/mobile.css',
      ),
    );
    assert.ok(
      scan.findings.some(
        (finding) => finding.id === 'P-701' && finding.file === 'out/mobile.htm',
      ),
    );
    assert.ok(
      scan.findings.some(
        (finding) => finding.id === 'P-302' && finding.file === 'dist/mobile.css',
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a root .pwa-auditignore and --ignore exclude repository-specific copies', async () => {
  const dir = tmpProject({
    '.pwa-auditignore': '# private generated tree\nmirror-copy/\n',
    'mirror-copy/duplicate.css': 'main { width: 500px; }',
    'vendor-export/duplicate.css': 'main { width: 600px; }',
    'src/problem.css': 'main { width: 700px; }',
  });
  try {
    const result = await runScan(dir, { ignorePatterns: ['vendor-export/'] });
    assert.equal(result.blocked, false);
    assert.deepEqual(
      [...new Set(result.findings.map((finding) => finding.file))],
      ['src/problem.css'],
    );

    const cli = spawnSync(
      process.execPath,
      [CLI_PATH, dir, '--json', '--ignore', 'vendor-export/'],
      { encoding: 'utf8' },
    );
    assert.equal(cli.status, 0, cli.stderr);
    const report = JSON.parse(cli.stdout);
    assert.deepEqual(
      [...new Set(report.findings.map((finding) => finding.file))],
      ['src/problem.css'],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('P-563 cannot use explicitly ignored output evidence to launder unsafe source', async () => {
  const dir = tmpProject({
    '.pwa-auditignore': 'out/\n',
    'src/main.jsx':
      "import { createRoot } from 'react-dom/client'; createRoot(document.querySelector('#root')).render(null);",
    'out/generated.js':
      "class ErrorBoundary {}\nwindow.addEventListener('error', captureException);\nSentry.captureException(new Error());",
  });
  try {
    const scan = await runScan(dir);
    assert.equal(scan.blocked, false);
    assert.ok(scan.findings.some((finding) => finding.id === 'P-563'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('P-563 honors .pwa-auditignore for aggregate evidence', async () => {
  const dir = tmpProject({
    '.pwa-auditignore': 'generated-copy/\n',
    'src/main.jsx':
      "import { createRoot } from 'react-dom/client'; createRoot(document.querySelector('#root')).render(null);",
    'generated-copy/runtime.js':
      "class ErrorBoundary {}\nwindow.addEventListener('unhandledrejection', captureException);\nBugsnag.notify(new Error());",
  });
  try {
    const scan = await runScan(dir);
    assert.equal(scan.blocked, false);
    assert.ok(scan.findings.some((finding) => finding.id === 'P-563'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('P-563 rejects inert strings/comments and test/example evidence', async () => {
  const dir = tmpProject({
    'src/main.jsx':
      "import { createRoot } from 'react-dom/client'; createRoot(document.querySelector('#root')).render(null);",
    'src/decoys.ts':
      "export const documentation = 'ErrorBoundary window.onerror Sentry.captureException(error)';\n// ErrorBoundary window.onerror Sentry.captureException(error)",
    'test/observability.test.ts':
      "class ErrorBoundary {}\nwindow.onerror = () => {};\nSentry.captureException(new Error());",
    'examples/monitoring.ts':
      "class ErrorBoundary {}\nwindow.addEventListener('error', () => {});\nBugsnag.notify(new Error());",
    'src/__fixtures__/generated-observability.ts':
      "class ErrorBoundary {}\nwindow.onerror = () => {};\nRollbar.error(new Error());",
  });
  try {
    const scan = await runScan(dir);
    assert.equal(scan.blocked, false);
    assert.ok(scan.findings.some((finding) => finding.id === 'P-563'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('P-563 requires both global error and unhandled-rejection handlers', async () => {
  const dir = tmpProject({
    'src/main.jsx':
      "import { createRoot } from 'react-dom/client'; createRoot(document.querySelector('#root')).render(<ErrorBoundary />);",
    'src/observability.ts':
      "window.addEventListener('error', (event) => Sentry.captureException(event.error));",
  });
  try {
    const scan = await runScan(dir);
    assert.equal(scan.blocked, false);
    const finding = scan.findings.find((candidate) => candidate.id === 'P-563');
    assert.ok(finding);
    assert.match(finding.excerpt, /unhandledrejection/);
    assert.doesNotMatch(finding.excerpt, /no error boundary/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('P-563 does not borrow observability evidence from a sibling workspace', async () => {
  const dir = tmpProject({
    'package.json': '{"private":true,"workspaces":["apps/*"]}',
    'apps/storefront/package.json': '{"name":"storefront"}',
    'apps/storefront/src/main.jsx':
      "import { createRoot } from 'react-dom/client'; createRoot(document.querySelector('#root')).render(<App />);",
    'apps/admin/package.json': '{"name":"admin"}',
    'apps/admin/src/observability.ts': [
      'class ErrorBoundary {}',
      "window.addEventListener('error', (event) => Sentry.captureException(event.error));",
      "window.addEventListener('unhandledrejection', (event) => Sentry.captureException(event.reason));",
      'Sentry.init({});',
    ].join('\n'),
  });
  try {
    const scan = await runScan(dir);
    assert.equal(scan.blocked, false);
    assert.ok(
      scan.findings.some(
        (finding) =>
          finding.id === 'P-563' && finding.file === 'apps/storefront/src/main.jsx',
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('P-563 rejects null handlers, non-global listeners, and docs/playground evidence', async () => {
  const dir = tmpProject({
    'package.json': '{"name":"app"}',
    'src/main.jsx': [
      "import { createRoot } from 'react-dom/client';",
      'class ErrorBoundary {}',
      'Sentry.init({});',
      "createRoot(document.querySelector('#root')).render(<ErrorBoundary />);",
    ].join('\n'),
    'src/decoys.ts': [
      'window.onerror = null;',
      'window.onunhandledrejection = undefined;',
      "image.addEventListener('error', captureException);",
      "bus.addEventListener('unhandledrejection', captureException);",
    ].join('\n'),
    'docs/observability.ts': [
      "window.addEventListener('error', captureException);",
      "window.addEventListener('unhandledrejection', captureException);",
    ].join('\n'),
    'playground/observability.ts': [
      "globalThis.addEventListener('error', captureException);",
      "globalThis.addEventListener('unhandledrejection', captureException);",
    ].join('\n'),
  });
  try {
    const scan = await runScan(dir);
    assert.equal(scan.blocked, false);
    const finding = scan.findings.find((candidate) => candidate.id === 'P-563');
    assert.ok(finding);
    assert.match(finding.excerpt, /global error handler/);
    assert.match(finding.excerpt, /global unhandledrejection handler/);
    assert.doesNotMatch(finding.excerpt, /no error boundary/);
    assert.doesNotMatch(finding.excerpt, /reporting sink/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('P-563 does not treat identifiers ending in window as browser globals', async () => {
  const dir = tmpProject({
    'src/main.jsx': [
      "import { createRoot } from 'react-dom/client';",
      'class ErrorBoundary {}',
      'Sentry.init({});',
      'mywindow.onerror = handleError;',
      'mywindow.onunhandledrejection = handleRejection;',
      "createRoot(document.querySelector('#root')).render(<ErrorBoundary />);",
    ].join('\n'),
  });
  try {
    const scan = await runScan(dir);
    assert.equal(scan.blocked, false);
    const finding = scan.findings.find((candidate) => candidate.id === 'P-563');
    assert.ok(finding);
    assert.match(finding.excerpt, /global error handler/);
    assert.match(finding.excerpt, /global unhandledrejection handler/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('P-563 does not accept non-callable assignment expressions as handlers', async () => {
  const dir = tmpProject({
    'src/main.jsx': [
      "import { createRoot } from 'react-dom/client';",
      'class ErrorBoundary {}',
      'Sentry.init({});',
      'window.onerror = status + 1;',
      'window.onunhandledrejection = reason + 1;',
      "createRoot(document.querySelector('#root')).render(<ErrorBoundary />);",
    ].join('\n'),
  });
  try {
    const scan = await runScan(dir);
    assert.equal(scan.blocked, false);
    const finding = scan.findings.find((candidate) => candidate.id === 'P-563');
    assert.ok(finding);
    assert.match(finding.excerpt, /global error handler/);
    assert.match(finding.excerpt, /global unhandledrejection handler/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('P-563 accepts both real global callbacks inside the bootstrap workspace', async () => {
  const dir = tmpProject({
    'package.json': '{"name":"app"}',
    'src/main.jsx': [
      "import { createRoot } from 'react-dom/client';",
      'class ErrorBoundary {}',
      'Sentry.init({});',
      "window.addEventListener('error', (event) => Sentry.captureException(event.error));",
      "globalThis.addEventListener('unhandledrejection', (event) => Sentry.captureException(event.reason));",
      "createRoot(document.querySelector('#root')).render(<ErrorBoundary />);",
    ].join('\n'),
  });
  try {
    const scan = await runScan(dir);
    assert.equal(scan.blocked, false);
    assert.equal(scan.findings.some((finding) => finding.id === 'P-563'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an output directory is audited when it is the requested root', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'scan-output-root-'));
  const out = join(parent, 'out');
  mkdirSync(out);
  writeFileSync(join(out, 'compiled.css'), 'main { width: 500px; }');
  try {
    const result = await runScan(out);
    assert.equal(result.blocked, false);
    assert.ok(result.findings.some((finding) => finding.file === 'compiled.css'));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('runScan with detectSurfaces returns a surfaces map', async () => {
  const dir = tmpProject({ 'form.html': '<form><input type="text"></form>' });
  try {
    const { surfaces } = await runScan(dir, { detectSurfaces: true });
    assert.equal(surfaces.forms, true);
    assert.equal(surfaces['service-worker'], false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
