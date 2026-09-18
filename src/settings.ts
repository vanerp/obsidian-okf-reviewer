import { App, PluginSettingTab, Setting } from 'obsidian';
import type OkfReviewerPlugin from './main';

export interface ReviewerSettings {
	reviewerId: string;
}

export const DEFAULT_SETTINGS: ReviewerSettings = {
	reviewerId: 'human:reviewer',
};

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
	}
}
