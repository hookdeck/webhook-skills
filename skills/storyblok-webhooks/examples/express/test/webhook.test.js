const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.STORYBLOK_WEBHOOK_SECRET = 'hello';

const { app, verifyStoryblokWebhook, entityOf } = require('../src/index');

/**
 * Generate a valid Storyblok signature: hex(HMAC-SHA1(secret, rawBody))
 */
function generateStoryblokSignature(payload, secret) {
  return crypto.createHmac('sha1', secret).update(payload).digest('hex');
}

function post(payload, { signature, contentType = 'application/json' } = {}) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const req = request(app).post('/webhooks/storyblok').set('Content-Type', contentType);
  if (signature !== null) {
    req.set('webhook-signature', signature ?? generateStoryblokSignature(body, process.env.STORYBLOK_WEBHOOK_SECRET));
  }
  return req.send(body);
}

describe('Storyblok Webhook Endpoint', () => {
  const secret = process.env.STORYBLOK_WEBHOOK_SECRET;

  describe('verifyStoryblokWebhook', () => {
    const payload = Buffer.from('{"action":"published"}');

    it('returns true for a valid signature', () => {
      expect(verifyStoryblokWebhook(payload, generateStoryblokSignature(payload, secret), secret)).toBe(true);
    });

    it('accepts an uppercase hex signature', () => {
      expect(verifyStoryblokWebhook(payload, generateStoryblokSignature(payload, secret).toUpperCase(), secret)).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      expect(verifyStoryblokWebhook(payload, 'invalid', secret)).toBe(false);
    });

    it('returns false for a signature made with a different secret', () => {
      expect(verifyStoryblokWebhook(payload, generateStoryblokSignature(payload, 'other'), secret)).toBe(false);
    });

    it('returns false when the body was altered', () => {
      const sig = generateStoryblokSignature(payload, secret);
      expect(verifyStoryblokWebhook(Buffer.from('{"action":"deleted"}'), sig, secret)).toBe(false);
    });

    it('returns false for a missing signature or secret', () => {
      expect(verifyStoryblokWebhook(payload, undefined, secret)).toBe(false);
      expect(verifyStoryblokWebhook(payload, generateStoryblokSignature(payload, secret), undefined)).toBe(false);
    });

    it('does not accept a SHA-256 signature', () => {
      const sha256 = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      expect(verifyStoryblokWebhook(payload, sha256, secret)).toBe(false);
    });
  });

  describe('entityOf', () => {
    it('distinguishes entities that share an action value', () => {
      expect(entityOf({ action: 'deleted', story_id: 1, full_slug: 'a' })).toBe('story');
      expect(entityOf({ action: 'deleted', asset_id: 1 })).toBe('asset');
      expect(entityOf({ action: 'created', story_id: 1, block_uid: 'x' })).toBe('discussion');
      expect(entityOf({ action: 'stage.changed', story_id: 1, workflow_name: 'Default' })).toBe('workflow');
    });
  });

  describe('POST /webhooks/storyblok', () => {
    it('returns 400 for a missing signature', async () => {
      const response = await post({ action: 'published', story_id: 1 }, { signature: null });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid signature' });
    });

    it('returns 400 for an invalid signature', async () => {
      const response = await post({ action: 'published', story_id: 1 }, { signature: 'deadbeef' });
      expect(response.status).toBe(400);
    });

    it('returns 200 JSON for a valid signature', async () => {
      const response = await post({
        text: 'The user a@b.co published the Story Home 2 (marketing-articles/home-2)',
        action: 'published',
        space_id: 184738,
        story_id: 166888799188279,
        full_slug: 'marketing-articles/home-2',
      });
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toEqual({ received: true, event: 'story.published' });
    });

    it('verifies regardless of request content type', async () => {
      const response = await post(
        { action: 'unpublished', space_id: 1, story_id: 2, full_slug: 'x' },
        { contentType: 'text/plain' }
      );
      expect(response.status).toBe(200);
      expect(response.body.event).toBe('story.unpublished');
    });

    it.each([
      [{ action: 'unpublished', space_id: 1, story_id: 2, full_slug: 'x' }, 'story.unpublished'],
      [{ action: 'deleted', space_id: 1, story_id: 2, full_slug: 'x' }, 'story.deleted'],
      [{ action: 'moved', space_id: 1, story_id: 2, full_slug: 'b/x', old_full_slug: 'x' }, 'story.moved'],
      [{ action: 'entries_updated', space_id: 1, datasource_slug: 'colors' }, 'datasource.entries_updated'],
      [{ action: 'entries_deleted', space_id: 1, datasource_slug: 'colors' }, 'datasource.entries_deleted'],
      [{ action: 'created', space_id: 1, asset_id: 5 }, 'asset.created'],
      [{ action: 'deleted', space_id: 1, asset_id: 5 }, 'asset.deleted'],
      [{ action: 'stage.changed', space_id: 1, story_id: 2, workflow_name: 'Default', workflow_stage_name: 'Drafting' }, 'workflow.stage.changed'],
      [{ action: 'merged', space_id: 1, release_id: 9 }, 'release.merged'],
      [{ action: 'deployed', space_id: 1, branch_id: 7 }, 'pipeline.deployed'],
    ])('dispatches %j as %s', async (payload, expected) => {
      const response = await post(payload);
      expect(response.status).toBe(200);
      expect(response.body.event).toBe(expected);
    });

    it('returns 400 for an empty body', async () => {
      const response = await request(app).post('/webhooks/storyblok').set('webhook-signature', 'abc');
      expect(response.status).toBe(400);
    });

    it('returns 400 for a validly signed body that is not JSON', async () => {
      const response = await post('not json');
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid JSON' });
    });
  });

  describe('GET /health', () => {
    it('returns health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
