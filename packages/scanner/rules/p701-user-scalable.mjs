// P-701 · pinch zoom is disabled in viewport configuration, CSS, or gesture code.
// A hard accessibility FAIL, never a suggestion — the report layer surfaces it as FAIL.
import { extractDeclarations } from '../lib/css.mjs';
import { lineColAt, matches } from '../lib/loc.mjs';

export const ids = ['P-701'];

const MARKUP_EXT = new Set(['.html', '.htm', '.vue', '.svelte', '.jsx', '.tsx']);
const SCRIPT_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte']);
const CSS_EXT = new Set(['.css', '.scss', '.sass', '.less']);

export function appliesTo({ ext }) {
  return MARKUP_EXT.has(ext) || SCRIPT_EXT.has(ext) || CSS_EXT.has(ext);
}

// Vue and Svelte single-file components are partially inspected for markup and
// JavaScript, but their embedded/preprocessed style blocks are not parsed as CSS.
// A clean result from one of these containers therefore cannot establish PASS.
export function coverageComplete({ ext }) {
  return ext !== '.vue' && ext !== '.svelte';
}

const VIEWPORT_META = /<meta[^>]*name=["']viewport["'][^>]*>/gi;
const USER_SCALABLE_OFF = /user-scalable\s*=\s*(?:no|0)\b/i;
const MAXIMUM_SCALE = /maximum-scale\s*=\s*([0-9]*\.?[0-9]+)/i;
const NEXT_LOCK = /\b(userScalable\s*:\s*false|maximumScale\s*:\s*["']?(?:0(?:\.\d+)?|1(?:\.0+)?)["']?(?![\d.]))/g;
const LISTENER_START = /\b(?:document|window)\s*\.\s*addEventListener\s*\(\s*(["'])(gesturestart|gesturechange|touchmove)\1\s*,/g;
const PREVENT_DEFAULT = /\.\s*preventDefault\s*\(/;
const MULTITOUCH_GUARD = /\b(?:touches|targetTouches)\s*(?:\?\.|\.)\s*length\s*(?:>\s*1\b|>=\s*2\b)/;

function finding(file, contents, index, excerpt, confidence = 'high') {
  const { line, column } = lineColAt(contents, index);
  return {
    id: 'P-701',
    file,
    line,
    column,
    excerpt: String(excerpt).trim().replace(/\s+/g, ' ').slice(0, 200),
    severity: 'P0',
    confidence,
  };
}

function isLockedViewportMeta(tag) {
  if (USER_SCALABLE_OFF.test(tag)) return true;
  const maximum = tag.match(MAXIMUM_SCALE);
  return maximum ? Number(maximum[1]) <= 1 : false;
}

// Keep source offsets stable while hiding text that cannot be executable code. A
// full JavaScript parser would make the scanner framework-specific; this small
// lexer is intentionally conservative and treats template literals and regular
// expression bodies as opaque too.
function codeMask(source) {
  // split('') retains JavaScript's UTF-16 offsets; code-point iteration would
  // shift every finding after an emoji or another astral character.
  const chars = source.split('');
  const mask = source.split('');
  const regexPrefixKeywords = new Set([
    'await',
    'case',
    'delete',
    'do',
    'else',
    'in',
    'instanceof',
    'new',
    'of',
    'return',
    'throw',
    'typeof',
    'void',
    'yield',
  ]);
  let canStartRegex = true;

  const hide = (start, end) => {
    for (let index = start; index < end; index++) {
      if (mask[index] !== '\n' && mask[index] !== '\r') mask[index] = ' ';
    }
  };

  for (let index = 0; index < chars.length; ) {
    const char = chars[index];
    const next = chars[index + 1];

    if (/\s/.test(char)) {
      index++;
      continue;
    }

    if (char === '/' && next === '/') {
      const start = index;
      index += 2;
      while (index < chars.length && chars[index] !== '\n') index++;
      hide(start, index);
      continue;
    }
    if (char === '/' && next === '*') {
      const start = index;
      index += 2;
      while (index < chars.length && !(chars[index] === '*' && chars[index + 1] === '/')) {
        index++;
      }
      index = Math.min(chars.length, index + 2);
      hide(start, index);
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      const start = index;
      const quote = char;
      index++;
      let escaped = false;
      while (index < chars.length) {
        const current = chars[index++];
        if (escaped) escaped = false;
        else if (current === '\\') escaped = true;
        else if (current === quote) break;
      }
      hide(start, index);
      canStartRegex = false;
      continue;
    }

    if (char === '/' && canStartRegex) {
      const start = index++;
      let escaped = false;
      let inClass = false;
      while (index < chars.length) {
        const current = chars[index++];
        if (escaped) {
          escaped = false;
        } else if (current === '\\') {
          escaped = true;
        } else if (current === '[') {
          inClass = true;
        } else if (current === ']') {
          inClass = false;
        } else if (current === '/' && !inClass) {
          while (/[A-Za-z]/.test(chars[index] || '')) index++;
          break;
        } else if (current === '\n' || current === '\r') {
          break;
        }
      }
      hide(start, index);
      canStartRegex = false;
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      const start = index++;
      while (/[\w$]/.test(chars[index] || '')) index++;
      canStartRegex = regexPrefixKeywords.has(source.slice(start, index));
      continue;
    }
    if (/[0-9]/.test(char)) {
      index++;
      while (/[\w.]/.test(chars[index] || '')) index++;
      canStartRegex = false;
      continue;
    }

    if (char === ')' || char === ']') canStartRegex = false;
    else if (char === '.' || char === '?') canStartRegex = char === '?';
    else if (char !== '}') canStartRegex = true;
    index++;
  }

  return mask.join('');
}

function findBalancedEnd(mask, openIndex, open = '(', close = ')') {
  let depth = 0;
  for (let index = openIndex; index < mask.length; index++) {
    if (mask[index] === open) depth++;
    else if (mask[index] === close && --depth === 0) return index;
  }
  return -1;
}

function splitTopLevelArgs(source, mask = codeMask(source)) {
  const parts = [];
  let start = 0;
  const stack = [];

  for (let index = 0; index < mask.length; index++) {
    const char = mask[index];
    if (char === '(' || char === '[' || char === '{') stack.push(char);
    else if (char === ')' || char === ']' || char === '}') stack.pop();
    else if (char === ',' && stack.length === 0) {
      parts.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(source.slice(start).trim());
  return parts;
}

function identifierPattern(identifier) {
  return identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildScopes(mask) {
  const root = { start: 0, end: mask.length, parent: null, depth: 0 };
  const scopes = [root];
  const stack = [root];
  for (let index = 0; index < mask.length; index++) {
    if (mask[index] === '{') {
      const parent = stack.at(-1);
      const scope = { start: index, end: mask.length, parent, depth: parent.depth + 1 };
      scopes.push(scope);
      stack.push(scope);
    } else if (mask[index] === '}' && stack.length > 1) {
      stack.pop().end = index;
    }
  }
  return scopes;
}

function scopeAt(scopes, index) {
  let result = scopes[0];
  for (const scope of scopes) {
    if (scope.start <= index && index <= scope.end && scope.depth >= result.depth) result = scope;
  }
  return result;
}

function findAssignment(mask, start) {
  const stack = [];
  for (let index = start; index < mask.length; index++) {
    const char = mask[index];
    const next = mask[index + 1];
    if (char === '(' || char === '[' || char === '{' || char === '<') stack.push(char);
    else if (char === ')' || char === ']' || char === '}' || char === '>') stack.pop();
    else if (stack.length === 0 && (char === ';' || char === '\n')) return -1;
    else if (
      stack.length === 0 &&
      char === '=' &&
      next !== '>' &&
      !/[!<>=]/.test(mask[index - 1] || '')
    ) {
      return index;
    }
  }
  return -1;
}

function skipSpace(mask, index) {
  while (/\s/.test(mask[index] || '')) index++;
  return index;
}

function findTopLevelArrow(mask, start) {
  const stack = [];
  for (let index = start; index < mask.length - 1; index++) {
    const char = mask[index];
    if (char === '(' || char === '[' || char === '{') stack.push(char);
    else if (char === ')' || char === ']' || char === '}') stack.pop();
    else if (stack.length === 0 && char === '=' && mask[index + 1] === '>') return index;
    else if (stack.length === 0 && char === ';') return -1;
  }
  return -1;
}

function expressionEnd(mask, start) {
  const arrow = findTopLevelArrow(mask, start);
  if (arrow !== -1) {
    const bodyStart = skipSpace(mask, arrow + 2);
    if (mask[bodyStart] === '{') return findBalancedEnd(mask, bodyStart, '{', '}');
    if (mask[bodyStart] === '(') return findBalancedEnd(mask, bodyStart, '(', ')');
    start = bodyStart;
  } else if (/^(?:async\s+)?function\b/.test(mask.slice(start))) {
    const bodyStart = mask.indexOf('{', start);
    if (bodyStart !== -1) return findBalancedEnd(mask, bodyStart, '{', '}');
  }

  const stack = [];
  for (let index = start; index < mask.length; index++) {
    const char = mask[index];
    if (char === '(' || char === '[' || char === '{') stack.push(char);
    else if (char === ')' || char === ']' || char === '}') {
      if (stack.length === 0) return index - 1;
      stack.pop();
    } else if (stack.length === 0 && (char === ';' || char === '\n' || char === ',')) {
      return index - 1;
    }
  }
  return mask.length - 1;
}

function isFunctionDeclaration(mask, functionIndex) {
  let index = functionIndex - 1;
  while (/\s/.test(mask[index] || '')) index--;
  if (index < 0 || /[;{}]/.test(mask[index])) return true;

  const preceding = mask.slice(0, functionIndex).match(/([A-Za-z_$][\w$]*)\s*$/)?.[1];
  if (preceding === 'export' || preceding === 'default') return true;
  if (preceding !== 'async') return false;

  const asyncStart = mask.lastIndexOf('async', functionIndex);
  index = asyncStart - 1;
  while (/\s/.test(mask[index] || '')) index--;
  if (index < 0 || /[;{}]/.test(mask[index])) return true;
  return mask.slice(0, asyncStart).match(/([A-Za-z_$][\w$]*)\s*$/)?.[1] === 'export';
}

function bindingCandidates(mask, scopes, identifier, listenerIndex) {
  const escaped = identifierPattern(identifier);
  const candidates = [];
  const functions = new RegExp(`\\bfunction\\s+${escaped}\\s*\\(`, 'g');
  for (const match of mask.matchAll(functions)) {
    if (!isFunctionDeclaration(mask, match.index)) continue;
    const bodyStart = mask.indexOf('{', match.index + match[0].length);
    if (bodyStart === -1) continue;
    const bodyEnd = findBalancedEnd(mask, bodyStart, '{', '}');
    if (bodyEnd === -1) continue;
    candidates.push({
      scope: scopeAt(scopes, match.index),
      start: match.index,
      end: bodyEnd,
      available: true,
    });
  }

  const variables = new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\b`, 'g');
  for (const match of mask.matchAll(variables)) {
    const equals = findAssignment(mask, match.index + match[0].length);
    if (equals === -1) continue;
    const start = skipSpace(mask, equals + 1);
    const isFunction =
      /^(?:async\s+)?function\b/.test(mask.slice(start)) || findTopLevelArrow(mask, start) !== -1;
    const end = isFunction ? expressionEnd(mask, start) : start;
    if (end < start) continue;
    candidates.push({
      scope: scopeAt(scopes, match.index),
      start: match.index,
      end,
      available: isFunction && match.index < listenerIndex,
    });
  }
  return candidates;
}

function scopeMayShadow(mask, scope, identifier) {
  if (!scope.parent) return false;
  const escaped = identifierPattern(identifier);
  // Function/catch parameters sit immediately before the brace that creates
  // their lexical body. If they contain the identifier, do not jump to an
  // outer declaration whose behavior may be completely different.
  const preamble = mask.slice(Math.max(scope.parent.start, scope.start - 500), scope.start);
  const close = preamble.lastIndexOf(')');
  const open = close === -1 ? -1 : preamble.lastIndexOf('(', close);
  if (open !== -1 && new RegExp(`\\b${escaped}\\b`).test(preamble.slice(open + 1, close))) {
    return true;
  }
  if (new RegExp(`\\b${escaped}\\s*=>\\s*$`).test(preamble)) return true;
  return false;
}

function resolveNamedCallback(contents, mask, scopes, expression, listenerIndex) {
  const identifier = expression.trim().match(/^([A-Za-z_$][\w$]*)$/)?.[1];
  if (!identifier) return expression;

  const candidates = bindingCandidates(mask, scopes, identifier, listenerIndex);
  for (let scope = scopeAt(scopes, listenerIndex); scope; scope = scope.parent) {
    const local = candidates.filter((candidate) => candidate.scope === scope);
    if (local.length === 1) {
      const [candidate] = local;
      if (!candidate.available) return expression;
      return contents.slice(candidate.start, candidate.end + 1);
    }
    if (local.length > 1 || scopeMayShadow(mask, scope, identifier)) return expression;
  }
  return expression;
}

function nextViewportBlocks(contents, mask) {
  const blocks = [];
  const variableExport = /\bexport\s+(?:const|let|var)\s+(viewport|generateViewport)\b/g;
  for (const match of mask.matchAll(variableExport)) {
    const equals = findAssignment(mask, match.index + match[0].length);
    if (equals === -1) continue;
    const start = skipSpace(mask, equals + 1);
    let end;
    if (match[1] === 'viewport' && mask[start] === '{') {
      end = findBalancedEnd(mask, start, '{', '}');
    } else {
      end = expressionEnd(mask, start);
    }
    if (end >= start) blocks.push({ start, end });
  }

  const functionExport = /\bexport\s+(?:async\s+)?function\s+generateViewport\b[^{};]*\{/g;
  for (const match of mask.matchAll(functionExport)) {
    const open = match.index + match[0].lastIndexOf('{');
    const close = findBalancedEnd(mask, open, '{', '}');
    if (close !== -1) blocks.push({ start: open, end: close });
  }
  return blocks;
}

function isRootSelector(selector) {
  return selector
    .split(',')
    .map((part) => part.trim())
    .some((part) => {
      if (part === '*') return true;
      const compounds = part.split(/\s+|>/).filter(Boolean);
      const target = compounds.at(-1) || '';
      return /^(?:html|body|:root)(?:$|[.#:[\]])/.test(target);
    });
}

function isRestrictiveTouchAction(value) {
  const normalized = value.toLowerCase().replace(/!important\s*$/, '').trim();
  if (normalized === 'none') return true;
  if (/\bpinch-zoom\b/.test(normalized) || normalized === 'auto' || normalized === 'manipulation') {
    return false;
  }
  return /\bpan-(?:x|y|left|right|up|down)\b/.test(normalized);
}

function checkViewportMeta(file, contents, ext) {
  if (!MARKUP_EXT.has(ext)) return [];
  const out = [];
  const mask = SCRIPT_EXT.has(ext) ? codeMask(contents) : null;
  for (const match of matches(contents, VIEWPORT_META)) {
    if (mask && mask[match.index] === ' ') continue;
    if (isLockedViewportMeta(match.match[0])) {
      out.push(finding(file, contents, match.index, match.match[0]));
    }
  }
  return out;
}

function checkNextViewport(file, contents, ext) {
  if (!SCRIPT_EXT.has(ext)) return [];
  const out = [];
  const seen = new Set();
  const mask = codeMask(contents);
  for (const block of nextViewportBlocks(contents, mask)) {
    const blockText = contents.slice(block.start, block.end + 1);
    for (const match of blockText.matchAll(NEXT_LOCK)) {
      const index = block.start + match.index;
      if (mask[index] === ' ') continue;
      if (seen.has(index)) continue;
      seen.add(index);
      out.push(finding(file, contents, index, match[0]));
    }
  }
  return out;
}

function checkGestureListeners(file, contents, ext) {
  if (!SCRIPT_EXT.has(ext)) return [];
  const out = [];
  const mask = codeMask(contents);
  const scopes = buildScopes(mask);
  for (const match of contents.matchAll(LISTENER_START)) {
    if (mask[match.index] === ' ') continue;
    const open = mask.indexOf('(', match.index);
    const close = findBalancedEnd(mask, open);
    if (close === -1) continue;
    const argsText = contents.slice(open + 1, close);
    const args = splitTopLevelArgs(argsText, mask.slice(open + 1, close));
    const callback = resolveNamedCallback(contents, mask, scopes, args[1] || '', match.index);
    const callbackCode = codeMask(callback);
    const eventName = match[2];
    const blocksZoom =
      PREVENT_DEFAULT.test(callbackCode) &&
      (eventName !== 'touchmove' || MULTITOUCH_GUARD.test(callbackCode));
    if (blocksZoom) {
      out.push(finding(file, contents, match.index, contents.slice(match.index, close + 1)));
    }
  }
  return out;
}

function checkRootTouchAction(file, contents, ext) {
  if (!CSS_EXT.has(ext)) return [];
  const out = [];
  for (const declaration of extractDeclarations(contents)) {
    if (
      declaration.property === 'touch-action' &&
      isRootSelector(declaration.selector) &&
      isRestrictiveTouchAction(declaration.value)
    ) {
      const index = contents.split('\n', declaration.line - 1).reduce((sum, line) => sum + line.length + 1, 0);
      out.push(
        finding(
          file,
          contents,
          index,
          `${declaration.selector} { touch-action: ${declaration.value} }`,
        ),
      );
    }
  }
  return out;
}

export function check({ file, contents, ext }) {
  return [
    ...checkViewportMeta(file, contents, ext),
    ...checkNextViewport(file, contents, ext),
    ...checkGestureListeners(file, contents, ext),
    ...checkRootTouchAction(file, contents, ext),
  ];
}
