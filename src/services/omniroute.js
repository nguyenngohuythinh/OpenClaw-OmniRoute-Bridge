import axios, {} from 'axios';
export class OmniRouteService {
    client;
    constructor(baseUrl, apiKey) {
        this.client = axios.create({
            baseURL: baseUrl,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
    }
    async checkConnection() {
        try {
            await this.client.get('/models');
            return true;
        }
        catch {
            return false;
        }
    }
    async getModels() {
        try {
            const response = await this.client.get('/models');
            return response.data.data;
        }
        catch (error) {
            throw new Error('Failed to fetch models: ' + error.message);
        }
    }
}
//# sourceMappingURL=omniroute.js.map