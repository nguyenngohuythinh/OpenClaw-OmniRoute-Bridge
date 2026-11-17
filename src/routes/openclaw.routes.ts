import { Router } from 'express';
import type { OpenClawService } from '../services/openclaw.service.js';
import { connectionInput } from '../services/omniroute.service.js';
import type { OmniRouteService } from '../services/omniroute.service.js';
import type { HealthService } from '../services/health.service.js';
import { ApiError, required } from '../types/api.js';
export function openclawRoutes(openclaw: OpenClawService, omni: OmniRouteService, health: HealthService) {
  const router = Router();
  router.get('/status', async (_req, res) => { res.json(await openclaw.status()); });
  router.post('/configure', async (req, res) => {
    const connection = connectionInput(req.body); const model = required(req.body?.model, 'model');
    if (req.body?.restart !== undefined && typeof req.body.restart !== 'boolean') throw new ApiError('INVALID_INPUT', 'restart must be boolean.');
    const models = await omni.getModels(connection, true);
    if (!models.some(m => m.id === model)) throw new ApiError('MODEL_UNAVAILABLE', 'Selected model is absent from the OmniRoute catalog.', 422);
    const result = await openclaw.configure(connection, model, req.body.restart === true);
    health.remember(connection);
    res.json({ success: true, message: 'Đã sao lưu, cập nhật và xác thực cấu hình OpenClaw.', ...result });
  });
  for (const action of ['start', 'stop', 'restart'] as const)
    router.post(`/${action}`, async (_req, res) => { res.json(await openclaw.runtime(action)); });
  router.get('/logs', async (req, res) => {
    const lines = req.query.lines === undefined ? 100 : Number(req.query.lines);
    if (!Number.isInteger(lines) || lines < 1 || lines > 500) throw new ApiError('INVALID_INPUT', 'lines must be an integer from 1 to 500.');
    res.json(await openclaw.getLogs(lines));
  });
  return router;
}
