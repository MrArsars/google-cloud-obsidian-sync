import { requestUrl, RequestUrlParam } from 'obsidian';
import { GCSSyncSettings } from './settings';

export class GCSClient {
    constructor(private settings: GCSSyncSettings) { }

    async uploadMultipart(filePath: string, content: ArrayBuffer, hash: string) {
        const token = await this.getAccessToken();
        if (!token) throw new Error("Не вдалося отримати доступ до Google Cloud (токен порожній)");

        const boundary = 'foo_bar_baz';
        const metadata = JSON.stringify({
            name: filePath,
            metadata: { localHash: hash }
        });

        const encoder = new TextEncoder();
        const header = encoder.encode(
            `--${boundary}\r\n` +
            `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
            `${metadata}\r\n` +
            `--${boundary}\r\n` +
            `Content-Type: application/octet-stream\r\n\r\n`
        );
        const footer = encoder.encode(`\r\n--${boundary}--\r\n`);

        const combinedBody = new Uint8Array(header.byteLength + content.byteLength + footer.byteLength);
        combinedBody.set(header, 0);
        combinedBody.set(new Uint8Array(content), header.byteLength);
        combinedBody.set(footer, header.byteLength + content.byteLength);

        const response = await requestUrl({
            url: `https://storage.googleapis.com/upload/storage/v1/b/${this.settings.bucketName}/o?uploadType=multipart`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: combinedBody.buffer
        });

        if (response.status !== 200) {
            console.error("GCS Upload Error:", response.text);
            throw new Error(`Upload failed: ${response.status}`);
        }
        return response.json;
    }

    async getMetadata(filePath: string) {
        const token = await this.getAccessToken();
        if (!token) return null;

        const response = await requestUrl({
            url: `https://storage.googleapis.com/storage/v1/b/${this.settings.bucketName}/o/${encodeURIComponent(filePath)}`,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
            throw: false
        });
        return response.status === 200 ? response.json : null;
    }

    async download(filePath: string): Promise<ArrayBuffer | null> {
        const token = await this.getAccessToken();
        if (!token) return null;

        const response = await requestUrl({
            url: `https://storage.googleapis.com/storage/v1/b/${this.settings.bucketName}/o/${encodeURIComponent(filePath)}?alt=media`,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.status === 200 ? response.arrayBuffer : null;
    }

    private async getAccessToken(): Promise<string> {
        try {
            const rs = require('jsrsasign');
            const key = JSON.parse(this.settings.serviceAccountKey);
            const now = Math.floor(Date.now() / 1000);

            const payload = {
                iss: key.client_email,
                sub: key.client_email,
                aud: 'https://oauth2.googleapis.com/token',
                exp: now + 3600,
                iat: now,
                scope: 'https://www.googleapis.com/auth/devstorage.read_write'
            };

            const sHeader = JSON.stringify({ alg: 'RS256', typ: 'JWT' });
            const sPayload = JSON.stringify(payload);
            const sJWT = rs.jws.JWS.sign("RS256", sHeader, sPayload, key.private_key);

            // ВИПРАВЛЕНО: Відправляємо як JSON, щоб уникнути помилок 400
            const response = await requestUrl({
                url: 'https://oauth2.googleapis.com/token',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                    assertion: sJWT
                })
            });

            if (response.status !== 200) {
                console.error("Помилка Google OAuth:", response.text);
                return "";
            }

            return response.json.access_token;
        } catch (e) {
            console.error("Критична помилка Auth:", e);
            return "";
        }
    }
}