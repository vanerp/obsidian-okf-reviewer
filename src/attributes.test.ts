import { describe, expect, it } from 'vitest';
import {
	applyAttributes,
	normalizeDefinitions,
	removeAttribute,
	validateDefinition,
	valueFromDefault,
	type AttributeDefinition,
} from './attributes';

describe('validateDefinition', () => {
	it('accepts a valid trimmed name', () => {
		expect(validateDefinition('reviewer_team', [])).toEqual({ ok: true });
	});

	it('trims and accepts a padded name', () => {
		expect(validateDefinition('  reviewer_team  ', [])).toEqual({ ok: true });
	});

	it('rejects an empty name', () => {
		const result = validateDefinition('', []);
		expect(result).toMatchObject({ ok: false });
	});

	it('rejects a whitespace-only name', () => {
		const result = validateDefinition('   ', []);
		expect(result).toMatchObject({ ok: false });
	});

	it('rejects a name with a newline', () => {
		const result = validateDefinition('bad\nname', []);
		expect(result).toMatchObject({ ok: false });
	});

	it('rejects an exact duplicate', () => {
		const result = validateDefinition('reviewer_team', ['reviewer_team']);
		expect(result).toMatchObject({ ok: false });
	});

	it('accepts a name differing only in case — matching is case-sensitive', () => {
		// 'Reviewer_team' and 'reviewer_team' are distinct keys under the
		// case-sensitive frontmatter convention (spec: case-sensitive matching).
		expect(validateDefinition('Reviewer_team', ['reviewer_team'])).toEqual({ ok: true });
	});

	it('ignores non-string entries when checking uniqueness', () => {
		expect(validateDefinition('ok', [undefined as never, 'OK'])).toEqual({ ok: true });
	});
});

describe('normalizeDefinitions', () => {
	const def: AttributeDefinition = { name: ' team ', defaultValue: 'x' };

	it('trims names and keeps values verbatim', () => {
		expect(normalizeDefinitions([def])).toEqual([
			{ name: 'team', defaultValue: 'x' },
		]);
	});

	it('drops malformed entries', () => {
		expect(
			normalizeDefinitions([def, { name: 1 }, null, { name: 'ok' }, 'junk']),
		).toEqual([{ name: 'team', defaultValue: 'x' }]);
	});

	it('returns an empty list for non-array input', () => {
		expect(normalizeDefinitions(undefined)).toEqual([]);
		expect(normalizeDefinitions('junk')).toEqual([]);
	});
});

describe('valueFromDefault', () => {
	it('writes an empty string as an empty value', () => {
		expect(valueFromDefault('')).toBe('');
	});

	it('passes plain text through as-is', () => {
		expect(valueFromDefault('draft')).toBe('draft');
		expect(valueFromDefault('2026-10-29')).toBe('2026-10-29');
		expect(valueFromDefault('hello world')).toBe('hello world');
	});

	// `valueFromDefault` writes the raw string, not a trimmed copy — spaces
	// are part of the user's value.
	it('preserves leading/trailing whitespace in plain text', () => {
		expect(valueFromDefault(' padded ')).toBe(' padded ');
	});

	it('parses JSON numbers', () => {
		expect(valueFromDefault('3')).toBe(3);
		expect(valueFromDefault('-2.5')).toBe(-2.5);
	});

	it('parses JSON booleans', () => {
		expect(valueFromDefault('true')).toBe(true);
		expect(valueFromDefault('false')).toBe(false);
	});

	it('parses JSON null', () => {
		expect(valueFromDefault('null')).toBe(null);
	});

	it('parses JSON lists and mappings', () => {
		expect(valueFromDefault('[1, 2]')).toEqual([1, 2]);
		expect(valueFromDefault('{"k": "v"}')).toEqual({ k: 'v' });
		expect(valueFromDefault('[]')).toEqual([]);
		expect(valueFromDefault('{}')).toEqual({});
	});

	it('keeps invalid JSON as a literal string', () => {
		expect(valueFromDefault('[1, 2')).toBe('[1, 2');
		expect(valueFromDefault('{"k": ')).toBe('{"k": ');
	});

	it('parses a quoted JSON string into its content', () => {
		expect(valueFromDefault('"3"')).toBe('3');
	});

	it('does not parse strings that merely contain JSON', () => {
		expect(valueFromDefault('see [1, 2] below')).toBe('see [1, 2] below');
	});
});

describe('applyAttributes', () => {
	const team: AttributeDefinition = { name: 'reviewer_team', defaultValue: 'unassigned' };
	const tags: AttributeDefinition = { name: 'tags_extra', defaultValue: '["okf"]' };
	const priority: AttributeDefinition = { name: 'priority', defaultValue: '' };
	const defs: AttributeDefinition[] = [team, tags, priority];

	it('adds every missing attribute with its typed default', () => {
		const fm: Record<string, unknown> = { type: 'Concept' };
		applyAttributes(fm, defs);
		expect(fm).toEqual({
			type: 'Concept',
			reviewer_team: 'unassigned',
			tags_extra: ['okf'],
			priority: '',
		});
	});

	it('matches keys case-sensitively — a case-variant key does not block the add', () => {
		const fm: Record<string, unknown> = { REVIEWER_TEAM: 'other-case' };
		const result = applyAttributes(fm, [team]);
		expect(fm).toEqual({
			REVIEWER_TEAM: 'other-case',
			reviewer_team: 'unassigned',
		});
		expect(result.added).toEqual(['reviewer_team']);
	});

	it('never overwrites existing keys with any value', () => {
		const fm: Record<string, unknown> = {
			reviewer_team: 0,
			tags_extra: null,
			priority: 'high',
		};
		applyAttributes(fm, defs);
		expect(fm).toEqual({
			reviewer_team: 0,
			tags_extra: null,
			priority: 'high',
		});
	});

	it('is idempotent — a second pass mutates nothing', () => {
		const fm: Record<string, unknown> = {};
		applyAttributes(fm, defs);
		const afterFirst = { ...fm };
		const result = applyAttributes(fm, defs);
		expect(fm).toEqual(afterFirst);
		expect(result.added).toEqual([]);
	});

	it('reports which keys were added', () => {
		const result = applyAttributes({ reviewer_team: 'custom' }, defs);
		expect(result.added).toEqual(['tags_extra', 'priority']);
	});

	it('ignores definitions with a blank trimmed name', () => {
		// Blank names cannot be validated definitions, but arrive via the
		// blank "add attribute" row — they must never reach documents.
		const fm: Record<string, unknown> = {};
		const result = applyAttributes(fm, [
			{ name: '', defaultValue: 'x' },
			team,
		]);
		expect(fm).toEqual({ reviewer_team: 'unassigned' });
		expect(result.added).toEqual(['reviewer_team']);
	});
});

describe('removeAttribute', () => {
	it('deletes the key whatever its value, leaving other keys untouched', () => {
		const fm: Record<string, unknown> = { type: 'Concept', priority: null, team: 'a' };
		expect(removeAttribute(fm, 'priority')).toBe(true);
		expect(fm).toEqual({ type: 'Concept', team: 'a' });
	});

	it('is a case-sensitive no-op when the key is absent', () => {
		const fm: Record<string, unknown> = { Priority: 'high' };
		expect(removeAttribute(fm, 'priority')).toBe(false);
		expect(fm).toEqual({ Priority: 'high' });
	});
});
