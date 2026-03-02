import { Plugin } from 'obsidian';
import { EmotionSuggester } from './emotion-suggester';
import { MoodAtlasSettings, DEFAULT_SETTINGS, MoodAtlasSettingTab } from './settings';

export default class MoodAtlasPlugin extends Plugin {
	settings: MoodAtlasSettings;

	async onload() {
		await this.loadSettings();

		// Register the emotion suggester — fires when the user types ^ after an emotion
		this.registerEditorSuggest(new EmotionSuggester(this.app));

		this.addSettingTab(new MoodAtlasSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MoodAtlasSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
