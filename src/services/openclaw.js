import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
export class OpenClawService {
    async isInstalled() {
        try {
            execSync('openclaw --version');
            return true;
        }
        catch {
            return false;
        }
    }
    async getConfigPath() {
        return path.join(process.env.USERPROFILE || '', '.openclaw', 'config.json');
    }
    async backupConfig(configPath) {
        if (fs.existsSync(configPath)) {
            const backupPath = `${configPath}.${Date.now()}.bak`;
            fs.copyFileSync(configPath, backupPath);
        }
    }
    async updateConfig(baseUrl, apiKey, model) {
        const configPath = await this.getConfigPath();
        await this.backupConfig(configPath);
        let config = {};
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        config.providers = config.providers || [];
        const providerIndex = config.providers.findIndex((p) => p.id === 'omniroute');
        const omniProvider = {
            id: 'omniroute',
            name: 'OmniRoute',
            baseUrl: baseUrl,
            apiKey: apiKey,
            models: [model]
        };
        if (providerIndex > -1) {
            config.providers[providerIndex] = omniProvider;
        }
        else {
            config.providers.push(omniProvider);
        }
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
}
//# sourceMappingURL=openclaw.js.map