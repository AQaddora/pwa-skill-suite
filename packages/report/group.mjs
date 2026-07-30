// Fix-level aggregation: group findings by catalog id (root cause). One codemod resolves
// every instance of a rule; emitting one ticket per finding buries the real P0s.
export function groupByFix(findings, catalog) {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const groups = new Map();
  for (const f of findings) {
    if (!groups.has(f.id)) {
      groups.set(f.id, {
        id: f.id,
        catalogEntry: byId.get(f.id) || null,
        count: 0,
        instances: [],
      });
    }
    const g = groups.get(f.id);
    g.count += 1;
    g.instances.push({ file: f.file, line: f.line, excerpt: f.excerpt });
  }
  return [...groups.values()];
}
