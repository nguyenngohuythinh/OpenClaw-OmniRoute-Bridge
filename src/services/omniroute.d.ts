export declare class OmniRouteService {
    private client;
    constructor(baseUrl: string, apiKey: string);
    checkConnection(): Promise<boolean>;
    getModels(): Promise<any[]>;
}
//# sourceMappingURL=omniroute.d.ts.map