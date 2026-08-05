// P-207 — Overlay stacking and mobile geometry. Exercise declarative overlay journeys at
// short portrait and landscape sizes, including optional RTL and nested trigger sequences.
// The visible dialog must stay inside the visual viewport, own any required scrolling, keep
// a reachable close control, and paint above persistent navigation.
import { installUtils } from '../lib/inpage.mjs';
import { resolveRole } from '../lib/roles.mjs';
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

const DEFAULT_OVERLAY = '[role="dialog"], [data-pwa-role="overlay"]';
const DECLARED_OVERLAY = '[data-pwa-role="overlay"]';
const DECLARED_TRIGGER = '[data-pwa-role="overlayTrigger"]';
const DEFAULT_CLOSE = '[data-pwa-role="overlayCloseVia"]';

function overlayCells(harness) {
  return harness.engines.flatMap((engine) => [
    { engine, width: 320, height: 568, orientation: 'portrait' },
    { engine, width: 390, height: 844, orientation: 'portrait' },
    { engine, width: 568, height: 320, orientation: 'landscape' },
    { engine, width: 844, height: 390, orientation: 'landscape' },
  ]);
}

function configuredScenarios(config) {
  const scenarios = config.scenarios?.overlays ?? [];
  if (scenarios.length > 0) return scenarios;
  return [];
}

function legacyScenario({ route, overlay = null }) {
  return {
    name: 'declared overlay',
    route,
    triggers: [],
    overlay,
    close: null,
    direction: 'document',
  };
}

async function resolveScenarios(harness, cells) {
  const configured = configuredScenarios(harness.config);
  if (configured.length > 0) return configured;

  // Before declarative journeys existed, repositories identified their one overlay with
  // selectors.overlay/selectors.overlayTrigger. Keep that contract useful without turning
  // every repository into a failed mandatory-overlay check.
  if (harness.config.selectors?.overlay || harness.config.selectors?.overlayTrigger) {
    return [legacyScenario({ route: harness.config.routes[0] || '/' })];
  }

  // A data-pwa-role surface or trigger annotation is also an explicit declaration. A trigger
  // must count on its own because many frameworks do not mount the overlay DOM until it is
  // clicked. Do not infer a journey from an arbitrary dialog or button: a repository with no
  // suite annotation remains simply not applicable.
  const cell = cells[0];
  if (!cell) return [];
  for (const route of harness.config.routes) {
    const { page, close, ok } = await harness.openPage({ ...cell, route });
    try {
      if (ok) {
        const hasOverlay = (await page.locator(DECLARED_OVERLAY).count()) > 0;
        const hasTrigger = (await page.locator(DECLARED_TRIGGER).count()) > 0;
        if (hasOverlay || hasTrigger) {
          return [legacyScenario({ route, overlay: hasOverlay ? DECLARED_OVERLAY : null })];
        }
      }
    } finally {
      await close();
    }
  }
  return [];
}

async function lastVisible(locator) {
  for (let index = (await locator.count()) - 1; index >= 0; index -= 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible()) return candidate;
  }
  return null;
}

async function openOverlay(page, scenario, config) {
  let triggers = scenario.triggers;
  if (triggers.length === 0) {
    const roleTrigger = await resolveRole(page, 'overlayTrigger', config);
    if (!roleTrigger) return { error: 'no overlayTrigger role or configured trigger' };
    triggers = [roleTrigger];
  }

  for (const selector of triggers) {
    const trigger = await lastVisible(page.locator(selector));
    if (!trigger) return { error: `trigger did not resolve visibly: ${selector}` };
    await trigger.click();
  }

  const overlaySelector = scenario.overlay || config.selectors?.overlay || DEFAULT_OVERLAY;
  const overlay = await lastVisible(page.locator(overlaySelector));
  if (!overlay) return { error: `trigger sequence did not reveal a visible overlay: ${overlaySelector}` };
  return { overlay, overlaySelector };
}

async function resolveClose(overlay, scenario) {
  if (scenario.close) return lastVisible(overlay.locator(scenario.close));
  const scoped = await lastVisible(overlay.locator(DEFAULT_CLOSE));
  if (scoped) return scoped;
  return lastVisible(
    overlay.locator(
      'button[aria-label*="close" i], button[title*="close" i], button[aria-label*="dismiss" i], button[title*="dismiss" i], button[aria-label*="إغلاق"], button[title*="إغلاق"]',
    ),
  );
}

export default {
  ids: ['P-207'],
  name: 'Overlay clipped, unscrollable, unreachable, or behind navigation',
  async run(harness) {
    const findings = [];
    let resolved = true;
    let exercised = 0;
    const cells = overlayCells(harness);
    const scenarios = await resolveScenarios(harness, cells);

    if (scenarios.length === 0) {
      return {
        outcome: 'N/A',
        findings: [],
        detail: 'no overlay surface or overlay journey is declared for the configured routes',
      };
    }

    for (const scenario of scenarios) {
      for (const cell of cells) {
        const route = scenario.route || harness.config.routes[0] || '/';
        const { page, close, ok } = await harness.openPage({
          ...cell,
          route,
          rtl: scenario.direction === 'rtl',
        });
        try {
          if (!ok) {
            resolved = false;
            continue;
          }
          await installUtils(page);
          if (scenario.direction === 'ltr') {
            await page.evaluate(() => document.documentElement.setAttribute('dir', 'ltr'));
          }

          const opened = await openOverlay(page, scenario, harness.config);
          if (opened.error) {
            resolved = false;
            continue;
          }
          exercised += 1;

          const { overlay } = opened;
          const geometry = await overlay.evaluate((element) => {
            const viewport = window.visualViewport;
            const viewportLeft = viewport?.offsetLeft ?? 0;
            const viewportTop = viewport?.offsetTop ?? 0;
            const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
            const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
            const rect = element.getBoundingClientRect();
            const descendants = [element, ...element.querySelectorAll('*')];
            const overflowing = descendants.some(
              (node) => node.scrollHeight > node.clientHeight + 1,
            );
            const scrollOwner = descendants.find((node) => {
              const style = getComputedStyle(node);
              return (
                node.scrollHeight > node.clientHeight + 1 &&
                /^(auto|scroll)$/.test(style.overflowY)
              );
            });
            return {
              selector: window.__pwa.cssPath(element),
              rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
              viewport: {
                left: viewportLeft,
                right: viewportRight,
                top: viewportTop,
                bottom: viewportBottom,
              },
              horizontalOverflow: element.scrollWidth > element.clientWidth + 1,
              overflowing,
              scrollOwnerSelector: scrollOwner ? window.__pwa.cssPath(scrollOwner) : null,
            };
          });

          const tolerance = 1;
          const outside =
            geometry.rect.left < geometry.viewport.left - tolerance ||
            geometry.rect.right > geometry.viewport.right + tolerance ||
            geometry.rect.top < geometry.viewport.top - tolerance ||
            geometry.rect.bottom > geometry.viewport.bottom + tolerance;
          if (outside) {
            findings.push(
              makeFinding('P-207', {
                context: `${route} · ${scenario.name}`,
                selector: geometry.selector,
                detail: 'visible overlay extends outside the visual viewport',
                cell,
              }),
            );
          }
          if (geometry.horizontalOverflow) {
            findings.push(
              makeFinding('P-207', {
                context: `${route} · ${scenario.name}`,
                selector: geometry.selector,
                detail: 'overlay has horizontal overflow',
                cell,
              }),
            );
          }
          if (geometry.overflowing && !geometry.scrollOwnerSelector) {
            findings.push(
              makeFinding('P-207', {
                context: `${route} · ${scenario.name}`,
                selector: geometry.selector,
                detail: 'overlay content overflows vertically without an internal scroll owner',
                cell,
              }),
            );
          } else if (geometry.scrollOwnerSelector) {
            const scrollOwnerWorks = await page.evaluate((selector) => {
              const owner = document.querySelector(selector);
              if (!owner) return false;
              const before = owner.scrollTop;
              owner.scrollTop = Math.min(owner.scrollHeight, before + 8);
              const moved = owner.scrollTop > before;
              owner.scrollTop = before;
              return moved;
            }, geometry.scrollOwnerSelector);
            if (!scrollOwnerWorks) {
              findings.push(
                makeFinding('P-207', {
                  context: `${route} · ${scenario.name}`,
                  selector: geometry.scrollOwnerSelector,
                  detail: 'declared internal scroll owner cannot actually scroll',
                  cell,
                }),
              );
            }
          }

          const closeControl = await resolveClose(overlay, scenario);
          if (!closeControl) {
            findings.push(
              makeFinding('P-207', {
                context: `${route} · ${scenario.name}`,
                selector: geometry.selector,
                detail: 'overlay has no visible close control',
                cell,
              }),
            );
          } else {
            const closeBox = await closeControl.boundingBox();
            if (
              closeBox == null ||
              closeBox.x < geometry.viewport.left - tolerance ||
              closeBox.y < geometry.viewport.top - tolerance ||
              closeBox.x + closeBox.width > geometry.viewport.right + tolerance ||
              closeBox.y + closeBox.height > geometry.viewport.bottom + tolerance
            ) {
              findings.push(
                makeFinding('P-207', {
                  context: `${route} · ${scenario.name}`,
                  selector: geometry.selector,
                  detail: 'overlay close control is outside the visual viewport',
                  cell,
                }),
              );
            } else {
              const closeIsHittable = await closeControl.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                const top = document.elementFromPoint(x, y);
                return top != null && (top === element || element.contains(top));
              });
              if (!closeIsHittable) {
                findings.push(
                  makeFinding('P-207', {
                    context: `${route} · ${scenario.name}`,
                    selector: geometry.selector,
                    detail: 'overlay close control is covered and cannot be hit at its center',
                    cell,
                  }),
                );
              }
            }
          }

          const barSelector = await resolveRole(page, 'tabbar', harness.config);
          if (barSelector) {
            const navigationIsCovered = await page.evaluate(
              ({ barSelector }) => {
                const bar = document.querySelector(barSelector);
                if (!bar) return false;
                const barRect = bar.getBoundingClientRect();
                const x = Math.round(barRect.left + barRect.width / 2);
                const y = Math.round(barRect.top + barRect.height / 2);
                const top = document.elementFromPoint(x, y);
                return top != null && top !== bar && !bar.contains(top);
              },
              { barSelector },
            );
            if (!navigationIsCovered) {
              findings.push(
                makeFinding('P-207', {
                  context: `${route} · ${scenario.name}`,
                  selector: geometry.selector,
                  detail: 'persistent navigation paints over the open overlay',
                  cell,
                }),
              );
            }
          }
        } finally {
          await close();
        }
      }
    }

    return aggregate({
      findings,
      resolved: resolved && exercised === scenarios.length * cells.length,
      targetIsLocal: harness.config.targetIsLocal,
      detail:
        resolved && exercised > 0
          ? `checked ${scenarios.length} overlay journey(s) across ${cells.length} short portrait/landscape engine cell(s)`
          : 'one or more overlay journeys could not be opened; configure scenarios.overlays or data-pwa-role annotations',
    });
  },
};
