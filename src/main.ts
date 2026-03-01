import { Plugin, Notice } from 'obsidian';
import { GCSSyncSettings, DEFAULT_SETTINGS, GCSSyncSettingTab } from './settings';
import { SyncEngine } from './syncEngine';

export default class GCSSyncPlugin extends Plugin {
    settings: GCSSyncSettings;

    async onload() {
        await this.loadSettings();

        this.addRibbonIcon('cloud', 'GCS Sync', async () => {
            new Notice('Синхронізація...');
            const engine = new SyncEngine(this.app, this.settings);
            await engine.syncAll();
            new Notice('Готово!');
        });

        this.addSettingTab(new GCSSyncSettingTab(this.app, this));
    }

    async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
    async saveSettings() { await this.saveData(this.settings); }
}