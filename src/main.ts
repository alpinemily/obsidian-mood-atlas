import { Plugin } from 'obsidian';
import { EmotionSuggester } from './emotion-suggester';
import { MoodAtlasSettings, DEFAULT_SETTINGS, MoodAtlasSettingTab } from './settings';

export default class MoodAtlasPlugin extends Plugin {
	settings: MoodAtlasSettings;
	suggester: EmotionSuggester;

	async onload() {
		await this.loadSettings();

		this.suggester = new EmotionSuggester(this.app, this);
		this.registerEditorSuggest(this.suggester);

		this.addSettingTab(new MoodAtlasSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		const saved = await this.loadData() as Partial<MoodAtlasSettings>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
