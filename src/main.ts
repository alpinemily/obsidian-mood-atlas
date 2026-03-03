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
		// Ensure customWords has entries for both lists (handles upgrades from older saves)
		this.settings.customWords = {
			combo: this.settings.customWords?.combo ?? {},
			hoffman: this.settings.customWords?.hoffman ?? {},
			nvc: this.settings.customWords?.nvc ?? {},
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
