import { Router } from 'express';
import type { OmniRouteService } from '../services/omniroute.service.js';
import { connectionInput } from '../services/omniroute.service.js';
import type { HealthService } from '../services/health.service.js';
import { required } from '../types/api.js';
export function omniRouteRoutes(omni: OmniRouteService, health: HealthService) {
  const router = Router();
  router.post('/check', async (req, res) => {
    const connection = connectionInput(req.body);
    const models = await omni.getModels(connection);
    health.remember(connection);
    res.json({ connected: true, models, apiKeyStatus: 'not_verified' });
  });
  router.post('/test', async (req, res) => {
    const result = await omni.testChat(connectionInput(req.body), required(req.body?.model, 'model'), required(req.body?.prompt, 'prompt', true));
    res.json({ success: true, result });
  });
  return router;
}
