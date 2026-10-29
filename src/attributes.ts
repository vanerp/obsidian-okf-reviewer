// Pure frontmatter-attribute mapping — no Obsidian imports (research R1).
// Contracts: specs/004-custom-frontmatter-attributes/contracts/frontmatter-attributes.md

/** A user-configured frontmatter attribute the panel can add with one click. */
export interface AttributeDefinition {
	/** Frontmatter key as written to documents; stored trimmed. Case-sensitive. */
	name: string;
	/** Single-line default, written via `valueFromDefault` (JSON typing). May be empty. */
	defaultValue: string;
}

export function isAttributeDefinition(value: unknown): value is AttributeDefinition {
	return (
		typeof value === 'object' && value !== null && !Array.isArray(value) &&
		typeof (value as Record<string, unknown>)['name'] === 'string' &&
		typeof (value as Record<string, unknown>)['defaultValue'] === 'string'
	);
}

/** Normalize stored definitions: filter malformed entries, trim names. */
export function normalizeDefinitions(value: unknown): AttributeDefinition[] {
	if (!Array.isArray(value)) return [];
	return value.filter(isAttributeDefinition).map((d) => ({
		name: d.name.trim(),
		defaultValue: d.defaultValue,
	}));
}

export type ValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Validate a candidate definition (FR-007): trimmed name required, single
 * line, unique among existing names (case-sensitive — matches the frontmatter
 * convention). Default values are never validated (FR-008).
 */
export function validateDefinition(
	name: string,
	existingNames: readonly unknown[],
): ValidationResult {
	const trimmed = name.trim();
	if (trimmed.length === 0) {
		return { ok: false, reason: 'Attribute name is required.' };
	}
	if (trimmed.includes('\n')) {
		return { ok: false, reason: 'Attribute name must be a single line.' };
	}
	for (const existing of existingNames) {
		if (typeof existing === 'string' && existing.trim() === trimmed) {
			return {
				ok: false,
				reason: 'An attribute with this name already exists.',
			};
		}
	}
	return { ok: true };
}
/**
 * JSON-prefix detection for a single-line default (research R3): only strings
 * that plausibly start a JSON value are parsed; everything else is written
 * literally, so plain-text defaults round-trip byte-identical.
 */
function looksLikeJson(trimmed: string): boolean {
	return /^(?:"|\{|\[|true|false|null|-?\d)/.test(trimmed);
}

/**
 * Typed write of a single-line default (contracts/frontmatter-attributes.md):
 * valid JSON parses into its value (number/boolean/null/list/mapping/quoted
 * string); anything else — including invalid JSON — is written as the raw
 * string. Empty string stays empty (FR-008).
 */
export function valueFromDefault(defaultValue: string): unknown {
	const trimmed = defaultValue.trim();
	if (trimmed.length === 0) return defaultValue;
	if (!looksLikeJson(trimmed)) return defaultValue;
	try {
		return JSON.parse(trimmed) as unknown;
	} catch {
		return defaultValue;
	}
}

/**
 * Fill the frontmatter with every configured attribute that has no key yet
 * (FR-003/FR-004). Case-sensitive key match; existing keys (any value, even
 * null) are never touched; blank-name definitions are skipped so the blank
 * "add attribute" settings row can never reach documents (FR-007).
 * Mutates `fm` in place and returns the keys added.
 */
export function applyAttributes(
	fm: Record<string, unknown>,
	definitions: readonly AttributeDefinition[],
): { added: string[] } {
	const added: string[] = [];
	for (const definition of definitions) {
		const name = definition.name.trim();
		if (name.length === 0) continue;
		if (fm[name] !== undefined) continue;
		fm[name] = valueFromDefault(definition.defaultValue);
		added.push(name);
	}
	return { added };
}

/**
 * Delete one attribute key from the frontmatter, whatever its value.
 * Case-sensitive key match; a missing key is a no-op. Mutates `fm` in place
 * and returns whether a key was removed.
 */
export function removeAttribute(fm: Record<string, unknown>, name: string): boolean {
	if (!(name in fm)) return false;
	delete fm[name];
	return true;
}
