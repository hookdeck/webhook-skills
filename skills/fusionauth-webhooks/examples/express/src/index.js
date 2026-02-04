// Generated with: fusionauth-webhooks skill
// https://github.com/hookdeck/webhook-skills

import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import { jwtVerify } from 'jose';

const app = express();

/**
 * Verify FusionAuth webhook signature
 * FusionAuth sends a JWT in X-FusionAuth-Signature-JWT header containing
 * a request_body_sha256 claim with the Base64-encoded SHA-256 hash of the body
 */
async function verifyFusionAuthWebhook(rawBody, signatureJwt, hmacSecret) {
  if (!signatureJwt || !hmacSecret) return false;

  try {
    // Create key from HMAC secret
    const key = new TextEncoder().encode(hmacSecret);

    // Verify JWT signature and decode
    const { payload } = await jwtVerify(signatureJwt, key, {
      algorithms: ['HS256', 'HS384', 'HS512']
    });

    // Calculate SHA-256 hash of request body
    const bodyHash = crypto
      .createHash('sha256')
      .update(rawBody)
      .digest('base64');

    // Compare hash from JWT claim with calculated hash
    return payload.request_body_sha256 === bodyHash;
  } catch (err) {
    console.error('JWT verification failed:', err.message);
    return false;
  }
}

// FusionAuth webhook endpoint - must use raw body for signature verification
app.post('/webhooks/fusionauth',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signatureJwt = req.headers['x-fusionauth-signature-jwt'];

    // If signing is enabled, verify the signature
    if (process.env.FUSIONAUTH_WEBHOOK_SECRET) {
      const isValid = await verifyFusionAuthWebhook(
        req.body,
        signatureJwt,
        process.env.FUSIONAUTH_WEBHOOK_SECRET
      );

      if (!isValid) {
        console.error('Webhook signature verification failed');
        return res.status(401).send('Invalid signature');
      }
    }

    // Parse the verified webhook body
    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch (err) {
      console.error('Failed to parse webhook body:', err.message);
      return res.status(400).send('Invalid JSON');
    }

    // Handle the event based on type
    const eventType = event.event?.type;

    switch (eventType) {
      case 'user.create':
        console.log('User created:', event.event.user?.id);
        // TODO: Sync user to external systems, send welcome email, etc.
        break;

      case 'user.update':
        console.log('User updated:', event.event.user?.id);
        // TODO: Sync user changes to external systems
        break;

      case 'user.delete':
        console.log('User deleted:', event.event.user?.id);
        // TODO: Clean up user data, handle GDPR compliance
        break;

      case 'user.deactivate':
        console.log('User deactivated:', event.event.user?.id);
        // TODO: Revoke access, notify admins
        break;

      case 'user.reactivate':
        console.log('User reactivated:', event.event.user?.id);
        // TODO: Restore access
        break;

      case 'user.login.success':
        console.log('User logged in:', event.event.user?.id);
        // TODO: Audit logging, session tracking
        break;

      case 'user.login.failed':
        console.log('Login failed for:', event.event.user?.email || 'unknown');
        // TODO: Security monitoring, rate limiting
        break;

      case 'user.registration.create':
        console.log('User registered:', event.event.user?.id, 'for app:', event.event.applicationId);
        // TODO: Provision app-specific access
        break;

      case 'user.registration.update':
        console.log('Registration updated:', event.event.user?.id);
        // TODO: Sync role changes
        break;

      case 'user.registration.delete':
        console.log('Registration deleted:', event.event.user?.id);
        // TODO: Revoke app access
        break;

      case 'user.email.verified':
        console.log('Email verified for:', event.event.user?.id);
        // TODO: Enable features requiring verified email
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    // Return 200 to acknowledge receipt
    res.json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and verifyFusionAuthWebhook for testing
export { app, verifyFusionAuthWebhook };

// Start server only when run directly (not when imported for testing)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/fusionauth`);
  });
}
