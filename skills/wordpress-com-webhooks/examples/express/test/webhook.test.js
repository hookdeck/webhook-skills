const request = require('supertest');

// The URL token is NOT a WordPress.com signature — WordPress.com signs nothing.
// It is a random value YOU add to the registered webhook URL's query string.
// The app reads it per request, so tests can unset it to prove the fail-closed path.
const TOKEN = 'test_url_token_2f1c9b7ad4e6';
process.env.WORDPRESS_COM_WEBHOOK_TOKEN = TOKEN;
// Keep the REST fetch-back inert so tests make no network calls.
delete process.env.WORDPRESS_COM_SITE;

const {
  app,
  HOOKS,
  verifyUrlToken,
  dedupeKey,
  dispatch,
} = require('../src/index');

const PATH = '/webhooks/wordpress-com';

/**
 * Build a WordPress.com delivery: a flat application/x-www-form-urlencoded body
 * whose only guaranteed field is `hook`.
 */
function formBody(fields) {
  return new URLSearchParams(fields).toString();
}

function postForm(fields, { token = TOKEN } = {}) {
  const req = request(app).post(PATH);
  if (token !== null) req.query({ token });
  return req.set('Content-Type', 'application/x-www-form-urlencoded').send(formBody(fields));
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
    expect(verifyUrlToken(undefined)).toBe(false);
  });

  it('rejects a repeated token (array value)', () => {
    expect(verifyUrlToken([TOKEN, TOKEN])).toBe(false);
  });

  it('throws (fails closed) when WORDPRESS_COM_WEBHOOK_TOKEN is unset', () => {
    delete process.env.WORDPRESS_COM_WEBHOOK_TOKEN;
    expect(() => verifyUrlToken(TOKEN)).toThrow(/WORDPRESS_COM_WEBHOOK_TOKEN/);
    process.env.WORDPRESS_COM_WEBHOOK_TOKEN = TOKEN;
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
  it('routes publish_post', async () => {
    await expect(dispatch('publish_post', { ID: '42' })).resolves.toMatchObject({ known: true });
  });

  it('routes publish_page', async () => {
    await expect(dispatch('publish_page', { ID: '7' })).resolves.toMatchObject({ known: true });
  });

  it('routes comment_post', async () => {
    await expect(dispatch('comment_post', { comment_ID: '99' })).resolves.toMatchObject({
      known: true,
    });
  });

  it('logs an unknown hook instead of throwing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(dispatch('post_updated', { ID: '1' })).resolves.toMatchObject({ known: false });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('post_updated'));
    warn.mockRestore();
  });
});

describe(`POST ${PATH}`, () => {
  it('accepts a form-encoded publish_post delivery with the correct token', async () => {
    const res = await postForm({
      hook: 'publish_post',
      ID: '42',
      post_title: 'Hello world',
      post_status: 'publish',
      post_url: 'https://example.wordpress.com/2026/09/28/hello-world/',
    });
    expect(res.status).toBe(200);
  });

  it('accepts a publish_page delivery', async () => {
    const res = await postForm({ hook: 'publish_page', ID: '7', post_title: 'About' });
    expect(res.status).toBe(200);
  });

  it('accepts a comment_post delivery', async () => {
    const res = await postForm({
      hook: 'comment_post',
      comment_ID: '99',
      comment_post_ID: '42',
      comment_approved: '0',
      comment_author: 'Anon',
      comment_content: 'Nice post',
    });
    expect(res.status).toBe(200);
  });

  it('accepts a delivery carrying only the `hook` field (all others are optional)', async () => {
    const res = await postForm({ hook: 'publish_post' });
    expect(res.status).toBe(200);
  });

  it('decodes bracket-encoded arrays such as post_category[0]', async () => {
    const res = await request(app)
      .post(PATH)
      .query({ token: TOKEN })
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('hook=publish_post&ID=42&post_category[0]=1&post_category[1]=5');
    expect(res.status).toBe(200);
  });

  it('acknowledges an unknown hook with 200 and logs it', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await postForm({ hook: 'wp_insert_post', ID: '42' });
    expect(res.status).toBe(200);
    // The dispatch runs after the acknowledgement; let the microtask queue drain.
    await new Promise((resolve) => setImmediate(resolve));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('wp_insert_post'));
    warn.mockRestore();
  });

  it('also accepts a JSON body (defensive path, not what WordPress.com sends)', async () => {
    const res = await request(app)
      .post(PATH)
      .query({ token: TOKEN })
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ hook: 'publish_post', ID: '42', post_title: 'Hello world' }));
    expect(res.status).toBe(200);
  });

  it('returns 400 when the body has no `hook` field', async () => {
    const res = await postForm({ ID: '42', post_title: 'Hello world' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a malformed JSON body', async () => {
    const res = await request(app)
      .post(PATH)
      .query({ token: TOKEN })
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
  });

  it('returns 401 when the URL token is missing', async () => {
    const res = await postForm({ hook: 'publish_post', ID: '42' }, { token: null });
    expect(res.status).toBe(401);
  });

  it('returns 401 when the URL token is wrong', async () => {
    const res = await postForm({ hook: 'publish_post', ID: '42' }, { token: 'wrong-token' });
    expect(res.status).toBe(401);
  });

  it('fails CLOSED with 500 when WORDPRESS_COM_WEBHOOK_TOKEN is unset', async () => {
    delete process.env.WORDPRESS_COM_WEBHOOK_TOKEN;
    const res = await postForm({ hook: 'publish_post', ID: '42' });
    expect(res.status).toBe(500);
    process.env.WORDPRESS_COM_WEBHOOK_TOKEN = TOKEN;
  });

  it('does not expose a GET route (WordPress.com only ever POSTs)', async () => {
    const res = await request(app).get(PATH).query({ token: TOKEN });
    expect(res.status).toBe(404);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
