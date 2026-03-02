import { App, PluginSettingTab, Setting } from 'obsidian';
import MoodAtlasPlugin from './main';
import hoffmanList from './emotions/hoffman.json';
import nvcList from './emotions/nvc.json';

export type WordList = 'hoffman' | 'nvc';

export interface MoodAtlasSettings {
	wordList: WordList;
	customWords: Record<WordList, Record<string, string[]>>;
	triggerChar: string;
}

export const DEFAULT_SETTINGS: MoodAtlasSettings = {
	wordList: 'hoffman',
	customWords: { hoffman: {}, nvc: {} },
	triggerChar: '^',
};

const BASE_LISTS: Record<WordList, Record<string, string[]>> = {
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

		containerEl.createEl('h2', { text: 'Mood Atlas' });

		new Setting(containerEl)
			.setName('Trigger key')
			.setDesc('Character to type after an emotion word to open suggestions.')
			.addText(text => {
				text.inputEl.maxLength = 1;
				text.setValue(this.plugin.settings.triggerChar);
				text.onChange(async (value) => {
					if (!value) return;
					this.plugin.settings.triggerChar = value;
					await this.plugin.saveSettings();
				});
			});

		const LIST_DESCS: Record<WordList, string> = {
			hoffman: 'A broad emotion wheel with 18 regions drawn from the Hoffman Process.',
			nvc: 'Feelings from Nonviolent Communication by Marshall Rosenberg, organised around needs.',
		};

		const listSetting = new Setting(containerEl)
			.setName('Emotion word list')
			.setDesc(LIST_DESCS[this.plugin.settings.wordList])
			.addDropdown(drop => drop
				.addOption('hoffman', 'Hoffman Emotions')
				.addOption('nvc', 'NVC Emotions')
				.setValue(this.plugin.settings.wordList)
				.onChange(async (value) => {
					this.plugin.settings.wordList = value as WordList;
					listSetting.setDesc(LIST_DESCS[value as WordList]);
					await this.plugin.saveSettings();
					this.plugin.suggester.rebuildLookup();
					this.display();
				}));

		containerEl.createEl('p', {
			text: `Type any emotion followed by ${this.plugin.settings.triggerChar} to see all emotions in the same region.`,
			cls: 'setting-item-description',
		});

		containerEl.createEl('h3', { text: 'Customize emotion words' });
		containerEl.createEl('p', {
			text: 'Edit the words in each region. Separate entries with commas. Clear a region to restore its defaults.',
			cls: 'setting-item-description',
		});

		const wordList = this.plugin.settings.wordList;
		const customWords = this.plugin.settings.customWords[wordList];

		const autoResize = (el: HTMLTextAreaElement) => {
			el.style.height = 'auto';
			el.style.height = el.scrollHeight + 'px';
		};

		for (const [region, defaultEmotions] of Object.entries(BASE_LISTS[wordList])) {
			const currentWords = customWords[region] ?? defaultEmotions;

			const setting = new Setting(containerEl)
				.then(s => s.settingEl.addClass('mood-atlas-region-setting'))
				.setName(region)
				.addTextArea(text => {
					text.inputEl.style.resize = 'none';
					text.inputEl.style.overflow = 'hidden';
					text.setValue(currentWords.join(', '));
					setTimeout(() => autoResize(text.inputEl), 0);
					text.inputEl.addEventListener('blur', () => {
						const normalized = text.getValue()
							.split(',')
							.map(s => s.trim())
							.filter(Boolean)
							.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
							.join(', ');
						text.setValue(normalized);
						autoResize(text.inputEl);
					});
					text.onChange(async (value) => {
						const words = value
							.split(',')
							.map(s => s.trim())
							.filter(Boolean)
							.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

						if (words.length === 0) {
							delete customWords[region];
						} else {
							customWords[region] = words;
						}

						await this.plugin.saveSettings();
						this.plugin.suggester.rebuildLookup();
					});
				});
		}
	}
}
