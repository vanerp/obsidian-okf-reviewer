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
	'Attributes the review panel can add to the open document with one click.';
const ATTRIBUTE_FIELDS_NAME = 'Name and default value';
const ADD_ATTRIBUTE_NAME = 'Add attribute';
const ATTRIBUTE_FIELDS_DESC =
	'Left: the frontmatter key (case-sensitive). Right: the value written when the ' +
	'panel adds the key; existing keys are never overwritten. JSON is typed ' +
	'(e.g. 3, true, [1, 2]), anything else is written as text, and empty is allowed.';
const ATTRIBUTES_EMPTY =
	'No attributes configured yet. Click + to add one.';

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

/**
 * Shared row renderer for one attribute definition. Both setting surfaces —
 * the declarative list (Obsidian ≥1.13, via `render` definitions) and the
 * imperative `display()` fallback — go through this so they stay identical.
 *
 * Rows carry no help text of their own — the section description explains
 * both fields once. Name edits validate before persisting (FR-007); rejected
 * input shows the reason as the row description and leaves the stored value
 * untouched.
 * Valid edits persist immediately (matching `reviewerId` behavior, FR-002).
 * `onDelete` backs the row's delete button (FR-006).
 */
function renderAttributeRow(
	setting: Setting,
	plugin: OkfReviewerPlugin,
	index: number,
	onDelete: (index: number) => void,
): void {
	const def = plugin.settings.attributes[index];
	if (!def) return;

	setting.settingEl.addClass('okf-reviewer-attr-setting');
	setting.setDesc('');

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
						setting.setDesc('');
						void plugin.saveSettings();
					} else {
						setting.setDesc(`⚠ ${validation.reason}`);
					}
				});
		})
		.addText((text) => {
			text.inputEl.addClass('okf-reviewer-attr-default-input');
			return text
				.setPlaceholder('Default value (optional)')
				.setValue(def.defaultValue)
				.onChange((value) => {
					def.defaultValue = value;
					void plugin.saveSettings();
				});
		});
	setting.addExtraButton((button) =>
		button
			.setIcon('trash-2')
			.setTooltip('Delete this attribute definition')
			.onClick(() => onDelete(index)),
	);
}

/**
 * The add affordance: a row with a right-aligned + button, placed between
 * the section description and the attribute rows. Its top border is the
 * divider below the description. With no attributes yet, the row also
 * carries the empty-state hint on its left.
 */
function renderAddAttributeRow(setting: Setting, empty: boolean, onAdd: () => void): void {
	setting.settingEl.addClass('okf-reviewer-attr-add');
	if (empty) {
		setting.settingEl.addClass('okf-reviewer-attr-add-empty');
		setting.setDesc(ATTRIBUTES_EMPTY);
	}
	setting.addExtraButton((button) =>
		button.setIcon('plus').setTooltip(ADD_ATTRIBUTE_NAME).onClick(onAdd),
	);
}

export class ReviewerSettingTab extends PluginSettingTab {
	plugin: OkfReviewerPlugin;

	constructor(app: App, plugin: OkfReviewerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** Re-render after the attribute list changes, on either settings surface. */
	private refresh(): void {
		// `update()` only exists on Obsidian ≥1.13 (declarative settings); the
		// <1.13 path re-renders via `renderFallback` instead.
		// Unchecked cast: typings declare `update()` unconditionally, but the
		// runtime may predate it, so capability-check before calling.
		const declarativeTab = this as unknown as { update?: () => void };
		if (declarativeTab.update) declarativeTab.update();
		else this.renderFallback(this.containerEl);
	}

	/** Append a blank definition (add affordance shared by both surfaces). */
	private appendBlankAttribute(): void {
		this.plugin.settings.attributes.push({ name: '', defaultValue: '' });
		void this.plugin.saveSettings();
		this.refresh();
	}

	private deleteAttribute(index: number): void {
		this.plugin.settings.attributes.splice(index, 1);
		void this.plugin.saveSettings();
		this.refresh();
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
			// One group holds the whole section: heading, explanation, the +
			// row (its top border divides it from the explanation), then one
			// imperatively rendered row per attribute (research R5). A `list`
			// frame was not used because it cannot show a description.
			{
				type: 'group',
				heading: ATTRIBUTES_NAME,
				items: [
					{
						name: ATTRIBUTE_FIELDS_NAME,
						desc: `${ATTRIBUTES_DESC} ${ATTRIBUTE_FIELDS_DESC}`,
						aliases: ['attribute', 'frontmatter', 'default value'],
					},
					{
						name: ADD_ATTRIBUTE_NAME,
						searchable: false,
						render: (setting) =>
							renderAddAttributeRow(
								setting,
								this.plugin.settings.attributes.length === 0,
								() => this.appendBlankAttribute(),
							),
					},
					...this.plugin.settings.attributes.map((def, index) => ({
						name: def.name.length > 0 ? def.name : 'New attribute',
						render: (setting: Setting) =>
							renderAttributeRow(setting, this.plugin, index, (i) =>
								this.deleteAttribute(i),
							),
					})),
				],
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
		new Setting(containerEl)
			.setName(ATTRIBUTE_FIELDS_NAME)
			.setDesc(ATTRIBUTE_FIELDS_DESC);
		renderAddAttributeRow(
			new Setting(containerEl),
			this.plugin.settings.attributes.length === 0,
			() => this.appendBlankAttribute(),
		);
		for (const [index] of this.plugin.settings.attributes.entries()) {
			renderAttributeRow(new Setting(containerEl), this.plugin, index, (i) =>
				this.deleteAttribute(i),
			);
		}
	}
}
