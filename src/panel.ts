import { ButtonComponent, ItemView, Notice, Setting, type TFile } from 'obsidian';
import type OkfReviewerPlugin from './main';
import { applyAttributes, removeAttribute } from './attributes';
import {
	addDaysIso,
	appendVerifiedEvent,
	clearStaleAfter,
	HUMAN_ACTOR_PREFIX,
	humanReviewed,
	isDueForReview,
	isKnownStatus,
	isOkfDocument,
	isValidStaleDate,
	ISO_DATE_RE,
	nowIsoLocal,
	OKF_STATUSES,
	readReviewState,
	removeVerifiedEvent,
	setStatus,
	setStaleAfter,
	type OkfStatus,
	type ReviewState,
} from './okf';

export const VIEW_TYPE_OKF_REVIEWER = 'okf-reviewer-panel';

export class ReviewPanelView extends ItemView {
	plugin: OkfReviewerPlugin;

	constructor(leaf: ItemView['leaf'], plugin: OkfReviewerPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_OKF_REVIEWER;
	}

	getDisplayText(): string {
		return 'Review panel';
	}

	getIcon(): string {
		return 'clipboard-check';
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	render(): void {
		const contentEl = this.contentEl;
		contentEl.empty();
		contentEl.addClass('okf-reviewer-panel');

		const file = this.plugin.activeFile();
		const cache = file ? this.app.metadataCache.getFileCache(file) : null;
		const frontmatter = cache?.frontmatter;

		if (!file || !frontmatter || !isOkfDocument(frontmatter)) {
			const broken = cache?.frontmatterPosition !== undefined;
			this.renderInactive(contentEl, broken);
		} else {
			const state = readReviewState(frontmatter);
			this.renderHeader(contentEl, state);
			this.renderVerifiedSection(contentEl, state);
			this.renderStatusControl(contentEl, state);
			this.renderStaleAfterControl(contentEl, state);
		}

		// Feature 004: attribute adding is available for ANY open document,
		// including non-OKF notes and notes without frontmatter (FR-003, FR-009);
		// review sections above keep their OKF gating (contract panel.md IR-A5).
		this.renderAttributesSection(contentEl, file, frontmatter);
	}

	private renderInactive(contentEl: HTMLElement, broken: boolean): void {
		const box = contentEl.createDiv('okf-reviewer-inactive');
		if (broken) {
			box.setText(
				'This note has malformed frontmatter, so its review state cannot be shown or edited. Fix the YAML block first — this panel will not touch the note.',
			);
		} else {
			box.setText(
				'The active note is not an OKF document (no frontmatter `type`). Review fields are available only for OKF documents.',
			);
		}
	}

	private renderHeader(contentEl: HTMLElement, state: ReviewState): void {
		const header = contentEl.createDiv('okf-reviewer-header');
		const tier = header.createSpan();
		if (humanReviewed(state)) {
			tier.setText('Human-reviewed');
			tier.addClass('okf-reviewer-tier-ok');
		} else if (state.events.length > 0) {
			tier.setText('Machine-confirmed');
			tier.addClass('okf-reviewer-tier-mid');
		} else {
			tier.setText('Unverified');
			tier.addClass('okf-reviewer-tier-none');
		}
		header.appendChild(tier);
		if (isDueForReview(state)) {
			const due = header.createSpan();
			due.setText('Due for review');
			due.setAttr('title', `stale_after ${state.staleAfter} has passed`);
			due.addClass('okf-reviewer-tier-due');
			header.appendChild(due);
		}
	}

	private renderVerifiedSection(
		contentEl: HTMLElement,
		state: ReviewState,
	): void {
		const section = contentEl.createDiv('okf-reviewer-section');
		this.renderSectionHeading(section, 'Verified');

		if (state.events.length === 0) {
			section.createDiv('okf-reviewer-muted').setText('No verification events.');
		} else {
			const list = section.createDiv('okf-reviewer-list');
			for (const event of state.events) {
				const { by, at } = event;
				const row = list.createDiv('okf-reviewer-row');
				const text = row.createDiv('okf-reviewer-event-text');
				const nameRow = text.createDiv('okf-reviewer-event-name-row');
				const humanId =
					by !== null && by.startsWith(HUMAN_ACTOR_PREFIX)
						? by.slice(HUMAN_ACTOR_PREFIX.length)
						: null;
				nameRow.createSpan({
					text: humanId ?? by ?? '(missing by)',
					cls: 'okf-reviewer-event-name',
				});
				if (humanId !== null) {
					nameRow.createSpan({ text: 'human', cls: 'okf-reviewer-event-badge' });
				}
				text.createSpan({
					text: at !== null ? formatHumanDateTime(at) : '(missing at)',
					cls: 'okf-reviewer-event-date',
				});
				const remove = new ButtonComponent(row)
					.setIcon('trash-2')
					.setTooltip('Remove this verification event');
				remove.buttonEl.addClass('okf-reviewer-icon-button');
				remove.onClick(() => {
					if (by === null || at === null) {
						new Notice(
							'OKF Reviewer: event lacks `by`/`at`; edit the note by hand.',
						);
						return;
					}
					void this.plugin.applyReview((fm) => removeVerifiedEvent(fm, by, at));
				});
			}
		}

		new Setting(section)
			.setDesc(
				`Records a verification event as ${this.plugin.settings.reviewerId} with the current timestamp.`,
			)
			.addButton((button) =>
				button
					.setButtonText('Mark verified')
					.setCta()
					.onClick(() => {
						void this.plugin.applyReview((fm) =>
							appendVerifiedEvent(fm, {
								by: this.plugin.settings.reviewerId,
								at: nowIsoLocal(),
							}),
						);
					}),
			);
	}

	private renderSectionHeading(container: HTMLElement, text: string): void {
		container.createDiv({ cls: 'okf-reviewer-heading', text });
	}

	/**
	 * Feature 004: list configured attributes with their presence in the
	 * active document, and the one-click add action (FR-003). The write goes
	 * through `applyReview` so failures surface as a Notice and the document
	 * stays unchanged (FR-010); the live `settings.attributes` array is
	 * captured in the handler so edits made after this render still apply.
	 */
	private renderAttributesSection(
		contentEl: HTMLElement,
		file: TFile | null,
		frontmatter: Record<string, unknown> | undefined,
	): void {
		const section = contentEl.createDiv('okf-reviewer-section');
		this.renderSectionHeading(section, 'Frontmatter attributes');

		const defs = this.plugin.settings.attributes.filter(
			(def) => def.name.trim().length > 0,
		);
		if (defs.length === 0) {
			section
				.createDiv('okf-reviewer-muted')
				.setText(
					'No attributes configured. Define them in the plugin settings.',
				);
			return;
		}

		const rows = section.createDiv('okf-reviewer-list');
		for (const def of defs) {
			const row = rows.createDiv('okf-reviewer-row');
			row.createSpan({ text: def.name, cls: 'okf-reviewer-attr-name' });
			const present = frontmatter !== undefined && def.name in frontmatter;
			if (!present) {
				// Per-attribute add: matched by identity against the live settings
				// array, so a definition deleted in settings after this render
				// turns the click into a no-op instead of writing stale state.
				const add = new ButtonComponent(row)
					.setIcon('plus')
					.setTooltip(`Add "${def.name}" only`)
					.onClick(() => {
						void this.plugin.applyReview((fm) =>
							applyAttributes(
								fm,
								this.plugin.settings.attributes.filter((d) => d === def),
							),
						);
					});
				add.buttonEl.addClass('okf-reviewer-icon-button', 'okf-reviewer-add-button');
			} else {
				const remove = new ButtonComponent(row)
					.setIcon('trash-2')
					.setTooltip(`Remove "${def.name}" from this document`)
					.onClick(() => {
						void this.plugin.applyReview((fm) => removeAttribute(fm, def.name));
					});
				remove.buttonEl.addClass('okf-reviewer-icon-button');
			}
		}

		const missing = defs.filter(
			(def) => frontmatter === undefined || !(def.name in frontmatter),
		);
		const nothingToAdd = !file || missing.length === 0;
		new Setting(section)
			.setDesc(
				!file
					? 'No active document.'
					: missing.length === 0
						? 'All configured attributes are already present.'
						: `Will add ${missing.length} missing attribute${missing.length === 1 ? '' : 's'} with their default values.`,
			)
			.addButton((button) =>
				button
					.setButtonText('Add all')
					.setCta()
					.setDisabled(nothingToAdd)
					.onClick(() => {
						void this.plugin.applyReview((fm) =>
							applyAttributes(fm, this.plugin.settings.attributes),
						);
					}),
			);
	}

	private renderStatusControl(
		contentEl: HTMLElement,
		state: ReviewState,
	): void {
		const section = contentEl.createDiv('okf-reviewer-section');
		this.renderSectionHeading(section, 'Status');
		const active: OkfStatus | null =
			state.status !== null && isKnownStatus(state.status) ? state.status : null;

		const row = section.createDiv('okf-reviewer-button-row');
		for (const status of OKF_STATUSES) {
			const isActive = status === active;
			const button = new ButtonComponent(row)
				.setButtonText(status.charAt(0).toUpperCase() + status.slice(1))
				.setDisabled(isActive)
				.onClick(() => {
					void this.plugin.applyReview((fm) => setStatus(fm, status));
				});
			button.buttonEl.addClass('okf-reviewer-choice');
			if (isActive) {
				button.buttonEl.addClass('okf-reviewer-status-active', `okf-reviewer-status-${status}`);
			}
		}

		if (state.status !== null) {
			const clear = new ButtonComponent(row)
				.setIcon('eraser')
				.setTooltip('Clear status');
			clear.buttonEl.addClass('okf-reviewer-icon-button');
			clear.onClick(() => {
				void this.plugin.applyReview((fm) => setStatus(fm, null));
			});
		}
	}

	private renderStaleAfterControl(
		contentEl: HTMLElement,
		state: ReviewState,
	): void {
		const section = contentEl.createDiv('okf-reviewer-section');
		this.renderSectionHeading(section, 'Stale after');
		const stale = state.staleAfter;
		const prefill = isValidStaleDate(stale) ? stale : '';
		new Setting(section)
			.setDesc('Once this date passes, the document is due for review. Pick a date, or set it a number of days from today.')
			.addText((text) => {
				text.inputEl.type = 'date'; // native date picker; its value is already YYYY-MM-DD
				return text.setValue(prefill).onChange((value) => {
					if (value.length === 0) {
						void this.plugin.applyReview((fm) => clearStaleAfter(fm));
						return;
					}
					// In-flight edits are not committed until the value is a complete date.
					if (ISO_DATE_RE.test(value)) {
						void this.plugin.applyReview((fm) => setStaleAfter(fm, value));
					}
				});
			})
			.addButton((button) => {
				button
					.setIcon('eraser')
					.setTooltip('Clear stale-after')
					.onClick(() => {
						void this.plugin.applyReview((fm) => clearStaleAfter(fm));
					});
				button.buttonEl.addClass('okf-reviewer-icon-button');
			});

		const presets = section.createDiv('okf-reviewer-button-row');
		for (const days of [30, 90, 180, 365]) {
			const preset = new ButtonComponent(presets)
				.setButtonText(`${days}d`)
				.setTooltip(`Set stale-after to ${days} days from today`)
				.onClick(() => {
					void this.plugin.applyReview((fm) => setStaleAfter(fm, addDaysIso(days)));
				});
			preset.buttonEl.addClass('okf-reviewer-choice');
		}
	}
}

/** Render an event's `at` timestamp for humans; falls back to the raw value if unparsable. */
function formatHumanDateTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
}