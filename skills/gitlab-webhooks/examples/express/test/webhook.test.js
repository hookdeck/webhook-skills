const request = require('supertest');
const crypto = require('crypto');
const { app, server } = require('../src/index');

// Test token (legacy secret token, sent as X-Gitlab-Token)
const TEST_TOKEN = 'test_gitlab_webhook_token_1234567890';
process.env.GITLAB_WEBHOOK_TOKEN = TEST_TOKEN;

// Signing token: 'whsec_' + base64 key. This is the key from the Standard
// Webhooks reference library's published "sign function works" test vector.
const SIGNING_TOKEN = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
process.env.GITLAB_WEBHOOK_SIGNING_TOKEN = SIGNING_TOKEN;

// Generate a real GitLab (Standard Webhooks) signature, independently of the app
function sign(webhookId, timestamp, body, token = SIGNING_TOKEN) {
  const key = Buffer.from(token.replace(/^whsec_/, ''), 'base64');
  const digest = crypto
    .createHmac('sha256', key)
    .update(`${webhookId}.${timestamp}.${body}`)
    .digest('base64');
  return `v1,${digest}`;
}

function signedRequest(body, { webhookId = 'msg_test_123', timestamp, signature, extraHeaders = {} } = {}) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  return request(app)
    .post('/webhooks/gitlab')
    .set('Content-Type', 'application/json')
    .set('webhook-id', webhookId)
    .set('webhook-timestamp', String(ts))
    .set('webhook-signature', signature ?? sign(webhookId, ts, body))
    .set(extraHeaders)
    .send(body);
}

describe('GitLab Webhook Handler', () => {
  afterAll(() => {
    server.close();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('POST /webhooks/gitlab', () => {
    it('should reject requests without token', async () => {
      const response = await request(app)
        .post('/webhooks/gitlab')
        .set('Content-Type', 'application/json')
        .send({ object_kind: 'push' })
        .expect(401);

      expect(response.text).toBe('Unauthorized');
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app)
        .post('/webhooks/gitlab')
        .set('Content-Type', 'application/json')
        .set('X-Gitlab-Token', 'invalid_token')
        .send({ object_kind: 'push' })
        .expect(401);

      expect(response.text).toBe('Unauthorized');
    });

    it('should accept requests with valid token', async () => {
      const payload = {
        object_kind: 'push',
        project: {
          name: 'Test Project',
          path_with_namespace: 'namespace/test-project'
        }
      };

      const response = await request(app)
        .post('/webhooks/gitlab')
        .set('Content-Type', 'application/json')
        .set('X-Gitlab-Token', TEST_TOKEN)
        .set('X-Gitlab-Event', 'Push Hook')
        .send(payload)
        .expect(200);

      expect(response.body).toEqual({
        received: true,
        event: 'push',
        project: 'namespace/test-project'
      });
    });

    describe('Event Types', () => {
      const sendWebhook = (payload, event = 'Test Hook') => {
        return request(app)
          .post('/webhooks/gitlab')
          .set('Content-Type', 'application/json')
          .set('X-Gitlab-Token', TEST_TOKEN)
          .set('X-Gitlab-Event', event)
          .set('X-Gitlab-Instance', 'gitlab.example.com')
          .set('X-Gitlab-Event-UUID', 'test-uuid-123')
          .send(payload);
      };

      it('should handle push events', async () => {
        const payload = {
          object_kind: 'push',
          ref: 'refs/heads/main',
          before: 'abcdef1234567890abcdef1234567890abcdef12',
          after: '1234567890abcdef1234567890abcdef12345678',
          total_commits_count: 3,
          user_name: 'John Doe',
          project: {
            name: 'Test Project',
            path_with_namespace: 'namespace/test-project'
          }
        };

        const response = await sendWebhook(payload, 'Push Hook')
          .expect(200);

        expect(response.body.event).toBe('push');
      });

      it('should handle tag push events', async () => {
        const payload = {
          object_kind: 'tag_push',
          ref: 'refs/tags/v1.0.0',
          before: '0000000000000000000000000000000000000000',
          after: '1234567890abcdef1234567890abcdef12345678',
          user_name: 'Jane Doe',
          project: {
            name: 'Test Project',
            path_with_namespace: 'namespace/test-project'
          }
        };

        const response = await sendWebhook(payload, 'Tag Push Hook')
          .expect(200);

        expect(response.body.event).toBe('tag_push');
      });

      it('should handle merge request events', async () => {
        const payload = {
          object_kind: 'merge_request',
          user_name: 'John Doe',
          object_attributes: {
            iid: 42,
            title: 'Add new feature',
            state: 'opened',
            action: 'open',
            source_branch: 'feature-branch',
            target_branch: 'main'
          },
          project: {
            name: 'Test Project',
            path_with_namespace: 'namespace/test-project'
          }
        };

        const response = await sendWebhook(payload, 'Merge Request Hook')
          .expect(200);

        expect(response.body.event).toBe('merge_request');
      });

      it('should handle issue events', async () => {
        const payload = {
          object_kind: 'issue',
          user_name: 'Jane Doe',
          object_attributes: {
            iid: 123,
            title: 'Bug report',
            state: 'opened',
            action: 'open'
          },
          project: {
            name: 'Test Project',
            path_with_namespace: 'namespace/test-project'
          }
        };

        const response = await sendWebhook(payload, 'Issue Hook')
          .expect(200);

        expect(response.body.event).toBe('issue');
      });

      it('should handle pipeline events', async () => {
        const payload = {
          object_kind: 'pipeline',
          object_attributes: {
            id: 999,
            ref: 'main',
            status: 'success',
            duration: 3600,
            created_at: '2024-01-01T00:00:00Z'
          },
          project: {
            name: 'Test Project',
            path_with_namespace: 'namespace/test-project'
          }
        };

        const response = await sendWebhook(payload, 'Pipeline Hook')
          .expect(200);

        expect(response.body.event).toBe('pipeline');
      });

      it('should handle job events', async () => {
        const payload = {
          object_kind: 'build',
          build_name: 'test-job',
          build_stage: 'test',
          build_status: 'success',
          build_duration: 120,
          project_name: 'Test Project'
        };

        const response = await sendWebhook(payload, 'Job Hook')
          .expect(200);

        expect(response.body.event).toBe('build');
      });

      it('should handle note events', async () => {
        const payload = {
          object_kind: 'note',
          user_name: 'John Doe',
          object_attributes: {
            noteable_type: 'MergeRequest',
            note: 'This looks good to me!'
          },
          merge_request: {
            iid: 42
          },
          project: {
            name: 'Test Project',
            path_with_namespace: 'namespace/test-project'
          }
        };

        const response = await sendWebhook(payload, 'Note Hook')
          .expect(200);

        expect(response.body.event).toBe('note');
      });

      it('should handle wiki page events', async () => {
        const payload = {
          object_kind: 'wiki_page',
          object_attributes: {
            title: 'API Documentation',
            action: 'create',
            slug: 'api-documentation'
          },
          project: {
            name: 'Test Project',
            path_with_namespace: 'namespace/test-project'
          }
        };

        const response = await sendWebhook(payload, 'Wiki Page Hook')
          .expect(200);

        expect(response.body.event).toBe('wiki_page');
      });

      it('should handle deployment events', async () => {
        const payload = {
          object_kind: 'deployment',
          status: 'success',
          environment: 'production',
          deployable_url: 'https://example.com',
          project: {
            name: 'Test Project',
            path_with_namespace: 'namespace/test-project'
          }
        };

        const response = await sendWebhook(payload, 'Deployment Hook')
          .expect(200);

        expect(response.body.event).toBe('deployment');
      });

      it('should handle release events', async () => {
        const payload = {
          object_kind: 'release',
          action: 'create',
          name: 'Version 1.0.0',
          tag: 'v1.0.0',
          description: 'Initial release',
          project: {
            name: 'Test Project',
            path_with_namespace: 'namespace/test-project'
          }
        };

        const response = await sendWebhook(payload, 'Release Hook')
          .expect(200);

        expect(response.body.event).toBe('release');
      });

      it('should handle unknown events gracefully', async () => {
        const payload = {
          object_kind: 'unknown_event',
          project: {
            name: 'Test Project',
            path_with_namespace: 'namespace/test-project'
          }
        };

        const response = await sendWebhook(payload, 'Unknown Hook')
          .expect(200);

        expect(response.body.event).toBe('unknown_event');
      });
    });

    describe('Large Payloads', () => {
      it('should handle large payloads up to 25MB', async () => {
        // Create a payload with many commits
        const commits = Array(1000).fill(null).map((_, i) => ({
          id: `commit${i}`,
          message: `Commit message ${i}`,
          timestamp: new Date().toISOString(),
          author: {
            name: 'Test Author',
            email: 'test@example.com'
          }
        }));

        const payload = {
          object_kind: 'push',
          commits,
          project: {
            name: 'Test Project',
            path_with_namespace: 'namespace/test-project'
          }
        };

        const response = await request(app)
          .post('/webhooks/gitlab')
          .set('Content-Type', 'application/json')
          .set('X-Gitlab-Token', TEST_TOKEN)
          .send(payload)
          .expect(200);

        expect(response.body.received).toBe(true);
      });
    });

    describe('Security', () => {
      it('should use timing-safe comparison for tokens', async () => {
        // This tests that different length tokens are handled properly
        const differentLengthToken = 'short';

        const response = await request(app)
          .post('/webhooks/gitlab')
          .set('Content-Type', 'application/json')
          .set('X-Gitlab-Token', differentLengthToken)
          .send({ object_kind: 'push' })
          .expect(401);

        expect(response.text).toBe('Unauthorized');
      });
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown')
        .expect(404);

      expect(response.body).toEqual({ error: 'Not found' });
    });
  });
});

describe('GitLab signing token (Standard Webhooks)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts the published Standard Webhooks test vector', async () => {
    // Vector from standard-webhooks libraries/javascript/src/webhook.test.ts
    jest.spyOn(Date, 'now').mockReturnValue(1614265330 * 1000);
    const response = await signedRequest('{"test": 2432232314}', {
      webhookId: 'msg_p5jXN8AQM9LWM0D4loKWxJek',
      timestamp: 1614265330,
      signature: 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
    });
    expect(response.status).toBe(200);
  });

  it('accepts a valid signature without any X-Gitlab-Token', async () => {
    const body = JSON.stringify({ object_kind: 'push', project: { path_with_namespace: 'ns/p' } });
    const response = await signedRequest(body);
    expect(response.status).toBe(200);
    expect(response.body.event).toBe('push');
  });

  it('accepts when one of several space-separated signatures matches', async () => {
    const body = JSON.stringify({ object_kind: 'push' });
    const ts = Math.floor(Date.now() / 1000);
    const signature = `v1,bm90IHRoZSByaWdodCBzaWduYXR1cmU= ${sign('msg_test_123', ts, body)}`;
    const response = await signedRequest(body, { timestamp: ts, signature });
    expect(response.status).toBe(200);
  });

  it('rejects a tampered body', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const signature = sign('msg_test_123', ts, JSON.stringify({ object_kind: 'push' }));
    const response = await signedRequest(JSON.stringify({ object_kind: 'tag_push' }), { timestamp: ts, signature });
    expect(response.status).toBe(401);
  });

  it('rejects a signature made with a different signing token', async () => {
    const body = JSON.stringify({ object_kind: 'push' });
    const ts = Math.floor(Date.now() / 1000);
    const signature = sign('msg_test_123', ts, body, 'whsec_' + Buffer.from('other_key').toString('base64'));
    const response = await signedRequest(body, { timestamp: ts, signature });
    expect(response.status).toBe(401);
  });

  it('rejects a stale timestamp even when the signature matches', async () => {
    const body = JSON.stringify({ object_kind: 'push' });
    const ts = Math.floor(Date.now() / 1000) - 10 * 60;
    const response = await signedRequest(body, { timestamp: ts });
    expect(response.status).toBe(401);
  });

  it('does not fall back to X-Gitlab-Token when a signature is present but invalid', async () => {
    const body = JSON.stringify({ object_kind: 'push' });
    const response = await signedRequest(body, {
      signature: 'v1,aW52YWxpZA==',
      extraHeaders: { 'X-Gitlab-Token': TEST_TOKEN },
    });
    expect(response.status).toBe(401);
  });

  it('rejects a signature when webhook-id is missing', async () => {
    const body = JSON.stringify({ object_kind: 'push' });
    const ts = Math.floor(Date.now() / 1000);
    const response = await request(app)
      .post('/webhooks/gitlab')
      .set('Content-Type', 'application/json')
      .set('webhook-timestamp', String(ts))
      .set('webhook-signature', sign('msg_test_123', ts, body))
      .send(body);
    expect(response.status).toBe(401);
  });
});
