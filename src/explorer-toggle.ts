import { setIcon } from 'obsidian';
import type { View } from 'obsidian';
import type OkfReviewerPlugin from './main';

const FILE_EXPLORER_VIEW_TYPE = 'file-explorer';
const BUTTONS_CONTAINER_CLASS = 'nav-buttons-container';
const TOGGLE_CLASS = 'okf-reviewer-toggle';
const TOGGLE_ICON = 'eye';
const TOOLTIP_ON = 'Hide OKF status decorations';
const TOOLTIP_OFF = 'Show OKF status decorations';

/**
 * The toggle button in the file explorer's top action bar (contracts/
 * explorer.md Button contract): one button per explorer leaf, added
 * idempotently into the view's `.nav-buttons-container` on layout events,
 * carrying Obsidian's `nav-action-button` styling plus an `is-active` accent
 * while decorations are visible. The click handler owns the state change
 * (flip → persist → re-decorate); this class knows nothing about decoration
 * rules, and the decorator knows nothing about the button — the plugin is
 * the shared owner.
 */
export class ExplorerStatusToggle {
	constructor(private readonly plugin: OkfReviewerPlugin) {}

	/** Add the button to every open file-explorer pane that lacks one, and
	 *  restyle existing buttons to the current state (idempotent — safe to
	 *  call on every layout-change). */
	syncButtons(): void {
		for (const leaf of this.plugin.app.workspace.getLeavesOfType(FILE_EXPLORER_VIEW_TYPE)) {
			const container = this.buttonsContainer(leaf.view);
			if (!container) continue; // unexpected layout — retried on the next layout-change
			const existing = container.querySelector<HTMLElement>(`.${TOGGLE_CLASS}`);
			if (!existing) {
				const button = container.createDiv({
					cls: `${TOGGLE_CLASS} clickable-icon nav-action-button`,
				});
				setIcon(button, TOGGLE_ICON);
				button.addEventListener('click', () => {
					void this.toggle();
				});
			}
			const button = container.querySelector<HTMLElement>(`.${TOGGLE_CLASS}`);
			if (button) this.applyState(button);
		}
	}

	/** Remove every button this plugin injected (call on unload). */
	removeButtons(): void {
		for (const leaf of this.plugin.app.workspace.getLeavesOfType(FILE_EXPLORER_VIEW_TYPE)) {
			leaf.view.containerEl.querySelectorAll(`.${TOGGLE_CLASS}`).forEach((el) => el.remove());
		}
	}

	private async toggle(): Promise<void> {
		this.plugin.settings.showExplorerStatus = !this.plugin.settings.showExplorerStatus;
		await this.plugin.saveSettings();
		this.plugin.refreshExplorer();
		this.syncButtons();
	}

	private applyState(button: HTMLElement): void {
		const visible = this.plugin.settings.showExplorerStatus;
		button.toggleClass('is-active', visible);
		const tooltip = visible ? TOOLTIP_ON : TOOLTIP_OFF;
		button.setAttribute('aria-label', tooltip);
		button.setAttribute('title', tooltip);
	}

	private buttonsContainer(view: View): HTMLElement | null {
		return view.containerEl.querySelector<HTMLElement>(`.${BUTTONS_CONTAINER_CLASS}`);
	}
}