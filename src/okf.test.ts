import { describe, expect, it } from 'vitest';
import {
	addDaysIso,
	appendVerifiedEvent,
	clearStaleAfter,
	humanReviewed,
	isDueForReview,
	isKnownStatus,
	isOkfDocument,
	isValidStaleDate,
	normalizeVerifiedEvents,
	nowIsoLocal,
	originTier,
	readReviewState,
	removeVerifiedEvent,
	reviewTier,
	setStaleAfter,
	setStatus,
	todayIsoDate,
} from './okf';

describe('isOkfDocument', () => {
	it('accepts a non-empty string type', () => {
		expect(isOkfDocument({ type: 'Concept' })).toBe(true);
	});

	it('rejects a missing type', () => {
		expect(isOkfDocument({ title: 'Untyped' })).toBe(false);
	});

	it('rejects a blank type', () => {
		expect(isOkfDocument({ type: '   ' })).toBe(false);
	});

	it('rejects non-record input', () => {
		expect(isOkfDocument(null)).toBe(false);
		expect(isOkfDocument(['type'])).toBe(false);
	});
});

describe('normalizeVerifiedEvents', () => {
	it('is empty when verified is absent', () => {
		expect(normalizeVerifiedEvents({})).toEqual([]);
	});

	it('wraps a single object into a one-element list', () => {
		expect(
			normalizeVerifiedEvents({ verified: { by: 'human:t', at: '2026-01-01T00:00:00' } }),
		).toEqual([{ by: 'human:t', at: '2026-01-01T00:00:00' }]);
	});

	it('passes an array through as entries', () => {
		expect(
			normalizeVerifiedEvents({
				verified: [
					{ by: 'human:t', at: '2026-01-01T00:00:00' },
					{ by: 'process:ci', at: '2026-01-02T00:00:00' },
				],
			}),
		).toEqual([
			{ by: 'human:t', at: '2026-01-01T00:00:00' },
			{ by: 'process:ci', at: '2026-01-02T00:00:00' },
		]);
	});

	it('drops non-record entries and nulls missing by/at', () => {
		expect(
			normalizeVerifiedEvents({ verified: ['not-a-record', { at: '2026-01-01T00:00:00' }] }),
		).toEqual([{ by: null, at: '2026-01-01T00:00:00' }]);
	});
});

describe('readReviewState', () => {
	it('slices an over-long stale_after down to the date portion', () => {
		expect(readReviewState({ stale_after: '2026-01-31T10:00:00Z' }).staleAfter).toBe(
			'2026-01-31',
		);
	});

	it('trims status', () => {
		expect(readReviewState({ status: '  draft  ' }).status).toBe('draft');
	});

	it('defaults status/staleAfter to null when absent', () => {
		const state = readReviewState({});
		expect(state.status).toBeNull();
		expect(state.staleAfter).toBeNull();
	});
});

describe('humanReviewed / reviewTier', () => {
	it('is human when any event has a human:<id> actor', () => {
		const state = readReviewState({
			verified: [{ by: 'process:ci', at: 'x' }, { by: 'human:t', at: 'y' }],
		});
		expect(humanReviewed(state)).toBe(true);
		expect(reviewTier(state)).toBe('human');
	});

	it('is machine when events exist but none are human', () => {
		const state = readReviewState({ verified: { by: 'process:ci', at: 'x' } });
		expect(humanReviewed(state)).toBe(false);
		expect(reviewTier(state)).toBe('machine');
	});

	it('is null (unverified) when there are no events', () => {
		const state = readReviewState({});
		expect(reviewTier(state)).toBeNull();
	});
});

describe('originTier', () => {
	it('is null when generated is missing or malformed', () => {
		expect(originTier({})).toBeNull();
		expect(originTier({ generated: 'not-a-record' })).toBeNull();
		expect(originTier({ generated: { by: '' } })).toBeNull();
		expect(originTier({ generated: { by: 42 } })).toBeNull();
	});

	it('is human for the strict human:<id> actor', () => {
		expect(originTier({ generated: { by: 'human:tijs' } })).toBe('human');
	});

	it('is human for any actor that merely mentions "human" (looser than verified)', () => {
		expect(originTier({ generated: { by: 'assisted-by-human:tijs' } })).toBe('human');
		expect(originTier({ generated: { by: 'HUMAN-IN-THE-LOOP' } })).toBe('human');
	});

	it('is machine for a non-human actor', () => {
		expect(originTier({ generated: { by: 'okf-enforcer/0.6' } })).toBe('machine');
	});
});

describe('isDueForReview', () => {
	it('is true when stale_after is today or earlier', () => {
		const state = readReviewState({ stale_after: '2026-01-31' });
		expect(isDueForReview(state, '2026-01-31')).toBe(true);
		expect(isDueForReview(state, '2026-02-01')).toBe(true);
	});

	it('is false when stale_after is in the future', () => {
		const state = readReviewState({ stale_after: '2026-01-31' });
		expect(isDueForReview(state, '2026-01-30')).toBe(false);
	});

	it('is false when stale_after is absent or invalid', () => {
		expect(isDueForReview(readReviewState({}), '2026-01-31')).toBe(false);
		expect(isDueForReview(readReviewState({ stale_after: 'not-a-date' }), '2026-01-31')).toBe(
			false,
		);
	});
});

describe('isValidStaleDate / isKnownStatus', () => {
	it('validates YYYY-MM-DD shape only', () => {
		expect(isValidStaleDate('2026-01-31')).toBe(true);
		expect(isValidStaleDate('2026-1-31')).toBe(false);
		expect(isValidStaleDate(null)).toBe(false);
	});

	it('recognizes the three known statuses only', () => {
		expect(isKnownStatus('draft')).toBe(true);
		expect(isKnownStatus('stable')).toBe(true);
		expect(isKnownStatus('deprecated')).toBe(true);
		expect(isKnownStatus('archived')).toBe(false);
	});
});

describe('date helpers', () => {
	it('nowIsoLocal formats as YYYY-MM-DDTHH:mm:ss', () => {
		expect(nowIsoLocal(new Date(2026, 0, 5, 9, 3, 7))).toBe('2026-01-05T09:03:07');
	});

	it('todayIsoDate formats as YYYY-MM-DD', () => {
		expect(todayIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
	});

	it('addDaysIso adds days and formats as YYYY-MM-DD', () => {
		expect(addDaysIso(30, new Date(2026, 0, 5))).toBe('2026-02-04');
	});
});

describe('frontmatter mutation builders', () => {
	it('appendVerifiedEvent starts with the object form for the first event', () => {
		const fm: Record<string, unknown> = {};
		appendVerifiedEvent(fm, { by: 'human:t', at: '2026-01-01T00:00:00' });
		expect(fm['verified']).toEqual({ by: 'human:t', at: '2026-01-01T00:00:00' });
	});

	it('appendVerifiedEvent promotes an existing object to an array', () => {
		const fm: Record<string, unknown> = { verified: { by: 'process:ci', at: 'x' } };
		appendVerifiedEvent(fm, { by: 'human:t', at: 'y' });
		expect(fm['verified']).toEqual([
			{ by: 'process:ci', at: 'x' },
			{ by: 'human:t', at: 'y' },
		]);
	});

	it('appendVerifiedEvent appends to an existing array', () => {
		const fm: Record<string, unknown> = { verified: [{ by: 'a', at: 'x' }] };
		appendVerifiedEvent(fm, { by: 'b', at: 'y' });
		expect(fm['verified']).toEqual([
			{ by: 'a', at: 'x' },
			{ by: 'b', at: 'y' },
		]);
	});

	it('removeVerifiedEvent deletes the field when the only event matches (object form)', () => {
		const fm: Record<string, unknown> = { verified: { by: 'human:t', at: 'x' } };
		removeVerifiedEvent(fm, 'human:t', 'x');
		expect('verified' in fm).toBe(false);
	});

	it('removeVerifiedEvent removes exactly the matching entry from an array', () => {
		const fm: Record<string, unknown> = {
			verified: [
				{ by: 'a', at: 'x' },
				{ by: 'b', at: 'y' },
			],
		};
		removeVerifiedEvent(fm, 'a', 'x');
		expect(fm['verified']).toEqual([{ by: 'b', at: 'y' }]);
	});

	it('removeVerifiedEvent deletes the field once the array is emptied', () => {
		const fm: Record<string, unknown> = { verified: [{ by: 'a', at: 'x' }] };
		removeVerifiedEvent(fm, 'a', 'x');
		expect('verified' in fm).toBe(false);
	});

	it('removeVerifiedEvent is a no-op when nothing matches', () => {
		const fm: Record<string, unknown> = { verified: [{ by: 'a', at: 'x' }] };
		removeVerifiedEvent(fm, 'b', 'y');
		expect(fm['verified']).toEqual([{ by: 'a', at: 'x' }]);
	});

	it('setStatus sets or clears status', () => {
		const fm: Record<string, unknown> = {};
		setStatus(fm, 'draft');
		expect(fm['status']).toBe('draft');
		setStatus(fm, null);
		expect('status' in fm).toBe(false);
	});

	it('setStaleAfter/clearStaleAfter set or remove stale_after', () => {
		const fm: Record<string, unknown> = {};
		setStaleAfter(fm, '2026-12-31');
		expect(fm['stale_after']).toBe('2026-12-31');
		clearStaleAfter(fm);
		expect('stale_after' in fm).toBe(false);
	});
});
