import axios from 'axios';
import { bridgeConfig } from '../config/bridge.config.js';
import { ApiError, required } from '../types/api.js';
import type { Connection, Model } from '../types/omniroute.js';
import { createHash } from 'node:crypto';

export function normalizeBaseUrl(value: unknown): string {
  let url: URL;
  try { url = new URL(required(value, 'baseUrl')); } catch { throw new ApiError('INVALID_BASE_URL', 'Use an HTTP(S) OmniRoute origin or /v1 URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new ApiError('INVALID_BASE_URL', 'Base URL must use HTTP(S) without credentials, query or fragment.');
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = pathname.endsWith('/v1') ? pathname : `${pathname}/v1`;
  return url.toString().replace(/\/$/, '');
}
export function connectionInput(body: any): Connection {
  return { baseUrl: normalizeBaseUrl(body?.baseUrl), apiKey: required(body?.apiKey, 'apiKey') };
}
export class OmniRouteService {
  private cache = new Map<string, { expires: number; models: Model[] }>();
  async getModels(connection: Connection, fresh = false): Promise<Model[]> {
    const key = createHash('sha256').update(connection.baseUrl).update('\0').update(connection.apiKey).digest('hex');
    const cached = this.cache.get(key);
    if (!fresh && cached && cached.expires > Date.now()) return cached.models;
    const data = await this.request(connection, '/models');
    if (!Array.isArray(data?.data) || !data.data.every((m: any) => typeof m?.id === 'string'))
      throw new ApiError('OMNIROUTE_INVALID_RESPONSE', 'OmniRoute models response is not an OpenAI model catalog.', 502);
    // Project catalog fields; never forward arbitrary upstream text or credentials to the UI.
    const models: Model[] = data.data.map((m: any) => ({ id: m.id, ...(typeof m.owned_by === 'string' ? { owned_by: m.owned_by } : {}) }));
    if (this.cache.size >= 16) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { expires: Date.now() + bridgeConfig.modelCacheMs, models });
    return models;
  }
  async health(connection: Connection) {
    try {
      const models = await this.getModels(connection);
      return { reachable: true, modelsAvailable: true, modelCount: models.length, baseUrl: connection.baseUrl, apiKeyStatus: 'not_verified', code: 'OMNIROUTE_CONNECTED' };
    } catch (error) {
      const e = error as ApiError;
      return { reachable: e.code !== 'OMNIROUTE_OFFLINE' && e.code !== 'OMNIROUTE_TIMEOUT', modelsAvailable: false,
        baseUrl: connection.baseUrl, apiKeyStatus: e.code === 'OMNIROUTE_INVALID_KEY' ? 'invalid' : 'not_verified', code: e.code };
    }
  }
  async testChat(connection: Connection, model: string, prompt: string): Promise<string> {
    const result = await this.request(connection, '/chat/completions', { model, messages: [{ role: 'user', content: prompt }], max_tokens: 50 });
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new ApiError('OMNIROUTE_INVALID_RESPONSE', 'No text was returned by the model test.', 502);
    return content.split(connection.apiKey).join('[REDACTED]');
  }
  private async request(connection: Connection, endpoint: string, body?: unknown): Promise<any> {
    try {
      const response = await axios.request({ url: connection.baseUrl + endpoint, method: body ? 'POST' : 'GET',
        ...(body ? { data: body } : {}), headers: connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {},
        timeout: bridgeConfig.requestTimeout, maxRedirects: 0, maxContentLength: 2000000, proxy: false });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if ([401, 403].includes(error.response?.status || 0)) throw new ApiError('OMNIROUTE_INVALID_KEY', 'OmniRoute rejected the API key.', 401);
        if (error.response?.status === 404) throw new ApiError('OMNIROUTE_NOT_FOUND', 'OmniRoute endpoint or model was not found. Check base URL and model.', 404);
        if (error.code === 'ECONNABORTED') throw new ApiError('OMNIROUTE_TIMEOUT', 'OmniRoute request timed out.', 504);
        if (!error.response) throw new ApiError('OMNIROUTE_OFFLINE', 'OmniRoute is offline or cannot be reached.', 503);
      }
      throw new ApiError('OMNIROUTE_REQUEST_FAILED', 'OmniRoute rejected the request. Check provider availability and limits.', 502);
    }
  }
}
