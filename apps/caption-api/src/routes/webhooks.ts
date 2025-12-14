import express, { Router, type IRouter } from 'express';
import { PolarWebhookService } from '../services/polar/webhook.service';

const router: IRouter = Router();

// Polar.sh webhook endpoint
// Important: Must use raw body parser for signature verification
router.post(
  '/polar',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    await PolarWebhookService.handleWebhook(req, res);
  }
);

export default router;
