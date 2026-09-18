// Pure file-explorer appearance logic — no Obsidian imports, so it's
// unit-testable independent of the DOM/plugin glue in explorer.ts.

import type { OkfStatus, Origin, Tier } from './okf';

export interface ExplorerDot {
	modifier: string;
	label: string;
}

export interface ExplorerAppearance {
	/** Text color for the entry: authorship (`generated.by`), or null if unknown. */
	textModifier: Origin | null;
	/** Single trailing dot: verification status, or null if unverified and not stale. */
	dot: ExplorerDot | null;
	/** Label suffix for draft status, or null. */
	statusSuffix: '[DRAFT]' | null;
	/** Strikethrough style on the label for deprecated notes. */
	statusStrike: boolean;
}

const TIER_LABEL: Record<Tier, string> = {
	human: 'Human-reviewed',
	machine: 'Machine-confirmed',
};

const STALE_LABEL = 'Due for review';

const DRAFT_SUFFIX = '[DRAFT]';

/**
 * File-explorer appearance for an OKF document: the entry's text color
 * expresses authorship/provenance (`generated.by` — see `originTier`), a
 * single trailing dot expresses verification status (review tier),
 * overridden to a red "stale" dot when the document is due for review, and
 * the lifecycle status adds a `[DRAFT]` suffix (draft) or a strikethrough
 * (deprecated) — stable and unknown states stay plain. All signals are
 * independent — any can be present without the others.
 */
export function computeExplorerAppearance(
	origin: Origin | null,
	tier: Tier | null,
	stale: boolean,
	status: OkfStatus | null,
): ExplorerAppearance {
	let dot: ExplorerDot | null = null;
	if (stale) {
		dot = { modifier: 'stale', label: STALE_LABEL };
	} else if (tier !== null) {
		dot = { modifier: `tier-${tier}`, label: TIER_LABEL[tier] };
	}

	return {
		textModifier: origin,
		dot,
		statusSuffix: status === 'draft' ? DRAFT_SUFFIX : null,
		statusStrike: status === 'deprecated',
	};
}
