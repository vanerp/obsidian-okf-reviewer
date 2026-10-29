import { App, PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian';
import { validateDefinition, type AttributeDefinition } from './attributes';
import type OkfReviewerPlugin from './main';

export interface ReviewerSettings {
	reviewerId: string;
	/** Whether the OKF decoration layer is visible in the file explorer (feature 003 toggle). */
	showExplorerStatus: boolean;
	/** Custom frontmatter attributes the panel can add with one click (feature 004). */
	attributes: AttributeDefinition[];
}

export const DEFAULT_SETTINGS: ReviewerSettings = {
	reviewerId: 'human:reviewer',
	showExplorerStatus: true,
	attributes: [],
};

const REVIEWER_ID_NAME = 'Reviewer identity';
const REVIEWER_ID_DESC =
	'Actor recorded as `by` in verification events. Use the `human:<id>` form, e.g. human:tijs.';

const ATTRIBUTES_NAME = 'Frontmatter attributes';
const ATTRIBUTES_DESC =
	'Custom frontmatter attributes the review panel can add to the open document with one click.';

function normalizeReviewerId(value: string): string {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : DEFAULT_SETTINGS.reviewerId;
}

/** Names of all definitions except the one being edited (case-sensitive uniqueness). */
function otherNames(plugin: OkfReviewerPlugin, index: number): string[] {
	return plugin.settings.attributes
		.filter((_, i) => i !== index)
		.map((d) => d.name);
}

const NAME_DESC = 'Frontmatter key (case-sensitive).';
const DEFAULT_VALUE_DESC =
	'Value only written when the attribute is missing. A single line; JSON typed (e.g. `[1, 2]`, `3`); empty allowed.';
const ROW_DESC = `${NAME_DESC} Default: ${DEFAULT_VALUE_DESC}`;

/**
 * Shared row renderer for one attribute definition. Both setting surfaces —
 * the declarative list (Obsidian ≥1.13, via `render` definitions) and the
 * imperative `display()` fallback — go through this so they stay identical.
 *
 * Name edits validate before persisting (FR-007); rejected input shows the
 * reason in the row description and leaves the stored value untouched.
 * Valid edits persist immediately (matching `reviewerId` behavior, FR-002).
 * Passing `onDelete` adds a row delete button (FR-006); the declarative list
 * does not need it — its `onDelete` affordance handles removal at the frame
 * level.
 */
function renderAttributeRow(
	setting: Setting,
	plugin: OkfReviewerPlugin,
	index: number,
	onDelete?: (index: number) => void,
): void {
	const def = plugin.settings.attributes[index];
	if (!def) return;

	setting.settingEl.addClass('okf-reviewer-attr-setting');
	setting.setName(def.name.length > 0 ? def.name : 'New attribute');
	setting.setDesc(ROW_DESC);

	setting
		.addText((text) => {
			text.inputEl.addClass('okf-reviewer-attr-name-input');
			return text
				.setPlaceholder('Attribute name')
				.setValue(def.name)
				.onChange((value) => {
					const validation = validateDefinition(value, otherNames(plugin, index));
					if (validation.ok) {
						def.name = value.trim();
						setting.setDesc(ROW_DESC);
						void plugin.saveSettings();
					} else {
						setting.setDesc(`⚠ ${validation.reason}`);
					}
				});
		})
		.addText((text) => {
			text.inputEl.addClass('okf-reviewer-attr-default-input');
			return text
				.setPlaceholder('Default value')
				.setValue(def.defaultValue)
				.onChange((value) => {
					def.defaultValue = value;
					void plugin.saveSettings();
				});
		});
	if (onDelete) {
		setting.addExtraButton((button) =>
			button
				.setIcon('trash-2')
				.setTooltip('Delete this attribute definition')
				.onClick(() => onDelete(index)),
		);
	}
}

export class ReviewerSettingTab extends PluginSettingTab {
	plugin: OkfReviewerPlugin;

	constructor(app: App, plugin: OkfReviewerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** Append a blank definition (add affordance shared by both surfaces). */
	private appendBlankAttribute(): void {
		this.plugin.settings.attributes.push({ name: '', defaultValue: '' });
		void this.plugin.saveSettings();
		// `update()` only exists on Obsidian ≥1.13 (declarative settings); the
		// <1.13 path re-renders via `renderFallback` instead.
		// Unchecked cast: typings declare `update()` unconditionally, but the
		// runtime may predate it, so capability-check before calling.
		const declarativeTab = this as unknown as { update?: () => void };
		declarativeTab.update?.();
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
			// Each row renders imperatively (name + default inputs) so both
			// fields are editable per attribute; the list frame provides the
			// add affordance and later the delete affordance (research R5).
			{
				type: 'list',
				name: ATTRIBUTES_NAME,
				desc: ATTRIBUTES_DESC,
				aliases: ['attribute', 'frontmatter', 'default value'],
				emptyState:
					'No attributes configured. Add one below to make it available in the review panel.',
				onDelete: (index) => {
					this.plugin.settings.attributes.splice(index, 1);
					void this.plugin.saveSettings();
				},
				items: this.plugin.settings.attributes.map((def, index) => ({
					name: def.name.length > 0 ? def.name : 'New attribute',
					render: (setting) => renderAttributeRow(setting, this.plugin, index),
				})),
				addItem: {
					name: 'Add attribute',
					action: () => this.appendBlankAttribute(),
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
		this.renderFallback(this.containerEl);
	}

	private renderFallback(containerEl: HTMLElement): void {
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

		new Setting(containerEl)
			.setName(ATTRIBUTES_NAME)
			.setHeading()
			.setDesc(ATTRIBUTES_DESC);
		if (this.plugin.settings.attributes.length === 0) {
			containerEl
				.createDiv('setting-item-description')
				.setText(
					'No attributes configured. Add one below to make it available in the review panel.',
				);
		}
		for (const [index] of this.plugin.settings.attributes.entries()) {
			renderAttributeRow(new Setting(containerEl), this.plugin, index, (i) => {
				this.plugin.settings.attributes.splice(i, 1);
				void this.plugin.saveSettings();
				this.renderFallback(containerEl);
			});
		}
		new Setting(containerEl).addButton((button) =>
			button.setButtonText('Add attribute').onClick(() => {
				this.plugin.settings.attributes.push({ name: '', defaultValue: '' });
				void this.plugin.saveSettings();
				this.renderFallback(containerEl);
			}),
		);
	}
}
