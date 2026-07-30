// Validates packages/catalog/catalog.json against packages/catalog/schema.json.
//
// There is no ajv (or any JSON-Schema validator) installed or installable
// offline in this environment, so schema conformance is hand-rolled here:
// required keys, enum membership, basic type checks, the `id` regex, and
// `detect` array-of-allowed-values are all checked field-by-field directly
// against the shape declared in schema.json (read at runtime, not
// duplicated as literals), plus a handful of invariants the schema can't
// express: duplicate `id`s across entries, and `rule`/`probe` paths that
// don't resolve to a real file on disk.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const schema = JSON.parse(readFileSync(path.join(__dirname, 'schema.json'), 'utf8'));
const itemSchema = schema.items;

function typeMatches(value, type) {
  if (Array.isArray(type)) {
    return type.some((t) => typeMatches(value, t));
  }
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return true;
  }
}

function validateAgainstPropSchema(label, key, value, propSchema, errors) {
  if (propSchema.type && !typeMatches(value, propSchema.type)) {
    errors.push(
      `${label}: field "${key}" has wrong type (expected ${JSON.stringify(propSchema.type)}, got ${JSON.stringify(value)})`
    );
    return;
  }

  if (propSchema.pattern && typeof value === 'string') {
    const re = new RegExp(propSchema.pattern);
    if (!re.test(value)) {
      errors.push(`${label}: field "${key}" value ${JSON.stringify(value)} does not match pattern ${propSchema.pattern}`);
    }
  }

  if (propSchema.minLength !== undefined && typeof value === 'string') {
    if (value.length < propSchema.minLength) {
      errors.push(`${label}: field "${key}" is shorter than minLength ${propSchema.minLength}`);
    }
  }

  if (propSchema.enum && value !== null && value !== undefined) {
    if (!propSchema.enum.includes(value)) {
      errors.push(`${label}: field "${key}" value ${JSON.stringify(value)} is not one of ${JSON.stringify(propSchema.enum)}`);
    }
  }

  if (Array.isArray(value) && (propSchema.type === 'array' || (Array.isArray(propSchema.type) && propSchema.type.includes('array')))) {
    if (propSchema.minItems !== undefined && value.length < propSchema.minItems) {
      errors.push(`${label}: field "${key}" has fewer than minItems ${propSchema.minItems} (${value.length})`);
    }
    if (propSchema.uniqueItems && new Set(value).size !== value.length) {
      errors.push(`${label}: field "${key}" contains duplicate items`);
    }
    if (propSchema.items && propSchema.items.enum) {
      for (const item of value) {
        if (!propSchema.items.enum.includes(item)) {
          errors.push(
            `${label}: field "${key}" contains invalid value ${JSON.stringify(item)} (allowed: ${propSchema.items.enum.join(', ')})`
          );
        }
      }
    }
  }

  if (propSchema.type === 'object' && propSchema.properties && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const reqKey of propSchema.required || []) {
      if (!(reqKey in value)) {
        errors.push(`${label}: field "${key}.${reqKey}" is missing`);
      }
    }
    for (const [subKey, subSchema] of Object.entries(propSchema.properties)) {
      if (!(subKey in value)) continue;
      validateAgainstPropSchema(label, `${key}.${subKey}`, value[subKey], subSchema, errors);
    }
    if (propSchema.additionalProperties === false) {
      for (const subKey of Object.keys(value)) {
        if (!(subKey in propSchema.properties)) {
          errors.push(`${label}: field "${key}.${subKey}" is not an allowed field`);
        }
      }
    }
  }
}

function entryLabel(entry, index) {
  return entry && typeof entry.id === 'string' ? entry.id : `entry[${index}]`;
}

function validateEntryAgainstSchema(entry, index, errors) {
  const label = entryLabel(entry, index);

  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    errors.push(`${label}: entry is not an object`);
    return;
  }

  for (const key of itemSchema.required) {
    if (!(key in entry)) {
      errors.push(`${label}: missing required field "${key}"`);
    }
  }

  if (itemSchema.additionalProperties === false) {
    for (const key of Object.keys(entry)) {
      if (!(key in itemSchema.properties)) {
        errors.push(`${label}: unknown field "${key}"`);
      }
    }
  }

  for (const [key, propSchema] of Object.entries(itemSchema.properties)) {
    if (!(key in entry)) continue;
    validateAgainstPropSchema(label, key, entry[key], propSchema, errors);
  }
}

function resolvePath(cwd, value) {
  return path.isAbsolute(value) ? value : path.join(cwd, value);
}

function validateFileRefs(entry, index, cwd, errors) {
  const label = entryLabel(entry, index);
  for (const field of ['rule', 'probe']) {
    const value = entry && entry[field];
    if (typeof value === 'string' && value.length > 0) {
      const resolved = resolvePath(cwd, value);
      if (!existsSync(resolved)) {
        errors.push(`${label}: field "${field}" points at a nonexistent file "${value}"`);
      }
    }
  }
}

/**
 * Validate an array of catalog entries against schema.json plus the
 * additional invariants (duplicate IDs, dead rule/probe file paths).
 *
 * @param {unknown[]} entries
 * @param {{ cwd?: string }} [options] - base directory `rule`/`probe`
 *   relative paths are resolved against. Defaults to process.cwd().
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateCatalog(entries, { cwd = process.cwd() } = {}) {
  const errors = [];

  if (!Array.isArray(entries)) {
    return { ok: false, errors: ['catalog root must be an array'] };
  }

  const seenIds = new Map();

  entries.forEach((entry, index) => {
    validateEntryAgainstSchema(entry, index, errors);
    validateFileRefs(entry, index, cwd, errors);

    if (entry && typeof entry.id === 'string') {
      if (seenIds.has(entry.id)) {
        errors.push(`duplicate id "${entry.id}" (entries ${seenIds.get(entry.id)} and ${index})`);
      } else {
        seenIds.set(entry.id, index);
      }
    }
  });

  return { ok: errors.length === 0, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const catalogPath = path.join(__dirname, 'catalog.json');
  const entries = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const { ok, errors } = validateCatalog(entries, { cwd: repoRoot });

  if (ok) {
    console.log(`catalog.json: ${entries.length} entries, all valid.`);
    process.exit(0);
  } else {
    for (const err of errors) {
      console.error(err);
    }
    console.error(`catalog.json: ${errors.length} error(s).`);
    process.exit(1);
  }
}
