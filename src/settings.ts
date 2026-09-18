import { App, PluginSettingTab, Setting } from 'obsidian';
import type OkfReviewerPlugin from './main';
import type { OkfStatus } from './okf';

export interface ReviewerSettings {
	reviewerId: string;
	defaultStatus: OkfStatus;
	staleAfterDays: number;
}

export const DEFAULT_SETTINGS: ReviewerSettings = {
	reviewerId: 'human:reviewer',
	defaultStatus: 'stable',
	staleAfterDays: 90,
};

export function parseStaleAfterDays(value: string): number {
	const n = Number.parseInt(value, 10);
	return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SETTINGS.staleAfterDays;
}

export class ReviewerSettingTab extends PluginSettingTab {
	plugin: OkfReviewerPlugin;

	constructor(app: App, plugin: OkfReviewerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Reviewer identity')
			.setDesc(
				'Actor recorded as `by` in verification events. Use the `human:<id>` form, e.g. human:tijs.',
			)
			.addText((text) =>
				text
					.setPlaceholder('human:reviewer')
					.setValue(this.plugin.settings.reviewerId)
					.onChange(async (value) => {
						const trimmed = value.trim();
						this.plugin.settings.reviewerId =
							trimmed.length > 0
								? trimmed
								: DEFAULT_SETTINGS.reviewerId;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Default status on approval')
			.setDesc('Pre-fills the status control for documents without review events.')
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						draft: 'draft',
						stable: 'stable',
						deprecated: 'deprecated',
					})
					.setValue(this.plugin.settings.defaultStatus)
					.onChange(async (value) => {
						if (value === 'draft' || value === 'stable' || value === 'deprecated') {
							this.plugin.settings.defaultStatus = value;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName('Default stale-after (days)')
			.setDesc(
				'Pre-fills stale-after as the review date plus this many days, stored as an absolute date.',
			)
			.addText((text) =>
				text
					.setPlaceholder('90')
					.setValue(String(this.plugin.settings.staleAfterDays))
					.onChange(async (value) => {
						this.plugin.settings.staleAfterDays = parseStaleAfterDays(value);
						await this.plugin.saveSettings();
					}),
			);
	}
}