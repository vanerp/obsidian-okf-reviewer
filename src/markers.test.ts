import { describe, expect, it } from 'vitest';
import { computeExplorerMarkers } from './markers';

describe('computeExplorerMarkers', () => {
	it('is empty when nothing is known and the document is not stale', () => {
		expect(computeExplorerMarkers(null, null, false)).toEqual([]);
	});

	it('shows only the origin dot when origin is known and tier/stale are not', () => {
		expect(computeExplorerMarkers('human', null, false)).toEqual([
			{ modifier: 'origin-human', label: 'Human-authored' },
			{ modifier: 'tier-unknown', label: 'Not yet verified' },
		]);
	});

	it('shows only the tier dot when tier is known and origin/stale are not', () => {
		expect(computeExplorerMarkers(null, 'machine', false)).toEqual([
			{ modifier: 'origin-unknown', label: 'Authorship unknown' },
			{ modifier: 'tier-machine', label: 'Machine-confirmed' },
		]);
	});

	it('shows both dots, each solid, when origin and tier are both known', () => {
		expect(computeExplorerMarkers('human', 'machine', false)).toEqual([
			{ modifier: 'origin-human', label: 'Human-authored' },
			{ modifier: 'tier-machine', label: 'Machine-confirmed' },
		]);
	});

	it('shows both dots solid the same color when origin and tier agree', () => {
		expect(computeExplorerMarkers('machine', 'machine', false)).toEqual([
			{ modifier: 'origin-machine', label: 'Machine-authored' },
			{ modifier: 'tier-machine', label: 'Machine-confirmed' },
		]);
	});

	it('appends the stale dot last, after origin and tier', () => {
		expect(computeExplorerMarkers('human', 'human', true)).toEqual([
			{ modifier: 'origin-human', label: 'Human-authored' },
			{ modifier: 'tier-human', label: 'Human-reviewed' },
			{ modifier: 'stale', label: 'Due for review' },
		]);
	});

	it('shows only the stale dot when neither origin nor tier is known', () => {
		expect(computeExplorerMarkers(null, null, true)).toEqual([
			{ modifier: 'stale', label: 'Due for review' },
		]);
	});

	it('never adds an unknown placeholder purely because of staleness', () => {
		const markers = computeExplorerMarkers(null, null, true);
		expect(markers.some((m) => m.modifier.endsWith('-unknown'))).toBe(false);
	});
});
