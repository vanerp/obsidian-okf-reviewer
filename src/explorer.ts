import { TFile, type TAbstractFile } from 'obsidian';
import type OkfReviewerPlugin from './main';
import { computeExplorerAppearance } from './markers';
import { isDueForReview, isKnownStatus, isOkfDocument, originTier, readReviewState, reviewTier } from './okf';

const FILE_EXPLORER_VIEW_TYPE = 'file-explorer';
const DOT_CLASS = 'okf-reviewer-dot';
const SUFFIX_CLASS = 'okf-reviewer-suffix';
const STRIKE_CLASS = 'okf-reviewer-strike';
const TEXT_CLASS_PREFIX = 'okf-reviewer-text-';
const TEXT_CLASSES = [`${TEXT_CLASS_PREFIX}human`, `${TEXT_CLASS_PREFIX}machine`];

/**
 * Colors each OKF document's file-explorer entry to express authorship
 * (text color = `generated.by`), suffixes it with a single dot for
 * verification status (or stale, in red), and decorates the label with the
 * lifecycle status (`[DRAFT]` suffix for drafts, strikethrough for
 * deprecated) — see `computeExplorerAppearance` in `markers.ts` for the
 * rules. This class only reads Obsidian state and renders the DOM; the
 * actual appearance logic is pure and unit-tested separately.
 */
export class ExplorerDecorator {
	constructor(private readonly plugin: OkfReviewerPlugin) {}

	/**
	 * Re-decorate every entry currently rendered in a file explorer. Driven by
	 * the explorer's DOM rather than a vault-wide file listing: only rendered
	 * entries can be decorated anyway.
	 */
	refreshAll(): void {
		const paths = new Set<string>();
		for (const leaf of this.plugin.app.workspace.getLeavesOfType(FILE_EXPLORER_VIEW_TYPE)) {
			leaf.view.containerEl
				.querySelectorAll<HTMLElement>('.nav-file-title[data-path]')
				.forEach((el) => {
					const path = el.dataset.path;
					if (path?.endsWith('.md')) paths.add(path);
				});
		}
		for (const path of paths) {
			const file = this.plugin.app.vault.getFileByPath(path);
			if (file) this.refreshFile(file);
		}
	}

	refreshFile(file: TAbstractFile): void {
		if (!(file instanceof TFile)) return; // folders carry no review state
		const cache = this.plugin.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		const isOkf = frontmatter !== undefined && isOkfDocument(frontmatter);
		const state = isOkf ? readReviewState(frontmatter) : null;
		const origin = isOkf ? originTier(frontmatter) : null;
		const tier = state ? reviewTier(state) : null;
		const stale = state !== null && isDueForReview(state);
		// Only the three OKF-recognized statuses decorate; anything else
		// (unrecognized string, list, missing, malformed frontmatter) stays plain.
		const rawStatus = state?.status ?? null;
		const status = rawStatus !== null && isKnownStatus(rawStatus) ? rawStatus : null;
		// Visibility gate (feature 003): while hidden, every refresh pass
		// strips all decoration — the remove-then-apply steps below run with a
		// zeroed appearance, so the end state always matches the toggle.
		const appearance = this.plugin.settings.showExplorerStatus
			? computeExplorerAppearance(origin, tier, stale, status)
			: { textModifier: null, dot: null, statusSuffix: null, statusStrike: false };

		for (const titleEl of this.titleElements(file.path)) {
			titleEl.querySelector(`.${DOT_CLASS}`)?.remove();
			if (appearance.dot !== null) {
				const dot = titleEl.createSpan({
					cls: `${DOT_CLASS} ${DOT_CLASS}-${appearance.dot.modifier}`,
				});
				dot.setAttr('aria-label', appearance.dot.label);
				dot.setAttr('title', appearance.dot.label);
			}

			const textEl = titleEl.querySelector<HTMLElement>('.nav-file-title-content') ?? titleEl;
			textEl.removeClasses(TEXT_CLASSES);
			if (appearance.textModifier !== null) {
				textEl.addClass(`${TEXT_CLASS_PREFIX}${appearance.textModifier}`);
			}
			textEl.removeClass(STRIKE_CLASS);
			if (appearance.statusStrike) {
				textEl.addClass(STRIKE_CLASS);
			}
			textEl.querySelector(`.${SUFFIX_CLASS}`)?.remove();
			if (appearance.statusSuffix !== null) {
				textEl.createSpan({ cls: SUFFIX_CLASS, text: appearance.statusSuffix });
			}
		}
	}

	/** Remove every marker this plugin has injected (call on unload). */
	removeAll(): void {
		for (const leaf of this.plugin.app.workspace.getLeavesOfType(FILE_EXPLORER_VIEW_TYPE)) {
			const container = leaf.view.containerEl;
			container.querySelectorAll(`.${DOT_CLASS}`).forEach((el) => el.remove());
			container.querySelectorAll(`.${SUFFIX_CLASS}`).forEach((el) => el.remove());
			container.querySelectorAll(`.${STRIKE_CLASS}`).forEach((el) => {
				el.classList.remove(STRIKE_CLASS);
			});
			container.querySelectorAll(TEXT_CLASSES.map((c) => `.${c}`).join(',')).forEach((el) => {
				el.classList.remove(...TEXT_CLASSES);
			});
		}
	}

	private titleElements(path: string): HTMLElement[] {
		const escaped = CSS.escape(path);
		const elements: HTMLElement[] = [];
		for (const leaf of this.plugin.app.workspace.getLeavesOfType(FILE_EXPLORER_VIEW_TYPE)) {
			const el = leaf.view.containerEl.querySelector<HTMLElement>(
				`.nav-file-title[data-path="${escaped}"]`,
			);
			if (el) elements.push(el);
		}
		return elements;
	}
}
