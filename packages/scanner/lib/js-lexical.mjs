// Offset-preserving lexical mask for conservative JavaScript source checks.
// Comments, quoted/template strings, and regex literal bodies become spaces;
// line breaks and executable tokens retain their original offsets.
export function codeMask(source) {
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
        if (escaped) escaped = false;
        else if (current === '\\') escaped = true;
        else if (current === '[') inClass = true;
        else if (current === ']') inClass = false;
        else if (current === '/' && !inClass) {
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

export function firstExecutableMatch(source, pattern) {
  const mask = codeMask(source);
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  for (const match of source.matchAll(matcher)) {
    if (mask[match.index] !== ' ') return match;
  }
  return null;
}
