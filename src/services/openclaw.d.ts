export declare class OpenClawService {
    isInstalled(): Promise<boolean>;
    getConfigPath(): Promise<string>;
    backupConfig(configPath: string): Promise<void>;
    updateConfig(baseUrl: string, apiKey: string, model: string): Promise<void>;
}
//# sourceMappingURL=openclaw.d.ts.map