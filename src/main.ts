import { Plugin, setIcon } from 'obsidian';
import { GCSSyncSettings, DEFAULT_SETTINGS, GCSSyncSettingTab } from './settings';
import { SyncEngine } from './syncEngine';

export default class GCSSyncPlugin extends Plugin {
    settings: GCSSyncSettings;
    statusBarItem: HTMLElement;
    isSyncing = false;
    hasPendingChanges = false;
    syncEngine: SyncEngine;

    async onload() {
        await this.loadSettings();
        this.syncEngine = new SyncEngine(this.app, this.settings);
        this.statusBarItem = this.addStatusBarItem();

        this.statusBarItem.addClass('mod-clickable');

        this.statusBarItem.onClickEvent(async () => {
            if (this.isSyncing) return;
            await this.syncronize();
        });

        this.app.workspace.onLayoutReady(() => {
            this.registerEvent(this.app.vault.on('modify', () => this.setPending(true)));
            this.registerEvent(this.app.vault.on('create', () => this.setPending(true)));
            this.registerEvent(this.app.vault.on('delete', () => this.setPending(true)));
            this.checkCloudChanges().then(() => { this.updateStatus(); });
        });

        this.registerInterval(window.setInterval(() => this.checkCloudChanges(), 5 * 60 * 1000));

        //this.addRibbonIcon('cloud', 'GCS Sync', async () => { await this.syncronize(); });

        this.addSettingTab(new GCSSyncSettingTab(this.app, this));

        this.addCommand({
            id: 'manual-gcs-sync',
            name: 'Sync with Google Cloud Storage',
            callback: async () => {
                await this.syncronize();
            },
            hotkeys: [
                {
                    modifiers: ["Mod"],
                    key: "s",
                },
            ],
        });
    }

    setPending(value: boolean) {
        if (this.isSyncing) return;
        this.hasPendingChanges = value;
        this.updateStatus();
    }

    async checkCloudChanges() {
        if (this.isSyncing) return;

        const needsUpdate = await this.syncEngine.quickCheck();
        if (needsUpdate) {
            this.setPending(true);
        }
    }

    updateStatus() {
        this.statusBarItem.empty();
        this.statusBarItem.classList.remove('gcs-sync-spinning', 'gcs-sync-error');

        if (this.isSyncing) {
            setIcon(this.statusBarItem, 'refresh-cw');
            this.statusBarItem.classList.add('gcs-sync-spinning');
            this.statusBarItem.setAttr('title', 'Syncing...');
        } else if (this.hasPendingChanges) {
            setIcon(this.statusBarItem, 'refresh-cw');
            this.statusBarItem.setAttr('title', 'Changes detected (Click to sync)');
            this.statusBarItem.style.color = "var(--text-accent)";
        } else {
            setIcon(this.statusBarItem, 'cloud-check');
            this.statusBarItem.setAttr('title', 'Everything synced');
            this.statusBarItem.style.color = "";
        }
    }

    async syncronize() {
        this.isSyncing = true;
        this.updateStatus();

        try {
            await this.syncEngine.syncAll();
            this.hasPendingChanges = false;
        } catch (e) {
            this.statusBarItem.classList.add('gcs-sync-error');
        } finally {
            this.isSyncing = false;
            this.updateStatus();
        }
    }

    async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
    async saveSettings() { await this.saveData(this.settings); }
}