import { TFile, type TAbstractFile } from 'obsidian';
import type OkfReviewerPlugin from './main';
import { computeExplorerMarkers } from './markers';
import { isDueForReview, isOkfDocument, originTier, readReviewState, reviewTier } from './okf';

const FILE_EXPLORER_VIEW_TYPE = 'file-explorer';
const BADGE_GROUP_CLASS = 'okf-reviewer-badges';
const DOT_CLASS = 'okf-reviewer-dot';

/**
 * Suffixes each OKF document's file-explorer entry with up to three small
 * dots — see `computeExplorerMarkers` in `markers.ts` for the slot order and
 * coloring rules. This class only reads Obsidian state and renders the DOM;
 * all of the actual marker logic is pure and unit-tested separately.
 */
export class ExplorerDecorator {
	constructor(private readonly plugin: OkfReviewerPlugin) {}

	refreshAll(): void {
		for (const file of this.plugin.app.vault.getMarkdownFiles()) {
			this.refreshFile(file);
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
		const markers = computeExplorerMarkers(origin, tier, stale);

		for (const titleEl of this.titleElements(file.path)) {
			titleEl.querySelector(`.${BADGE_GROUP_CLASS}`)?.remove();
			if (markers.length === 0) continue;

			const group = titleEl.createSpan({ cls: BADGE_GROUP_CLASS });
			for (const marker of markers) {
				const dot = group.createSpan({ cls: `${DOT_CLASS} ${DOT_CLASS}-${marker.modifier}` });
				dot.setAttr('aria-label', marker.label);
				dot.setAttr('title', marker.label);
			}
		}
	}

	/** Remove every marker this plugin has injected (call on unload). */
	removeAll(): void {
		for (const leaf of this.plugin.app.workspace.getLeavesOfType(FILE_EXPLORER_VIEW_TYPE)) {
			leaf.view.containerEl
				.querySelectorAll(`.${BADGE_GROUP_CLASS}`)
				.forEach((el) => el.remove());
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
