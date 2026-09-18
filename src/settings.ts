import { App, PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian';
import type OkfReviewerPlugin from './main';

export interface ReviewerSettings {
	reviewerId: string;
}

export const DEFAULT_SETTINGS: ReviewerSettings = {
	reviewerId: 'human:reviewer',
};

const REVIEWER_ID_NAME = 'Reviewer identity';
const REVIEWER_ID_DESC =
	'Actor recorded as `by` in verification events. Use the `human:<id>` form, e.g. human:tijs.';

function normalizeReviewerId(value: string): string {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : DEFAULT_SETTINGS.reviewerId;
}

export class ReviewerSettingTab extends PluginSettingTab {
	plugin: OkfReviewerPlugin;

	constructor(app: App, plugin: OkfReviewerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** Declarative settings (Obsidian 1.13+), which also makes them searchable. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: REVIEWER_ID_NAME,
				desc: REVIEWER_ID_DESC,
				aliases: ['reviewer', 'actor', 'verification'],
				control: {
					type: 'text',
					key: 'reviewerId',
					placeholder: DEFAULT_SETTINGS.reviewerId,
					defaultValue: DEFAULT_SETTINGS.reviewerId,
				},
			},
		];
	}

	getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof ReviewerSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'reviewerId' && typeof value === 'string') {
			this.plugin.settings.reviewerId = normalizeReviewerId(value);
			await this.plugin.saveSettings();
		}
	}

	/** Imperative fallback for Obsidian versions older than 1.13.0. */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName(REVIEWER_ID_NAME)
			.setDesc(REVIEWER_ID_DESC)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.reviewerId)
					.setValue(this.plugin.settings.reviewerId)
					.onChange(async (value) => {
						this.plugin.settings.reviewerId = normalizeReviewerId(value);
						await this.plugin.saveSettings();
					}),
			);
	}
}
