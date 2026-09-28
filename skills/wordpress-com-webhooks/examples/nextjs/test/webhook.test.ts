import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  POST,
  HOOKS,
  verifyUrlToken,
  parseFields,
  dedupeKey,
  dispatch,
} from '../app/webhooks/wordpress-com/route';

// The URL token is NOT a WordPress.com signature — WordPress.com signs nothing.
// It is a random value YOU add to the registered webhook URL's query string.
const TOKEN = 'test_url_token_2f1c9b7ad4e6';
const PATH = 'http://localhost:3000/webhooks/wordpress-com';

beforeEach(() => {
  process.env.WORDPRESS_COM_WEBHOOK_TOKEN = TOKEN;
  // Keep the REST fetch-back inert so tests make no network calls.
  delete process.env.WORDPRESS_COM_SITE;
});

/** Build a delivery: a flat application/x-www-form-urlencoded body. */
function formRequest(
  fields: Record<string, string>,
  { token = TOKEN as string | null } = {}
): NextRequest {
  const url = token === null ? PATH : `${PATH}?token=${encodeURIComponent(token)}`;
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
}

describe('verifyUrlToken', () => {
  it('accepts the matching token', () => {
    expect(verifyUrlToken(TOKEN)).toBe(true);
  });

  it('rejects a wrong token of the same length', () => {
    expect(verifyUrlToken('x'.repeat(TOKEN.length))).toBe(false);
  });

  it('rejects a length mismatch without throwing', () => {
    expect(verifyUrlToken(`${TOKEN}x`)).toBe(false);
  });

  it('rejects an absent token', () => {
    expect(verifyUrlToken(null)).toBe(false);
  });

  it('throws (fails closed) when WORDPRESS_COM_WEBHOOK_TOKEN is unset', () => {
    delete process.env.WORDPRESS_COM_WEBHOOK_TOKEN;
    expect(() => verifyUrlToken(TOKEN)).toThrow(/WORDPRESS_COM_WEBHOOK_TOKEN/);
  });
});

describe('parseFields', () => {
  it('parses a flat form-encoded body into strings', () => {
    const fields = parseFields(
      'hook=publish_post&ID=42&post_title=Hello+world',
      'application/x-www-form-urlencoded'
    );
    expect(fields).toEqual({ hook: 'publish_post', ID: '42', post_title: 'Hello world' });
  });

  it('groups bracket-encoded arrays such as post_category[0]', () => {
    const fields = parseFields(
      'hook=publish_post&post_category[0]=1&post_category[1]=5',
      'application/x-www-form-urlencoded'
    );
    expect(fields.post_category).toEqual(['1', '5']);
  });

  it('groups repeated keys', () => {
    const fields = parseFields('hook=publish_post&to_ping=a&to_ping=b', null);
    expect(fields.to_ping).toEqual(['a', 'b']);
  });

  it('accepts a JSON body defensively (not what WordPress.com sends)', () => {
    const fields = parseFields('{"hook":"publish_post","ID":42}', 'application/json');
    // Values are normalised to strings, matching the form-encoded path.
    expect(fields).toEqual({ hook: 'publish_post', ID: '42' });
  });

  it('throws on malformed JSON', () => {
    expect(() => parseFields('{not json', 'application/json')).toThrow();
  });
});

describe('dedupeKey', () => {
  it('keys posts on hook + ID + post_modified_gmt', () => {
    expect(
      dedupeKey(HOOKS.PUBLISH_POST, { ID: '42', post_modified_gmt: '2026-09-28 10:15:00' })
    ).toBe('publish_post:42:2026-09-28 10:15:00');
  });

  it('falls back when post_modified_gmt was not selected', () => {
    expect(dedupeKey(HOOKS.PUBLISH_PAGE, { ID: '7' })).toBe('publish_page:7:unknown');
  });

  it('keys comments on comment_ID', () => {
    expect(dedupeKey(HOOKS.COMMENT_POST, { comment_ID: '99' })).toBe('comment_post:99');
  });

  it('returns null when the id field was not selected', () => {
    expect(dedupeKey(HOOKS.PUBLISH_POST, {})).toBeNull();
    expect(dedupeKey(HOOKS.COMMENT_POST, {})).toBeNull();
  });
});

describe('dispatch', () => {
  it('routes all three documented hooks', async () => {
    await expect(dispatch('publish_post', { ID: '42' })).resolves.toMatchObject({ known: true });
    await expect(dispatch('publish_page', { ID: '7' })).resolves.toMatchObject({ known: true });
    await expect(dispatch('comment_post', { comment_ID: '99' })).resolves.toMatchObject({
      known: true,
    });
  });

  it('logs an unknown hook instead of throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(dispatch('post_updated', { ID: '1' })).resolves.toMatchObject({ known: false });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('post_updated'));
    warn.mockRestore();
  });
});

describe('POST /webhooks/wordpress-com', () => {
  it('accepts a form-encoded publish_post delivery with the correct token', async () => {
    const res = await POST(
      formRequest({
        hook: 'publish_post',
        ID: '42',
        post_title: 'Hello world',
        post_status: 'publish',
        post_url: 'https://example.wordpress.com/2026/09/28/hello-world/',
      })
    );
    expect(res.status).toBe(200);
  });

  it('accepts a publish_page delivery', async () => {
    const res = await POST(formRequest({ hook: 'publish_page', ID: '7', post_title: 'About' }));
    expect(res.status).toBe(200);
  });

  it('accepts a comment_post delivery', async () => {
    const res = await POST(
      formRequest({
        hook: 'comment_post',
        comment_ID: '99',
        comment_post_ID: '42',
        comment_approved: '0',
        comment_author: 'Anon',
        comment_content: 'Nice post',
      })
    );
    expect(res.status).toBe(200);
  });

  it('accepts a delivery carrying only the `hook` field (all others are optional)', async () => {
    const res = await POST(formRequest({ hook: 'publish_post' }));
    expect(res.status).toBe(200);
  });

  it('acknowledges an unknown hook with 200 and logs it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await POST(formRequest({ hook: 'wp_insert_post', ID: '42' }));
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('wp_insert_post'));
    warn.mockRestore();
  });

  it('also accepts a JSON body (defensive path, not what WordPress.com sends)', async () => {
    const res = await POST(
      new NextRequest(`${PATH}?token=${TOKEN}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hook: 'publish_post', ID: '42', post_title: 'Hello world' }),
      })
    );
    expect(res.status).toBe(200);
  });

  it('returns 400 when the body has no `hook` field', async () => {
    const res = await POST(formRequest({ ID: '42', post_title: 'Hello world' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a malformed JSON body', async () => {
    const res = await POST(
      new NextRequest(`${PATH}?token=${TOKEN}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 when the URL token is missing', async () => {
    const res = await POST(formRequest({ hook: 'publish_post', ID: '42' }, { token: null }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the URL token is wrong', async () => {
    const res = await POST(
      formRequest({ hook: 'publish_post', ID: '42' }, { token: 'wrong-token' })
    );
    expect(res.status).toBe(401);
  });

  it('fails CLOSED with 500 when WORDPRESS_COM_WEBHOOK_TOKEN is unset', async () => {
    delete process.env.WORDPRESS_COM_WEBHOOK_TOKEN;
    const res = await POST(formRequest({ hook: 'publish_post', ID: '42' }));
    expect(res.status).toBe(500);
  });
});
