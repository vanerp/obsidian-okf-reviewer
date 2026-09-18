import { describe, expect, it } from 'vitest';
import { computeExplorerAppearance } from './markers';

describe('computeExplorerAppearance', () => {
	it('shows neither text color nor a dot when nothing is known', () => {
		expect(computeExplorerAppearance(null, null, false, null)).toEqual({
			textModifier: null,
			dot: null,
			statusSuffix: null,
			statusStrike: false,
		});
	});

	it('text color follows origin regardless of tier/stale', () => {
		expect(computeExplorerAppearance('human', null, false, null).textModifier).toBe('human');
		expect(computeExplorerAppearance('machine', null, false, null).textModifier).toBe('machine');
		expect(computeExplorerAppearance(null, 'human', false, null).textModifier).toBeNull();
	});

	it('dot follows verification tier when known and not stale', () => {
		expect(computeExplorerAppearance(null, 'human', false, null).dot).toEqual({
			modifier: 'tier-human',
			label: 'Human-reviewed',
		});
		expect(computeExplorerAppearance('human', 'machine', false, null).dot).toEqual({
			modifier: 'tier-machine',
			label: 'Machine-confirmed',
		});
	});

	it('has no dot when unverified and not stale, independent of origin', () => {
		expect(computeExplorerAppearance('human', null, false, null).dot).toBeNull();
		expect(computeExplorerAppearance(null, null, false, null).dot).toBeNull();
	});

	it('stale overrides the dot to red even when a tier is known', () => {
		expect(computeExplorerAppearance('human', 'human', true, null).dot).toEqual({
			modifier: 'stale',
			label: 'Due for review',
		});
	});

	it('stale still shows a dot when there is no verification tier at all', () => {
		expect(computeExplorerAppearance(null, null, true, null).dot).toEqual({
			modifier: 'stale',
			label: 'Due for review',
		});
	});

	it('stale never affects the text color', () => {
		expect(computeExplorerAppearance('machine', 'human', true, null).textModifier).toBe('machine');
		expect(computeExplorerAppearance(null, 'human', true, null).textModifier).toBeNull();
	});

	it('draft notes get a [DRAFT] suffix and no strike', () => {
		expect(computeExplorerAppearance(null, null, false, 'draft')).toEqual({
			textModifier: null,
			dot: null,
			statusSuffix: '[DRAFT]',
			statusStrike: false,
		});
	});

	it('deprecated notes get a strike and no suffix', () => {
		expect(computeExplorerAppearance(null, null, false, 'deprecated')).toEqual({
			textModifier: null,
			dot: null,
			statusSuffix: null,
			statusStrike: true,
		});
	});

	it('stable notes stay undecorated', () => {
		expect(computeExplorerAppearance(null, null, false, 'stable')).toEqual({
			textModifier: null,
			dot: null,
			statusSuffix: null,
			statusStrike: false,
		});
	});

	it('status signals are independent of origin, tier, and stale', () => {
		// machine-authored, human-verified, stale, draft: all signals at once
		expect(computeExplorerAppearance('machine', 'human', true, 'draft')).toEqual({
			textModifier: 'machine',
			dot: { modifier: 'stale', label: 'Due for review' },
			statusSuffix: '[DRAFT]',
			statusStrike: false,
		});
		// deprecated keeps color and dot while striking through
		expect(computeExplorerAppearance('machine', 'machine', false, 'deprecated')).toEqual({
			textModifier: 'machine',
			dot: { modifier: 'tier-machine', label: 'Machine-confirmed' },
			statusSuffix: null,
			statusStrike: true,
		});
		// status never affects the existing signals
		expect(computeExplorerAppearance('human', 'human', false, 'draft').textModifier).toBe('human');
		expect(computeExplorerAppearance('human', 'human', false, 'draft').dot).toEqual({
			modifier: 'tier-human',
			label: 'Human-reviewed',
		});
	});
});