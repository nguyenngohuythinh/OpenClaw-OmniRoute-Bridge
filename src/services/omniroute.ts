import axios, { type AxiosInstance } from 'axios';

export class OmniRouteService {
    private client: AxiosInstance;

    constructor(baseUrl: string, apiKey: string) {
        this.client = axios.create({
            baseURL: baseUrl,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
    }

    async checkConnection(): Promise<boolean> {
        try {
            await this.client.get('/models');
            return true;
        } catch {
            return false;
        }
    }

    async getModels(): Promise<any[]> {
        try {
            const response = await this.client.get('/models');
            return response.data.data;
        } catch (error: any) {
            throw new Error('Failed to fetch models: ' + error.message);
        }
    }

    async testChat(model: string, prompt: string): Promise<string> {
        try {
            const response = await this.client.post('/chat/completions', {
                model: model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 50
            });
            return response.data.choices[0].message.content;
        } catch (error: any) {
            throw new Error('Chat test failed: ' + error.message);
        }
    }

    }
