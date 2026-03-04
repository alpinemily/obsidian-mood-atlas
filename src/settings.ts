import { App, PluginSettingTab, Setting } from 'obsidian';
import MoodAtlasPlugin from './main';
import hoffmanList from './emotions/hoffman.json';
import nvcList from './emotions/nvc.json';
import comboList from './emotions/hoffman-nvc-combo.json';

export type EmotionDatasourceName = 'combo' | 'hoffman' | 'nvc';

export interface MoodAtlasSettings {
	datasourceName: EmotionDatasourceName;
	customUserEmotions: Record<EmotionDatasourceName, Record<string, string[]>>;
	triggerChar: string;
}

export const DEFAULT_SETTINGS: MoodAtlasSettings = {
	datasourceName: 'combo',
	customUserEmotions: { combo: {}, hoffman: {}, nvc: {} },
	triggerChar: '^',
};

const BASE_LISTS: Record<EmotionDatasourceName, Record<string, string[]>> = {
	combo: comboList as Record<string, string[]>,
	hoffman: hoffmanList as Record<string, string[]>,
	nvc: nvcList as Record<string, string[]>,
};

export class MoodAtlasSettingTab extends PluginSettingTab {
	plugin: MoodAtlasPlugin;

	constructor(app: App, plugin: MoodAtlasPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Trigger key')
			.setDesc('Character to type after an emotion word to open suggestions.')
			.addText(text => {
				text.inputEl.maxLength = 1;
				text.setValue(this.plugin.settings.triggerChar);
				text.inputEl.addEventListener('blur', () => {
					if (!text.getValue().trim()) {
						const def = DEFAULT_SETTINGS.triggerChar;
						text.setValue(def);
						this.plugin.settings.triggerChar = def;
						void this.plugin.saveSettings();
					}
				});
				text.onChange(async (value) => {
					if (!value) return;
					this.plugin.settings.triggerChar = value;
					await this.plugin.saveSettings();
				});
			});

		const LIST_DESCS: Record<EmotionDatasourceName, string> = {
			combo: 'All emotions from Hoffman and NVC merged into one list, plus a few more.',
			hoffman: 'A list of emotions used by the Hoffman Institute.',
			nvc: 'A list of emotions from the book Nonviolent Communication.',
		};

		const listSetting = new Setting(containerEl)
			.setName('Emotion data source')
			.setDesc(LIST_DESCS[this.plugin.settings.datasourceName])
			.addDropdown(drop => drop
				.addOption('combo', 'Hoffman/NVC combined')
				.addOption('hoffman', 'Hoffman emotions')
				.addOption('nvc', 'NVC emotions')
				.setValue(this.plugin.settings.datasourceName)
				.onChange(async (value) => {
					this.plugin.settings.datasourceName = value as EmotionDatasourceName;
					listSetting.setDesc(LIST_DESCS[value as EmotionDatasourceName]);
					await this.plugin.saveSettings();
					this.plugin.suggester.rebuildLookup();
					this.display();
				}));

		new Setting(containerEl).setName('Customize emotion words').setHeading();
		containerEl.createEl('p', {
			text: 'Customize the emotions in each region by adding or removing entries. Separate each emotion with a comma. Clear a region to restore its default list.',
			cls: 'setting-item-description',
		});

		const datasourceName = this.plugin.settings.datasourceName;
		const customUserEmotions = this.plugin.settings.customUserEmotions[datasourceName];

		const capitalizeEmotionString = (value: string): string[] =>
			value.split(',').map(s => s.trim()).filter(Boolean)
				.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

		const autoResize = (el: HTMLTextAreaElement) => {
			el.setCssProps({ '--ta-height': 'auto' });
			el.setCssProps({ '--ta-height': el.scrollHeight + 'px' });
		};

		for (const [region, defaultEmotions] of Object.entries(BASE_LISTS[datasourceName])) {
			const currentEmotions = customUserEmotions[region] ?? defaultEmotions;

			new Setting(containerEl)
				.then(s => s.settingEl.addClass('mood-atlas-region-setting'))
				.setName(region)
				.addTextArea(text => {
					text.setValue(currentEmotions.join(', '));
					setTimeout(() => autoResize(text.inputEl), 0);
					text.inputEl.addEventListener('blur', () => {
						const words = capitalizeEmotionString(text.getValue());
						text.setValue(words.length ? words.join(', ') : defaultEmotions.join(', '));
						autoResize(text.inputEl);
					});
					text.onChange(async (value) => {
						const words = capitalizeEmotionString(value);

						if (words.length === 0) {
							delete customUserEmotions[region];
						} else {
							customUserEmotions[region] = words;
						}

						await this.plugin.saveSettings();
						this.plugin.suggester.rebuildLookup();
					});
				});
		}
	}
}
