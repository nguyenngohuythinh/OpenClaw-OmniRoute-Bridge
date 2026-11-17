import express from 'express';
import type { ErrorRequestHandler } from 'express';
import path from 'node:path';
import { bridgeConfig, projectRoot } from './config/bridge.config.js';
import { ProcessService } from './services/process.service.js';
import { ConfigService } from './services/config.service.js';
import { OpenClawService } from './services/openclaw.service.js';
import { OmniRouteService } from './services/omniroute.service.js';
import { HealthService } from './services/health.service.js';
import { LogService } from './services/log.service.js';
import { systemRoutes } from './routes/system.routes.js';
import { openclawRoutes } from './routes/openclaw.routes.js';
import { omniRouteRoutes } from './routes/omniroute.routes.js';
import { ApiError } from './types/api.js';

export function createApp(cli = new ProcessService()) {
  const app = express();
  const logs = new LogService();
  const config = new ConfigService(cli);
  const openclaw = new OpenClawService(cli, config, logs);
  const omni = new OmniRouteService(); const health = new HealthService(openclaw, omni);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'");
    const host = req.headers.host || '';
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return next(new ApiError('INVALID_HOST', 'Use the local Bridge address.', 403));
    next();
  });
  // Public GET/HEAD handlers must allow navigation from external links. Host
  // validation still runs first; other requests fall through to the API guards.
  app.set('view engine', 'ejs'); app.set('views', path.join(projectRoot, 'src/views'));
  app.use(express.static(path.join(projectRoot, 'src/public')));
  app.get('/', (_req, res) => { res.render('index', { defaultBaseUrl: bridgeConfig.omniBaseUrl }); });
  app.use((req, _res, next) => {
    const host = req.headers.host || '';
    if (req.headers.origin && req.headers.origin !== `http://${host}`) return next(new ApiError('INVALID_ORIGIN', 'Cross-origin requests are not allowed.', 403));
    if (req.headers['sec-fetch-site'] === 'cross-site') return next(new ApiError('INVALID_ORIGIN', 'Cross-site requests are not allowed.', 403));
    if (req.method === 'POST' && !req.is('application/json')) return next(new ApiError('JSON_REQUIRED', 'Use application/json.', 415));
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/system', systemRoutes(health));
  app.use('/api/openclaw', openclawRoutes(openclaw, omni, health));
  app.use('/api/omniroute', omniRouteRoutes(omni, health));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const e = error instanceof ApiError ? error : error?.type === 'entity.parse.failed'
      ? new ApiError('INVALID_JSON', 'Request body is not valid JSON.', 400)
      : error?.type === 'entity.too.large'
      ? new ApiError('BODY_TOO_LARGE', 'Request body exceeds 32 KB.', 413)
      : new ApiError('REQUEST_FAILED', 'Request failed. Check input and local service availability.',
      typeof error?.status === 'number' && error.status >= 400 && error.status < 500 ? error.status : 500);
    res.status(e.status).json({ success: false, connected: false, code: e.code, error: e.message, message: e.message });
  };
  app.use(errors);
  return app;
}
