import { App, TFile, TAbstractFile } from 'obsidian';
import { GCSClient } from './gcsClient';
import { getHash } from './utils';

interface SyncIndex {
    [path: string]: { localHash: string };
}

export class SyncEngine {
    private client: GCSClient;
    private indexPath: string;

    constructor(private app: App, settings: any) {
        this.client = new GCSClient(settings);
        this.indexPath = `${this.app.vault.configDir}/plugins/obsidian-gcs-sync/sync-index.json`;
    }

    private async loadIndex(): Promise<SyncIndex> {
        try {
            if (await this.app.vault.adapter.exists(this.indexPath)) {
                const data = await this.app.vault.adapter.read(this.indexPath);
                return JSON.parse(data);
            }
        } catch (e) {
            console.error("Помилка завантаження індексу:", e);
        }
        return {};
    }

    private async saveIndex(index: SyncIndex) {
        await this.app.vault.adapter.write(this.indexPath, JSON.stringify(index, null, 2));
    }

    async syncAll() {
        const index = await this.loadIndex();
        const cloudFiles = await this.client.listFiles(); // Повертає масив об'єктів з метаданими
        const localFiles = this.app.vault.getFiles();

        const localPaths = new Set(localFiles.map(f => f.path));
        const cloudPaths = new Set(cloudFiles.map(f => f.name));
        const newIndex: SyncIndex = {};

        // 1. Обробляємо те, що є в хмарі
        for (const cloudFile of cloudFiles) {
            const path = cloudFile.name;
            const isDeletedInCloud = cloudFile.metadata?.deleted === 'true';

            if (isDeletedInCloud) {
                if (localPaths.has(path)) {
                    console.log(`🗑️ Видаляємо локально (помічено як видалене в хмарі): ${path}`);
                    const file = this.app.vault.getAbstractFileByPath(path);
                    if (file) await this.app.vault.delete(file);
                }
                // Не додаємо в новий індекс
                continue;
            }

            if (!localPaths.has(path)) {
                // Файла немає локально. Питання: ти його видалив, чи це новий файл?
                if (index[path]) {
                    console.log(`📡 Помічаємо в хмарі як видалений (видалено локально): ${path}`);
                    await this.client.markAsDeleted(path);
                } else {
                    console.log(`📥 Завантажуємо новий файл з хмари: ${path}`);
                    const data = await this.downloadNewFile(path);
                    if (data) newIndex[path] = { localHash: await getHash(data) };
                }
            } else {
                // Файл є і там, і там — стандартна синхронізація
                const file = this.app.vault.getAbstractFileByPath(path) as TFile;
                const updatedHash = await this.syncFile(file, cloudFile);
                newIndex[path] = { localHash: updatedHash };
            }
        }

        // 2. Обробляємо нові локальні файли (яких ще немає в хмарі взагалі)
        for (const file of localFiles) {
            if (file.path.startsWith('.obsidian') || newIndex[file.path]) continue;

            if (!cloudPaths.has(file.path)) {
                console.log(`🚀 Новий локальний файл. Завантажуємо в хмару: ${file.path}`);
                const data = await this.app.vault.readBinary(file);
                const hash = await getHash(data);
                await this.client.uploadMultipart(file.path, data, hash);
                newIndex[file.path] = { localHash: hash };
            }
        }

        await this.saveIndex(newIndex);
        console.log("✅ Синхронізація завершена");
    }

    private async downloadNewFile(path: string): Promise<ArrayBuffer | null> {
        const data = await this.client.download(path);
        if (data) {
            const folderPath = path.split('/').slice(0, -1).join('/');
            if (folderPath && !(await this.app.vault.adapter.exists(folderPath))) {
                await this.app.vault.createFolder(folderPath);
            }
            await this.app.vault.createBinary(path, data);
            return data;
        }
        return null;
    }

    private async syncFile(file: TFile, cloudMeta: any): Promise<string> {
        const localData = await this.app.vault.readBinary(file);
        const localHash = await getHash(localData);

        const cloudHash = cloudMeta.metadata?.localHash;
        const isContentDifferent = cloudHash !== localHash;

        if (!isContentDifferent) return localHash;

        const cloudMtime = new Date(cloudMeta.updated).getTime();
        const isLocalNewer = file.stat.mtime > cloudMtime;

        if (isLocalNewer) {
            console.log(`🚀 Оновлюємо хмару: ${file.path}`);
            await this.client.uploadMultipart(file.path, localData, localHash);
            return localHash;
        } else {
            console.log(`☁️ Оновлюємо локальний файл: ${file.path}`);
            const data = await this.client.download(file.path);
            if (data) {
                await this.app.vault.modifyBinary(file, data);
                return await getHash(data);
            }
        }
        return localHash;
    }
}