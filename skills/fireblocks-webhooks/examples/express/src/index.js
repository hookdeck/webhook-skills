// Generated with: fireblocks-webhooks skill
// https://github.com/hookdeck/webhook-skills
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { getFireblocksJWKS, verifyFireblocksWebhook } from './verify.js';

/**
 * Create the Express app. Accepts a JWKS resolver so tests can inject a local
 * key set; production uses the remote regional JWKS by default.
 */
export function createApp(jwks = getFireblocksJWKS()) {
  const app = express();

  // Fireblocks signs the RAW body — capture raw bytes, do not parse JSON first.
  app.post(
    '/webhooks/fireblocks',
    express.raw({ type: '*/*' }),
    async (req, res) => {
      const signature = req.get('Fireblocks-Webhook-Signature');
      if (!signature) {
        return res.status(400).send('Missing Fireblocks-Webhook-Signature header');
      }

      let event;
      try {
        event = await verifyFireblocksWebhook(req.body, signature, jwks);
      } catch (err) {
        console.error('Fireblocks webhook verification failed:', err.message);
        return res.status(400).send('Invalid signature');
      }

      // Dispatch on `eventType`; the resource is in `event.data`.
      switch (event.eventType) {
        case 'transaction.created':
          console.log('Transaction created:', event.data?.id ?? event.resourceId);
          // Your code: record the pending transaction
          break;

        case 'transaction.status.updated':
          console.log(
            'Transaction status updated:',
            event.data?.id ?? event.resourceId,
            '->',
            event.data?.status
          );
          // Your code: update settlement state; credit balances on COMPLETED
          break;

        case 'transaction.approval_status.updated':
          console.log(
            'Transaction approval status updated:',
            event.data?.id ?? event.resourceId
          );
          // Your code: notify approvers / gate release of funds
          break;

        default:
          console.log(`Unhandled event type: ${event.eventType}`);
      }

      // Acknowledge quickly. Fireblocks expects a 200; do heavy work async.
      res.status(200).json({ received: true });
    }
  );

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}

const app = createApp();
export default app;

// Start the server only when run directly (not when imported for testing).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/fireblocks`);
  });
}
