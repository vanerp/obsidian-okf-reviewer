// Pure OKF frontmatter mapping — no Obsidian imports (research R9).
// Reference convention: okf-enforcer validator (§5.2, §5.4, §5.5, §7).

export const OKF_STATUSES = ['draft', 'stable', 'deprecated'] as const;
export type OkfStatus = (typeof OKF_STATUSES)[number];

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface VerifiedEvent {
	by: string | null;
	at: string | null;
}

export interface ReviewState {
	events: VerifiedEvent[];
	status: string | null;
	staleAfter: string | null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** OKF document detection: frontmatter carries a non-empty `type` (research R4). */
export function isOkfDocument(data: unknown): boolean {
	return (
		isRecord(data) &&
		typeof data['type'] === 'string' &&
		data['type'].trim().length > 0
	);
}

/** Normalize `verified` per OKF §5.2 (research R2): object → [obj]; array → object entries; else none. */
export function normalizeVerifiedEvents(
	data: Record<string, unknown>,
): VerifiedEvent[] {
	const raw = data['verified'];
	if (raw === undefined || raw === null) return [];
	const items = Array.isArray(raw) ? raw : [raw];
	const events: VerifiedEvent[] = [];
	for (const item of items) {
		if (!isRecord(item)) continue;
		const by = item['by'];
		const at = item['at'];
		events.push({
			by: typeof by === 'string' ? by : null,
			at: typeof at === 'string' ? at : null,
		});
	}
	return events;
}

export function readReviewState(data: Record<string, unknown>): ReviewState {
	const statusRaw = data['status'];
	const staleRaw = data['stale_after'];
	let staleAfter: string | null = null;
	if (typeof staleRaw === 'string') staleAfter = staleRaw.slice(0, 10);
	else if (typeof staleRaw === 'number' || typeof staleRaw === 'boolean') {
		staleAfter = String(staleRaw);
	}
	return {
		events: normalizeVerifiedEvents(data),
		status: typeof statusRaw === 'string' ? statusRaw.trim() : null,
		staleAfter,
	};
}

export function isKnownStatus(value: string): value is OkfStatus {
	return (OKF_STATUSES as readonly string[]).includes(value);
}

export function isValidStaleDate(value: string | null): value is string {
	return value !== null && ISO_DATE_RE.test(value);
}

export const HUMAN_ACTOR_PREFIX = 'human:';

/** Any event with a `human:<id>` actor (okf-enforcer trust-tier rule). */
export function humanReviewed(state: ReviewState): boolean {
	return state.events.some((e) => e.by !== null && e.by.startsWith(HUMAN_ACTOR_PREFIX));
}

export type Tier = 'human' | 'machine';

/** Review tier derived from verification events: human beats machine beats none. */
export function reviewTier(state: ReviewState): Tier | null {
	if (humanReviewed(state)) return 'human';
	if (state.events.length > 0) return 'machine';
	return null;
}

export type Origin = 'human' | 'machine';

/**
 * Provenance, not review: who/what authored the document via `generated.by`,
 * independent of whether anyone has since recorded a `verified` event. Any
 * mention of "human" anywhere in that actor counts as full human authorship
 * (looser than the strict `human:<id>` format `verified` requires, since
 * `generated` carries no such contract); any other non-empty actor is
 * machine-authored; a missing/malformed `generated` block means unknown
 * provenance (null).
 */
export function originTier(frontmatter: Record<string, unknown>): Origin | null {
	const generated = frontmatter['generated'];
	if (!isRecord(generated)) return null;
	const by = generated['by'];
	if (typeof by !== 'string' || by.trim().length === 0) return null;
	return by.toLowerCase().includes('human') ? 'human' : 'machine';
}

export function isDueForReview(
	state: ReviewState,
	today: string = todayIsoDate(),
): boolean {
	return isValidStaleDate(state.staleAfter) && state.staleAfter <= today;
}

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

/** Local wall-clock ISO 8601 datetime, `YYYY-MM-DDTHH:mm:ss` (research R3). */
export function nowIsoLocal(date: Date = new Date()): string {
	return (
		`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
		`T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
	);
}

export function todayIsoDate(date: Date = new Date()): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDaysIso(days: number, from: Date = new Date()): string {
	const d = new Date(from);
	d.setDate(d.getDate() + days);
	return todayIsoDate(d);
}

// --- Frontmatter mutation builders (contracts/frontmatter.md write table) ---

/**
 * Append a verification event, preserving existing raw entries from other
 * actors — except that every existing event from the same actor (`by`),
 * including any accumulated duplicates, is collapsed into this one fresh
 * record (kept at the first match's position) rather than appended
 * alongside them.
 */
export function appendVerifiedEvent(
	fm: Record<string, unknown>,
	event: VerifiedEvent & { by: string; at: string },
): void {
	const raw = fm['verified'];
	const entry = { by: event.by, at: event.at };

	if (raw === undefined || raw === null) {
		fm['verified'] = entry; // object form for the first event
		return;
	}

	if (isRecord(raw)) {
		fm['verified'] = raw['by'] === event.by ? entry : [raw, entry];
		return;
	}

	if (Array.isArray(raw)) {
		const entries = raw as unknown[];
		const firstIndex = entries.findIndex((e) => isRecord(e) && e['by'] === event.by);
		if (firstIndex === -1) {
			fm['verified'] = [...entries, entry];
			return;
		}
		// Every entry before the first match is from a different actor (by
		// definition of "first"), so it survives filtering untouched — the
		// first match's index in the original array is therefore still valid
		// as the insertion point in the deduped array.
		const deduped = entries.filter((e) => !(isRecord(e) && e['by'] === event.by));
		deduped.splice(firstIndex, 0, entry);
		fm['verified'] = deduped;
		return;
	}

	// Invalid scalar: explicit user action replaces it (read contract note).
	fm['verified'] = entry;
}

/** Remove exactly the event matching by+at; field removed when none remain (FR-017). */
export function removeVerifiedEvent(
	fm: Record<string, unknown>,
	by: string,
	at: string,
): void {
	const raw = fm['verified'];
	if (isRecord(raw)) {
		if (raw['by'] === by && raw['at'] === at) delete fm['verified'];
		return;
	}
	if (Array.isArray(raw)) {
		const remaining = raw.filter(
			(e) => !(isRecord(e) && e['by'] === by && e['at'] === at),
		);
		if (remaining.length === raw.length) return; // nothing matched
		if (remaining.length === 0) delete fm['verified'];
		else fm['verified'] = remaining;
	}
}

export function setStatus(fm: Record<string, unknown>, status: OkfStatus | null): void {
	if (status === null) delete fm['status'];
	else fm['status'] = status;
}

export function setStaleAfter(fm: Record<string, unknown>, date: string): void {
	fm['stale_after'] = date;
}

export function clearStaleAfter(fm: Record<string, unknown>): void {
	delete fm['stale_after'];
}