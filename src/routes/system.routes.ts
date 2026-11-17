import { Router } from 'express';
import type { HealthService } from '../services/health.service.js';
export function systemRoutes(health: HealthService) {
  const router = Router(); router.get('/health', async (_req, res) => { res.json(await health.health()); }); return router;
}
