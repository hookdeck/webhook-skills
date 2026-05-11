import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

const TEST_SECRET = 'test_huggingface_webhook_secret_1234567890';
process.env.HUGGINGFACE_WEBHOOK_SECRET = TEST_SECRET;

// Import after env var is set
import { POST, GET } from '../app/webhooks/huggingface/route';

function buildPayload(scope: string, action: string, overrides: Record<string, any> = {}) {
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

function createRequest(
  body: any,
  options: { headers?: Record<string, string>; query?: string; rawBody?: string } = {}
): NextRequest {
  const url = options.query
    ? `http://localhost:3000/webhooks/huggingface?${options.query}`
    : 'http://localhost:3000/webhooks/huggingface';

  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: options.rawBody ?? JSON.stringify(body),
  });
}

describe('Hugging Face Webhook Handler (Next.js)', () => {
  describe('GET /webhooks/huggingface', () => {
    it('returns health status', async () => {
      const response = await GET();
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toEqual({ status: 'ok' });
    });
  });

  describe('POST /webhooks/huggingface — verification', () => {
    it('rejects requests without secret', async () => {
      const response = await POST(createRequest(buildPayload('repo', 'update')));
      expect(response.status).toBe(401);
      expect(await response.text()).toBe('Unauthorized');
    });

    it('rejects requests with wrong secret', async () => {
      const response = await POST(
        createRequest(buildPayload('repo', 'update'), {
          headers: { 'X-Webhook-Secret': 'wrong_secret' },
        })
      );
      expect(response.status).toBe(401);
      expect(await response.text()).toBe('Unauthorized');
    });

    it('rejects requests with a different-length secret (timing-safe path)', async () => {
      const response = await POST(
        createRequest(buildPayload('repo', 'update'), {
          headers: { 'X-Webhook-Secret': 'short' },
        })
      );
      expect(response.status).toBe(401);
    });

    it('accepts requests with valid X-Webhook-Secret header', async () => {
      const response = await POST(
        createRequest(buildPayload('repo', 'update'), {
          headers: { 'X-Webhook-Secret': TEST_SECRET },
        })
      );
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toEqual({
        received: true,
        event: 'repo.update',
        repo: 'openai-community/gpt2',
      });
    });

    it('accepts requests with valid ?secret= query parameter', async () => {
      const response = await POST(
        createRequest(buildPayload('repo', 'update'), {
          query: `secret=${encodeURIComponent(TEST_SECRET)}`,
        })
      );
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
      expect(data.event).toBe('repo.update');
    });

    it('rejects when event is missing', async () => {
      const response = await POST(
        createRequest({ repo: { type: 'model', name: 'x/y' } }, {
          headers: { 'X-Webhook-Secret': TEST_SECRET },
        })
      );
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid payload');
    });

    it('rejects invalid JSON', async () => {
      const response = await POST(
        createRequest(null, {
          headers: { 'X-Webhook-Secret': TEST_SECRET },
          rawBody: 'not-json{',
        })
      );
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid JSON');
    });
  });

  describe('Event scopes', () => {
    const send = (payload: any) =>
      POST(
        createRequest(payload, {
          headers: { 'X-Webhook-Secret': TEST_SECRET },
        })
      );

    it('handles scope=repo action=create', async () => {
      const res = await send(buildPayload('repo', 'create'));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.event).toBe('repo.create');
    });

    it('handles scope=repo action=update', async () => {
      const res = await send(buildPayload('repo', 'update'));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.event).toBe('repo.update');
    });

    it('handles scope=repo action=delete', async () => {
      const res = await send(buildPayload('repo', 'delete'));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.event).toBe('repo.delete');
    });

    it('handles scope=repo action=move', async () => {
      const res = await send(buildPayload('repo', 'move'));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.event).toBe('repo.move');
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
      const res = await send(payload);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.event).toBe('repo.content.update');
    });

    it('handles scope=repo.config with updatedConfig', async () => {
      const payload = buildPayload('repo.config', 'update', {
        updatedConfig: { private: true },
      });
      const res = await send(payload);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.event).toBe('repo.config.update');
    });

    it('handles scope=repo.config with empty updatedConfig', async () => {
      const payload = buildPayload('repo.config', 'update', { updatedConfig: {} });
      const res = await send(payload);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.event).toBe('repo.config.update');
    });

    it('handles scope=discussion action=create (Pull Request)', async () => {
      const payload = buildPayload('discussion', 'create', {
        discussion: {
          id: '6399f58518721fdd27fc9ca9',
          title: 'Update co2 emissions',
          url: { web: '...', api: '...' },
          status: 'open',
          author: { id: '61d2f90c3c2083e1c08af22d' },
          num: 19,
          isPullRequest: true,
          changes: { base: 'refs/heads/main' },
        },
      });
      const res = await send(payload);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.event).toBe('discussion.create');
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
      const res = await send(payload);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.event).toBe('discussion.update');
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
      const res = await send(payload);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.event).toBe('discussion.delete');
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
      const res = await send(payload);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.event).toBe('discussion.comment.create');
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
      const res = await send(payload);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.event).toBe('discussion.comment.update');
    });

    it('handles unknown narrowed scope gracefully (forward-compatibility)', async () => {
      const payload = buildPayload('repo.config.dois', 'update', {
        updatedConfig: {},
      });
      const res = await send(payload);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.event).toBe('repo.config.dois.update');
    });
  });
});
