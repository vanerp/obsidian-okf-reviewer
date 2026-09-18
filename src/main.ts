import { Notice, Plugin, type TFile, type WorkspaceLeaf } from 'obsidian';
import { ExplorerDecorator } from './explorer';
import { isOkfDocument } from './okf';
import { ReviewPanelView, VIEW_TYPE_OKF_REVIEWER } from './panel';
import {
	DEFAULT_SETTINGS,
	ReviewerSettingTab,
	type ReviewerSettings,
} from './settings';

export default class OkfReviewerPlugin extends Plugin {
	settings: ReviewerSettings = { ...DEFAULT_SETTINGS };
	private readonly explorerDecorator = new ExplorerDecorator(this);
	private lastOpenedFilePath: string | null = null;

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
			void this.refreshPanel();
			this.explorerDecorator.refreshAll();
		});
	}

	onunload(): void {
		this.explorerDecorator.removeAll();
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
		const cache = file ? this.app.metadataCache.getFileCache(file) : null;
		const isOkf = cache?.frontmatter !== undefined && isOkfDocument(cache.frontmatter);
		if (isOkf && file) {
			// Only force-open/reveal the panel when the active OKF file actually
			// changes — not on every leaf-activation for the file already shown,
			// which would otherwise steal focus back from the editor on every click.
			if (file.path !== this.lastOpenedFilePath) {
				await this.openPanel(file);
				this.lastOpenedFilePath = file.path;
			}
		} else {
			this.lastOpenedFilePath = null;
		}
		this.panelView()?.render();
	}

	private async openPanel(file: TFile): Promise<void> {
		const existing = this.app.workspace
			.getLeavesOfType(VIEW_TYPE_OKF_REVIEWER)
			.first();
		const leaf = existing ?? this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: VIEW_TYPE_OKF_REVIEWER, active: true });
		await this.app.workspace.revealLeaf(leaf);
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
		if (
			this.settings.defaultStatus !== 'draft' &&
			this.settings.defaultStatus !== 'stable' &&
			this.settings.defaultStatus !== 'deprecated'
		) {
			this.settings.defaultStatus = DEFAULT_SETTINGS.defaultStatus;
		}
		if (!Number.isFinite(this.settings.staleAfterDays) || this.settings.staleAfterDays < 0) {
			this.settings.staleAfterDays = DEFAULT_SETTINGS.staleAfterDays;
		}
		if (this.settings.reviewerId.trim().length === 0) {
			this.settings.reviewerId = DEFAULT_SETTINGS.reviewerId;
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}