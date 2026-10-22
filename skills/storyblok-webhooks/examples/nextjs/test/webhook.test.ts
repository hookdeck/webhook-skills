import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { entityOf, verifyStoryblokWebhook } from '../lib/storyblok';

const SECRET = 'hello';

beforeAll(() => {
  process.env.STORYBLOK_WEBHOOK_SECRET = SECRET;
});

/**
 * Generate a valid Storyblok signature: hex(HMAC-SHA1(secret, rawBody))
 */
function generateStoryblokSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha1', secret).update(payload).digest('hex');
}

async function post(
  payload: unknown,
  opts: { signature?: string | null; contentType?: string } = {}
): Promise<Response> {
  // Import after env is set; the route reads the secret per request
  const { POST } = await import('../app/webhooks/storyblok/route');
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const headers: Record<string, string> = { 'content-type': opts.contentType ?? 'application/json' };
  if (opts.signature !== null) {
    headers['webhook-signature'] = opts.signature ?? generateStoryblokSignature(body, SECRET);
  }
  return POST(new NextRequest('http://localhost:3000/webhooks/storyblok', { method: 'POST', headers, body }));
}

describe('verifyStoryblokWebhook', () => {
  const payload = '{"action":"published"}';

  it('returns true for a valid signature', () => {
    expect(verifyStoryblokWebhook(payload, generateStoryblokSignature(payload, SECRET), SECRET)).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    expect(verifyStoryblokWebhook(payload, generateStoryblokSignature(payload, SECRET).toUpperCase(), SECRET)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifyStoryblokWebhook(payload, 'invalid', SECRET)).toBe(false);
  });

  it('returns false for a signature made with a different secret', () => {
    expect(verifyStoryblokWebhook(payload, generateStoryblokSignature(payload, 'other'), SECRET)).toBe(false);
  });

  it('returns false when the body was altered', () => {
    const sig = generateStoryblokSignature(payload, SECRET);
    expect(verifyStoryblokWebhook('{"action":"deleted"}', sig, SECRET)).toBe(false);
  });

  it('returns false for a missing signature or secret', () => {
    expect(verifyStoryblokWebhook(payload, null, SECRET)).toBe(false);
    expect(verifyStoryblokWebhook(payload, generateStoryblokSignature(payload, SECRET), undefined)).toBe(false);
  });

  it('does not accept a SHA-256 signature', () => {
    const sha256 = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    expect(verifyStoryblokWebhook(payload, sha256, SECRET)).toBe(false);
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
    expect(await response.json()).toEqual({ error: 'Invalid signature' });
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
    expect(response.headers.get('content-type')).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ received: true, event: 'story.published' });
  });

  it('verifies regardless of request content type', async () => {
    const response = await post(
      { action: 'unpublished', space_id: 1, story_id: 2, full_slug: 'x' },
      { contentType: 'text/plain' }
    );
    expect(response.status).toBe(200);
    expect((await response.json()).event).toBe('story.unpublished');
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
    expect((await response.json()).event).toBe(expected);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const response = await post('not json');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid JSON' });
  });
});
