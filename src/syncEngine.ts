import { App, TFile } from 'obsidian';
import { GCSClient } from './gcsClient';
import { getHash } from './utils';

export class SyncEngine {
    private client: GCSClient;

    constructor(private app: App, settings: any) {
        this.client = new GCSClient(settings);
    }

    async syncAll() {
        const files = this.app.vault.getFiles();
        for (const file of files) {
            if (file.path.startsWith('.obsidian')) continue;
            await this.syncFile(file);
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