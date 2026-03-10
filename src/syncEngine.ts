import { App, TFile } from 'obsidian';
import { GCSClient } from './gcsClient';
import { getHash } from './utils';

export class SyncEngine {
    private client: GCSClient;

    constructor(private app: App, settings: any) {
        this.client = new GCSClient(settings);
    }

    async syncAll() {
        const cloudFiles = await this.client.listFiles();

        const localFiles = this.app.vault.getFiles();
        const localPaths = new Set(localFiles.map(f => f.path));

        for (const cloudPath of cloudFiles) {
            if (!localPaths.has(cloudPath)) {
                console.log(`📥 Новий файл у хмарі: ${cloudPath}. Завантажуємо...`);
                await this.downloadNewFile(cloudPath);
            }
        }

        for (const file of localFiles) {
            if (file.path.startsWith('.obsidian')) continue;
            await this.syncFile(file);
        }
    }

    private async downloadNewFile(path: string) {
        const data = await this.client.download(path);
        if (data) {
            const folderPath = path.split('/').slice(0, -1).join('/');
            if (folderPath && !(await this.app.vault.adapter.exists(folderPath))) {
                await this.app.vault.createFolder(folderPath);
            }
            await this.app.vault.createBinary(path, data);
        }
    }

    private async syncFile(file: TFile) {
        const localData = await this.app.vault.readBinary(file);
        const localHash = await getHash(localData);
        const cloudMeta = await this.client.getMetadata(file.path);

        const isNewInCloud = !cloudMeta;
        const isContentDifferent = isNewInCloud || cloudMeta.metadata?.localHash !== localHash;

        if (!isContentDifferent) {
            return;
        }

        const cloudMtime = isNewInCloud ? 0 : new Date(cloudMeta.updated).getTime();
        const isLocalNewer = file.stat.mtime > cloudMtime;

        if (isLocalNewer) {
            console.log(`🚀 Завантажуємо локальні зміни: ${file.path}`);
            await this.client.uploadMultipart(file.path, localData, localHash);
        } else {
            console.log(`☁️ Завантажуємо оновлення з хмари: ${file.path}`);
            const data = await this.client.download(file.path);
            if (data) {
                await this.app.vault.modifyBinary(file, data);
            }
        }
    }
}