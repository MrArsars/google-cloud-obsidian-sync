import { App, PluginSettingTab, Setting } from "obsidian";
import GCSSyncPlugin from "./main";

export interface GCSSyncSettings {
	bucketName: string;
	serviceAccountKey: string;
}

export const DEFAULT_SETTINGS: GCSSyncSettings = {
	bucketName: '',
	serviceAccountKey: ''
}

export class GCSSyncSettingTab extends PluginSettingTab {
	plugin: GCSSyncPlugin;

	constructor(app: App, plugin: GCSSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('GCS Bucket Name')
			.addText(text => text
				.setValue(this.plugin.settings.bucketName)
				.onChange(async (value) => {
					this.plugin.settings.bucketName = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Service Account JSON')
			.setDesc('private JSON Google Cloud key')
			.addTextArea(text => text
				.setValue(this.plugin.settings.serviceAccountKey)
				.onChange(async (value) => {
					this.plugin.settings.serviceAccountKey = value;
					await this.plugin.saveSettings();
				}));
	}
}
