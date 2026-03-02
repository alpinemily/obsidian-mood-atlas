import { App, PluginSettingTab, Setting } from 'obsidian';
import MoodAtlasPlugin from './main';

export interface MoodAtlasSettings {
	// Reserved for future settings (e.g. custom trigger char, insert format)
}

export const DEFAULT_SETTINGS: MoodAtlasSettings = {};

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
			.setName('Trigger character')
			.setDesc('Type this character after an emotion word to open the feelings wheel. Default: ^')
			.addText(text => text
				.setPlaceholder('^')
				.setValue('^')
				.setDisabled(true));

		containerEl.createEl('p', {
			text: 'Type any emotion from the feelings wheel followed by ^ to see finer-grained emotions. ' +
				'Example: "happy^" shows all emotions under Happy; "lonely^" shows Isolated and Abandoned.',
			cls: 'setting-item-description',
		});
	}
}
