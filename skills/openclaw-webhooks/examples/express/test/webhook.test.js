const request = require('supertest');
const { app } = require('../src/index');

const VALID_TOKEN = 'test-secret-token';
process.env.OPENCLAW_HOOK_TOKEN = VALID_TOKEN;

describe('OpenClaw Webhook Handler', () => {
  describe('POST /webhooks/openclaw', () => {
    it('should accept valid agent hook with Bearer token', async () => {
      const res = await request(app)
        .post('/webhooks/openclaw')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .send({ message: 'Test message', name: 'Test' });

      expect(res.status).toBe(202);
      expect(res.body.received).toBe(true);
    });

    it('should accept valid agent hook with x-openclaw-token', async () => {
      const res = await request(app)
        .post('/webhooks/openclaw')
        .set('x-openclaw-token', VALID_TOKEN)
        .send({ message: 'Test message', name: 'Test' });

      expect(res.status).toBe(202);
      expect(res.body.received).toBe(true);
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .post('/webhooks/openclaw')
        .set('Authorization', 'Bearer wrong-token')
        .send({ message: 'Test message' });

      expect(res.status).toBe(401);
    });

    it('should reject missing token', async () => {
      const res = await request(app)
        .post('/webhooks/openclaw')
        .send({ message: 'Test message' });

      expect(res.status).toBe(401);
    });

    it('should reject query-string token', async () => {
      const res = await request(app)
        .post('/webhooks/openclaw?token=test')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .send({ message: 'Test message' });

      expect(res.status).toBe(400);
    });

    it('should reject missing message', async () => {
      const res = await request(app)
        .post('/webhooks/openclaw')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .send({ name: 'Test' });

      expect(res.status).toBe(400);
    });

    it('should handle full payload with optional fields', async () => {
      const res = await request(app)
        .post('/webhooks/openclaw')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .send({
          message: 'Summarize inbox',
          name: 'Email',
          agentId: 'hooks',
          sessionKey: 'hook:email:1',
          wakeMode: 'now',
          deliver: true,
          channel: 'slack',
          model: 'openai/gpt-5.2-mini'
        });

      expect(res.status).toBe(202);
      expect(res.body.received).toBe(true);
    });
  });

  describe('POST /webhooks/openclaw/wake', () => {
    it('should accept valid wake hook', async () => {
      const res = await request(app)
        .post('/webhooks/openclaw/wake')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .send({ text: 'Wake up!', mode: 'now' });

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });

    it('should reject missing text', async () => {
      const res = await request(app)
        .post('/webhooks/openclaw/wake')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .send({ mode: 'now' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /health', () => {
    it('should return ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
