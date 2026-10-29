import { Notice, Plugin, type TFile, type WorkspaceLeaf } from 'obsidian';
import { ExplorerDecorator } from './explorer';
import { ExplorerStatusToggle } from './explorer-toggle';
import { isOkfDocument } from './okf';
import { ReviewPanelView, VIEW_TYPE_OKF_REVIEWER } from './panel';
import {
	DEFAULT_SETTINGS,
	ReviewerSettingTab,
	type ReviewerSettings,
} from './settings';
import { normalizeDefinitions } from './attributes';

export default class OkfReviewerPlugin extends Plugin {
	settings: ReviewerSettings = { ...DEFAULT_SETTINGS };
	private readonly explorerDecorator = new ExplorerDecorator(this);
	private readonly explorerToggle = new ExplorerStatusToggle(this);
	// undefined = "never checked yet", distinct from null ("no active file"),
	// so the very first refreshPanel call always runs once.
	private lastActiveFilePath: string | null | undefined = undefined;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_OKF_REVIEWER,
			(leaf: WorkspaceLeaf) => new ReviewPanelView(leaf, this),
		);
		this.addSettingTab(new ReviewerSettingTab(this.app, this));

		// Active file tracking: open/reveal the panel for OKF documents, refresh otherwise.
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				void this.refreshPanel();
			}),
		);
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				void this.refreshPanel();
				this.explorerToggle.syncButtons();
				this.explorerDecorator.refreshAll();
			}),
		);
		// Re-read persisted state whenever the active document changes on disk (IR1).
		this.registerEvent(
			this.app.metadataCache.on('changed', (file: TFile) => {
				if (file.path === this.app.workspace.getActiveFile()?.path) {
					this.panelView()?.render();
				}
				this.explorerDecorator.refreshFile(file);
			}),
		);
		// Full metadata resolution pass: (re)decorate every file explorer entry.
		this.registerEvent(
			this.app.metadataCache.on('resolved', () => {
				this.explorerDecorator.refreshAll();
			}),
		);
		// A renamed file's frontmatter is unchanged, but re-decorate defensively
		// in case the file explorer rebuilds the nav item.
		this.registerEvent(
			this.app.vault.on('rename', () => {
				this.explorerDecorator.refreshAll();
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			this.dedupePanelLeaves();
			void this.refreshPanel();
			this.explorerToggle.syncButtons();
			this.explorerDecorator.refreshAll();
		});
	}

	onunload(): void {
		this.explorerDecorator.removeAll();
		this.explorerToggle.removeButtons();
	}

	/** Re-decorate every explorer entry from current state — called by the
	 *  status toggle after a visibility flip (persist → re-derive). */
	refreshExplorer(): void {
		this.explorerDecorator.refreshAll();
	}

	activeFile(): TFile | null {
		return this.app.workspace.getActiveFile();
	}

	panelView(): ReviewPanelView | undefined {
		const leaf = this.app.workspace
			.getLeavesOfType(VIEW_TYPE_OKF_REVIEWER)
			.first();
		return leaf?.view instanceof ReviewPanelView ? leaf.view : undefined;
	}

	async refreshPanel(): Promise<void> {
		const file = this.activeFile();
		const path = file?.path ?? null;
		if (path === this.lastActiveFilePath) {
			// Nothing actually changed — most commonly, the panel itself just
			// gained focus (e.g. the user clicking a button in it), which fires
			// active-leaf-change for the same file. Re-rendering here would
			// wipe and rebuild the panel's DOM mid-click, eating that click
			// before its own handler ever fires.
			return;
		}
		// Set before awaiting: active-leaf-change, layout-change, and
		// onLayoutReady can all fire for the same file in the same tick (e.g.
		// on startup), and without this the guard above doesn't close until
		// openPanel resolves — letting concurrent calls race past it and each
		// create their own panel leaf.
		this.lastActiveFilePath = path;

		const cache = file ? this.app.metadataCache.getFileCache(file) : null;
		const isOkf = cache?.frontmatter !== undefined && isOkfDocument(cache.frontmatter);
		if (isOkf && file) {
			await this.openPanel(file);
		}
		this.panelView()?.render();
	}

	private async openPanel(file: TFile): Promise<void> {
		this.dedupePanelLeaves();
		const existing = this.app.workspace
			.getLeavesOfType(VIEW_TYPE_OKF_REVIEWER)
			.first();
		const leaf = existing ?? this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: VIEW_TYPE_OKF_REVIEWER, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	/** Keep at most one review-panel leaf, detaching any extras (self-heals
	 *  duplicates from a past startup race, and guards against future ones). */
	private dedupePanelLeaves(): void {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_OKF_REVIEWER);
		for (const extra of leaves.slice(1)) {
			extra.detach();
		}
	}

	/**
	 * Apply a frontmatter mutation immediately (FR-016); on failure show a Notice
	 * and leave the document unchanged, then re-render from persisted state (FR-015, IR1).
	 */
	async applyReview(mutate: (fm: Record<string, unknown>) => void): Promise<void> {
		const file = this.activeFile();
		if (!file) return;
		try {
			await this.app.fileManager.processFrontMatter(
				file,
				(fm: Record<string, unknown>) => mutate(fm),
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`OKF Reviewer: could not update "${file.basename}": ${message}`);
		}
		this.panelView()?.render();
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<ReviewerSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...(stored ?? {}),
		};
		if (this.settings.reviewerId.trim().length === 0) {
			this.settings.reviewerId = DEFAULT_SETTINGS.reviewerId;
		}
		this.settings.attributes = normalizeDefinitions(this.settings.attributes);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}