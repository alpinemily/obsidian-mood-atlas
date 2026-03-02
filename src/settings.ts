import { App, PluginSettingTab, Setting } from 'obsidian';
import MoodAtlasPlugin from './main';

export type WordList = 'hoffman' | 'nvc';

export interface MoodAtlasSettings {
	wordList: WordList;
}

export const DEFAULT_SETTINGS: MoodAtlasSettings = {
	wordList: 'hoffman',
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
			.setName('Emotion word list')
			.setDesc('Which list of emotions to use for suggestions.')
			.addDropdown(drop => drop
				.addOption('hoffman', 'Hoffman List')
				.addOption('nvc', 'NVC List')
				.setValue(this.plugin.settings.wordList)
				.onChange(async (value) => {
					this.plugin.settings.wordList = value as WordList;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('p', {
			text: 'Type any emotional region followed by ^ to see finer-grained emotions. ' +
				'Example: "Joyful^" shows all emotions under Joyful.',
			cls: 'setting-item-description',
		});
	}
}
