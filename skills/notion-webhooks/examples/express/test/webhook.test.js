const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing the app
process.env.NOTION_VERIFICATION_TOKEN = 'secret_test_verification_token';

const app = require('../src/index');

const TOKEN = process.env.NOTION_VERIFICATION_TOKEN;

/**
 * Generate a valid Notion signature for testing.
 *
 * Mirrors the provider format: sha256=<hex(HMAC-SHA256(token, body))>.
 */
function generateNotionSignature(rawBody, token) {
  const hex = crypto
    .createHmac('sha256', token)
    .update(rawBody)
    .digest('hex');
  return `sha256=${hex}`;
}

describe('Notion Webhook Endpoint', () => {
  describe('Handshake (no signature)', () => {
    it('returns 200 and surfaces the verification_token', async () => {
      const handshake = JSON.stringify({
        verification_token: 'secret_handshake_token_xyz',
      });

      const response = await request(app)
        .post('/webhooks/notion')
        .set('Content-Type', 'application/json')
        .send(handshake);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('returns 400 when no signature and no verification_token', async () => {
      const response = await request(app)
        .post('/webhooks/notion')
        .set('Content-Type', 'application/json')
        .send('{"hello":"world"}');

      expect(response.status).toBe(400);
    });
  });

  describe('Signed deliveries', () => {
    it('returns 401 for an invalid signature', async () => {
      const payload = JSON.stringify({
        id: 'evt_1',
        type: 'page.content_updated',
        entity: { id: 'page_1', type: 'page' },
      });

      const response = await request(app)
        .post('/webhooks/notion')
        .set('Content-Type', 'application/json')
        .set('X-Notion-Signature', 'sha256=deadbeef')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('returns 401 for a tampered payload', async () => {
      const original = JSON.stringify({
        id: 'evt_1',
        type: 'page.content_updated',
        entity: { id: 'page_1' },
      });
      const signature = generateNotionSignature(original, TOKEN);

      const tampered = JSON.stringify({
        id: 'evt_1',
        type: 'page.content_updated',
        entity: { id: 'page_tampered' },
      });

      const response = await request(app)
        .post('/webhooks/notion')
        .set('Content-Type', 'application/json')
        .set('X-Notion-Signature', signature)
        .send(tampered);

      expect(response.status).toBe(401);
    });

    it('returns 200 for a valid signature', async () => {
      const payload = JSON.stringify({
        id: 'evt_valid',
        type: 'page.content_updated',
        entity: { id: 'page_valid', type: 'page' },
      });
      const signature = generateNotionSignature(payload, TOKEN);

      const response = await request(app)
        .post('/webhooks/notion')
        .set('Content-Type', 'application/json')
        .set('X-Notion-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('handles all advertised event types', async () => {
      const eventTypes = [
        'page.content_updated',
        'page.properties_updated',
        'page.created',
        'page.deleted',
        'page.locked',
        'page.moved',
        'comment.created',
        'data_source.schema_updated',
        'unknown.event.type',
      ];

      for (const type of eventTypes) {
        const payload = JSON.stringify({
          id: `evt_${type.replace(/\./g, '_')}`,
          type,
          entity: { id: 'entity_1', type: 'page' },
        });
        const signature = generateNotionSignature(payload, TOKEN);

        const response = await request(app)
          .post('/webhooks/notion')
          .set('Content-Type', 'application/json')
          .set('X-Notion-Signature', signature)
          .send(payload);

        expect(response.status).toBe(200);
      }
    });
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});

describe('verifyNotionSignature()', () => {
  const { verifyNotionSignature } = app;

  it('returns true for a valid signature', () => {
    const body = Buffer.from('{"type":"page.content_updated"}');
    const sig = generateNotionSignature(body, TOKEN);
    expect(verifyNotionSignature(body, sig, TOKEN)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const body = Buffer.from('{"type":"page.content_updated"}');
    expect(verifyNotionSignature(body, 'sha256=00', TOKEN)).toBe(false);
  });

  it('returns false when signature header is missing', () => {
    const body = Buffer.from('{"type":"page.content_updated"}');
    expect(verifyNotionSignature(body, undefined, TOKEN)).toBe(false);
  });

  it('returns false when token is missing', () => {
    const body = Buffer.from('{"type":"page.content_updated"}');
    const sig = generateNotionSignature(body, TOKEN);
    expect(verifyNotionSignature(body, sig, '')).toBe(false);
  });
});
