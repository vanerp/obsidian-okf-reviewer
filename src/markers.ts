// Pure file-explorer marker logic — no Obsidian imports, so it's unit-testable
// independent of the DOM/plugin glue in explorer.ts.

import type { Origin, Tier } from './okf';

export interface ExplorerMarker {
	modifier: string;
	label: string;
}

const ORIGIN_LABEL: Record<Origin, string> = {
	human: 'Human-authored',
	machine: 'Machine-authored',
};

const TIER_LABEL: Record<Tier, string> = {
	human: 'Human-reviewed',
	machine: 'Machine-confirmed',
};

const STALE_LABEL = 'Due for review';
const ORIGIN_UNKNOWN_LABEL = 'Authorship unknown';
const TIER_UNKNOWN_LABEL = 'Not yet verified';

/**
 * Fixed three-slot order for the file-explorer marker row: generated
 * (authorship), verified (review tier), then stale. Each of generated/
 * verified renders solid when known; if one is unknown but the other is
 * known, it renders as an open/grey placeholder instead of vanishing, so
 * the slot order stays legible. Stale never gets a placeholder — it's
 * either present (red) or entirely absent, and it never triggers a
 * placeholder for the other two slots.
 */
export function computeExplorerMarkers(
	origin: Origin | null,
	tier: Tier | null,
	stale: boolean,
): ExplorerMarker[] {
	const markers: ExplorerMarker[] = [];

	if (origin !== null) {
		markers.push({ modifier: `origin-${origin}`, label: ORIGIN_LABEL[origin] });
	} else if (tier !== null) {
		markers.push({ modifier: 'origin-unknown', label: ORIGIN_UNKNOWN_LABEL });
	}

	if (tier !== null) {
		markers.push({ modifier: `tier-${tier}`, label: TIER_LABEL[tier] });
	} else if (origin !== null) {
		markers.push({ modifier: 'tier-unknown', label: TIER_UNKNOWN_LABEL });
	}

	if (stale) {
		markers.push({ modifier: 'stale', label: STALE_LABEL });
	}

	return markers;
}
