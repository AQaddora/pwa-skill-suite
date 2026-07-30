// Resolve a probe's target element through the config contract.
//
// A role ("tabbar", "header", "scroller", "shell", "overlayTrigger", "overlayCloseVia") is
// resolved to a CSS selector by, in order: an explicit `config.selectors[role]` override,
// then the `data-pwa-role="role"` annotation convention. If neither matches a live element,
// the role is unresolved — the caller MUST treat that as BLOCKED, never PASS.

export function candidateSelector(role, config) {
  const override = config?.selectors?.[role];
  return override || `[data-pwa-role="${role}"]`;
}

/**
 * @returns {Promise<string|null>} the selector that matched a live element, or null.
 */
export async function resolveRole(page, role, config) {
  const selector = candidateSelector(role, config);
  const count = await page.locator(selector).count();
  return count > 0 ? selector : null;
}
