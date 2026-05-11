const request = require('supertest');

// Test secret — set before requiring the app
const TEST_SECRET = 'test_huggingface_webhook_secret_1234567890';
process.env.HUGGINGFACE_WEBHOOK_SECRET = TEST_SECRET;

const { app } = require('../src/index');

// Helper to build a payload that mirrors HF's real shape.
function buildPayload(scope, action, overrides = {}) {
  return {
    event: { action, scope },
    repo: {
      type: 'model',
      name: 'openai-community/gpt2',
      id: '621ffdc036468d709f17434d',
      private: false,
      url: {
        web: 'https://huggingface.co/openai-community/gpt2',
        api: 'https://huggingface.co/api/models/openai-community/gpt2',
      },
      headSha: 'c379e821c9c95d613899e8c4343e4bfee2b0c600',
      owner: { id: '628b753283ef59b5be89e937' },
    },
    webhook: { id: '6390e855e30d9209411de93b', version: 3 },
    ...overrides,
  };
}

describe('Hugging Face Webhook Handler', () => {
  describe('GET /health', () => {
    it('returns health status', async () => {
      const response = await request(app).get('/health').expect(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('POST /webhooks/huggingface — verification', () => {
    it('rejects requests without secret', async () => {
      const response = await request(app)
        .post('/webhooks/huggingface')
        .set('Content-Type', 'application/json')
        .send(buildPayload('repo', 'update'))
        .expect(401);

      expect(response.text).toBe('Unauthorized');
    });

    it('rejects requests with wrong secret', async () => {
      const response = await request(app)
        .post('/webhooks/huggingface')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Secret', 'wrong_secret')
        .send(buildPayload('repo', 'update'))
        .expect(401);

      expect(response.text).toBe('Unauthorized');
    });

    it('rejects requests with a different-length secret (timing-safe path)', async () => {
      const response = await request(app)
        .post('/webhooks/huggingface')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Secret', 'short')
        .send(buildPayload('repo', 'update'))
        .expect(401);

      expect(response.text).toBe('Unauthorized');
    });

    it('accepts requests with valid X-Webhook-Secret header', async () => {
      const response = await request(app)
        .post('/webhooks/huggingface')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Secret', TEST_SECRET)
        .send(buildPayload('repo', 'update'))
        .expect(200);

      expect(response.body).toEqual({
        received: true,
        event: 'repo.update',
        repo: 'openai-community/gpt2',
      });
    });

    it('accepts requests with valid ?secret= query parameter', async () => {
      const response = await request(app)
        .post(`/webhooks/huggingface?secret=${encodeURIComponent(TEST_SECRET)}`)
        .set('Content-Type', 'application/json')
        .send(buildPayload('repo', 'update'))
        .expect(200);

      expect(response.body.received).toBe(true);
      expect(response.body.event).toBe('repo.update');
    });

    it('rejects when event is missing', async () => {
      const response = await request(app)
        .post('/webhooks/huggingface')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Secret', TEST_SECRET)
        .send({ repo: { type: 'model', name: 'x/y' } })
        .expect(400);

      expect(response.text).toBe('Invalid payload');
    });

    it('rejects invalid JSON', async () => {
      const response = await request(app)
        .post('/webhooks/huggingface')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Secret', TEST_SECRET)
        .send('not-json{')
        .expect(400);

      expect(response.text).toBe('Invalid JSON');
    });
  });

  describe('Event scopes', () => {
    const send = (payload) =>
      request(app)
        .post('/webhooks/huggingface')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Secret', TEST_SECRET)
        .send(payload);

    it('handles scope=repo action=create', async () => {
      const res = await send(buildPayload('repo', 'create')).expect(200);
      expect(res.body.event).toBe('repo.create');
    });

    it('handles scope=repo action=update', async () => {
      const res = await send(buildPayload('repo', 'update')).expect(200);
      expect(res.body.event).toBe('repo.update');
    });

    it('handles scope=repo action=delete', async () => {
      const res = await send(buildPayload('repo', 'delete')).expect(200);
      expect(res.body.event).toBe('repo.delete');
    });

    it('handles scope=repo action=move', async () => {
      const res = await send(buildPayload('repo', 'move')).expect(200);
      expect(res.body.event).toBe('repo.move');
    });

    it('handles scope=repo.content with updatedRefs', async () => {
      const payload = buildPayload('repo.content', 'update', {
        updatedRefs: [
          {
            ref: 'refs/heads/main',
            oldSha: 'ce9a4674fa833a68d5a73ec355f0ea95eedd60b7',
            newSha: '575db8b7a51b6f85eb06eee540738584589f131c',
          },
          {
            ref: 'refs/tags/v1',
            oldSha: null,
            newSha: '575db8b7a51b6f85eb06eee540738584589f131c',
          },
          {
            ref: 'refs/heads/old',
            oldSha: 'aaaaaaaa11111111aaaaaaaa11111111aaaaaaaa',
            newSha: null,
          },
        ],
      });
      const res = await send(payload).expect(200);
      expect(res.body.event).toBe('repo.content.update');
    });

    it('handles scope=repo.config with updatedConfig', async () => {
      const payload = buildPayload('repo.config', 'update', {
        updatedConfig: { private: true },
      });
      const res = await send(payload).expect(200);
      expect(res.body.event).toBe('repo.config.update');
    });

    it('handles scope=repo.config with empty updatedConfig (unsupported key)', async () => {
      const payload = buildPayload('repo.config', 'update', {
        updatedConfig: {},
      });
      const res = await send(payload).expect(200);
      expect(res.body.event).toBe('repo.config.update');
    });

    it('handles scope=discussion action=create (Pull Request)', async () => {
      const payload = buildPayload('discussion', 'create', {
        discussion: {
          id: '6399f58518721fdd27fc9ca9',
          title: 'Update co2 emissions',
          url: { web: 'https://huggingface.co/u/r/discussions/19', api: '...' },
          status: 'open',
          author: { id: '61d2f90c3c2083e1c08af22d' },
          num: 19,
          isPullRequest: true,
          changes: { base: 'refs/heads/main' },
        },
      });
      const res = await send(payload).expect(200);
      expect(res.body.event).toBe('discussion.create');
    });

    it('handles scope=discussion action=update', async () => {
      const payload = buildPayload('discussion', 'update', {
        discussion: {
          id: 'abc',
          title: 'New title',
          url: { web: '', api: '' },
          status: 'closed',
          author: { id: 'u1' },
          num: 7,
          isPullRequest: false,
        },
      });
      const res = await send(payload).expect(200);
      expect(res.body.event).toBe('discussion.update');
    });

    it('handles scope=discussion action=delete', async () => {
      const payload = buildPayload('discussion', 'delete', {
        discussion: {
          id: 'abc',
          title: 'Spam',
          url: { web: '', api: '' },
          status: 'closed',
          author: { id: 'u1' },
          num: 9,
          isPullRequest: false,
        },
      });
      const res = await send(payload).expect(200);
      expect(res.body.event).toBe('discussion.delete');
    });

    it('handles scope=discussion.comment action=create', async () => {
      const payload = buildPayload('discussion.comment', 'create', {
        discussion: {
          id: 'abc',
          title: 't',
          url: { web: '', api: '' },
          status: 'open',
          author: { id: 'u1' },
          num: 1,
          isPullRequest: false,
        },
        comment: {
          id: 'c1',
          author: { id: 'u2' },
          content: 'Looks good!',
          hidden: false,
          url: { web: '' },
        },
      });
      const res = await send(payload).expect(200);
      expect(res.body.event).toBe('discussion.comment.create');
    });

    it('handles scope=discussion.comment with hidden comment (no content)', async () => {
      const payload = buildPayload('discussion.comment', 'update', {
        comment: {
          id: 'c1',
          author: { id: 'u2' },
          hidden: true,
          url: { web: '' },
        },
      });
      const res = await send(payload).expect(200);
      expect(res.body.event).toBe('discussion.comment.update');
    });

    it('handles unknown narrowed scope gracefully (forward-compatibility)', async () => {
      const payload = buildPayload('repo.config.dois', 'update', {
        updatedConfig: {},
      });
      const res = await send(payload).expect(200);
      expect(res.body.event).toBe('repo.config.dois.update');
    });
  });

  describe('404 Handler', () => {
    it('returns 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown').expect(404);
      expect(response.body).toEqual({ error: 'Not found' });
    });
  });
});
