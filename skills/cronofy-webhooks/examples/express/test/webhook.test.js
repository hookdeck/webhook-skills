const crypto = require('crypto');
const request = require('supertest');

// Cronofy's own published test vector secret. Client secrets are prefixed `CRN_`.
// This IS the HMAC key — Cronofy issues no separate webhook signing secret.
const TEST_SECRET = 'CRN_NggYusqPGLxwjw5FHOJYOqSrTPNXy8WQf14OID';
// Cronofy's second published secret, used to exercise secret rotation.
const ROTATED_SECRET = 'CRN_nGlYDFXwfSXgB9rvGNBJyfE454GGPtWIbNuPwr';

process.env.CRONOFY_CLIENT_SECRET = TEST_SECRET;
process.env.CRONOFY_DATA_CENTER_URL = 'https://api.cronofy.com';

const { app, verifyCronofyWebhook } = require('../src/index');

/** Sign a raw body exactly as Cronofy does: HMAC-SHA256, base64. */
function sign(rawBody, secret = TEST_SECRET) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
}

/** Build a notification body. Serialize once — the HMAC covers these exact bytes. */
function buildBody(type, extras = {}) {
  const notification = { type, ...(extras.notification || {}) };
  const channel = {
    channel_id: 'chn_54cf7c7cb4ad4c1027000001',
    callback_url: 'https://example.com/webhooks/cronofy',
    ...(extras.channel || {}),
  };
  return JSON.stringify({ notification, channel });
}

function post(rawBody, hmacHeader) {
  const req = request(app)
    .post('/webhooks/cronofy')
    .set('Content-Type', 'application/json; charset=utf-8');
  if (hmacHeader !== undefined) {
    req.set('Cronofy-HMAC-SHA256', hmacHeader);
  }
  return req.send(rawBody);
}

describe('Cronofy published test vectors', () => {
  // https://docs.cronofy.com/api-reference/authorization/webhook-authentication/
  const WELL_KNOWN_BODY = '{"example":"well-known"}';
  const DIGEST_1 = '5DxentQi5YSXODEzTVv06sRwJ3pULIz1KrYv20qxEK0=';
  const DIGEST_2 = 'BmQmWVuZ70ILWjr1CAt5oC7YOolgnku4WZtlrKfx/6k=';

  it('reproduces the single-secret digest from the docs', () => {
    expect(sign(WELL_KNOWN_BODY, TEST_SECRET)).toBe(DIGEST_1);
  });

  it('reproduces the second secret digest from the docs', () => {
    expect(sign(WELL_KNOWN_BODY, ROTATED_SECRET)).toBe(DIGEST_2);
  });

  it('uses standard base64, not base64url (the second digest contains "/")', () => {
    expect(DIGEST_2).toContain('/');
    expect(sign(WELL_KNOWN_BODY, ROTATED_SECRET)).not.toContain('_');
  });

  it('verifies the docs multi-secret header verbatim', () => {
    const header = `${DIGEST_1},${DIGEST_2}`;
    expect(verifyCronofyWebhook(WELL_KNOWN_BODY, header, TEST_SECRET)).toBe(true);
    expect(verifyCronofyWebhook(WELL_KNOWN_BODY, header, ROTATED_SECRET)).toBe(true);
  });
});

describe('verifyCronofyWebhook', () => {
  const body = buildBody('change', { notification: { changes_since: '2026-08-26T09:24:16Z' } });

  it('accepts a valid single signature', () => {
    expect(verifyCronofyWebhook(body, sign(body), TEST_SECRET)).toBe(true);
  });

  it('accepts a Buffer body identically to a string body', () => {
    expect(verifyCronofyWebhook(Buffer.from(body, 'utf8'), sign(body), TEST_SECRET)).toBe(true);
  });

  it('accepts when our secret is second in the rotation list', () => {
    const header = `${sign(body, ROTATED_SECRET)},${sign(body, TEST_SECRET)}`;
    expect(verifyCronofyWebhook(body, header, TEST_SECRET)).toBe(true);
  });

  it('accepts when our secret is first in the rotation list', () => {
    const header = `${sign(body, TEST_SECRET)},${sign(body, ROTATED_SECRET)}`;
    expect(verifyCronofyWebhook(body, header, TEST_SECRET)).toBe(true);
  });

  it('tolerates whitespace around list elements', () => {
    const header = ` ${sign(body, ROTATED_SECRET)} , ${sign(body, TEST_SECRET)} `;
    expect(verifyCronofyWebhook(body, header, TEST_SECRET)).toBe(true);
  });

  it('rejects a list containing only other secrets', () => {
    const header = `${sign(body, ROTATED_SECRET)},${sign(body, 'CRN_someoneelse')}`;
    expect(verifyCronofyWebhook(body, header, TEST_SECRET)).toBe(false);
  });

  it('rejects a signature computed over a different body', () => {
    expect(verifyCronofyWebhook(body, sign('{"other":true}'), TEST_SECRET)).toBe(false);
  });

  it('rejects a truncated signature without throwing on length mismatch', () => {
    const truncated = sign(body).slice(0, 20);
    expect(() => verifyCronofyWebhook(body, truncated, TEST_SECRET)).not.toThrow();
    expect(verifyCronofyWebhook(body, truncated, TEST_SECRET)).toBe(false);
  });

  it('rejects a missing header or missing secret', () => {
    expect(verifyCronofyWebhook(body, '', TEST_SECRET)).toBe(false);
    expect(verifyCronofyWebhook(body, undefined, TEST_SECRET)).toBe(false);
    expect(verifyCronofyWebhook(body, sign(body), '')).toBe(false);
  });

  it('rejects a base64url-encoded digest', () => {
    const urlSafe = crypto
      .createHmac('sha256', ROTATED_SECRET)
      .update('{"example":"well-known"}')
      .digest('base64url');
    expect(verifyCronofyWebhook('{"example":"well-known"}', urlSafe, ROTATED_SECRET)).toBe(false);
  });

  it('is sensitive to whitespace changes in the body (raw bytes are signed)', () => {
    const reserialized = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyCronofyWebhook(reserialized, sign(body), TEST_SECRET)).toBe(false);
  });

  // Empty candidates are filtered out.
  it('rejects a header of only separators', () => {
    expect(verifyCronofyWebhook(body, ' , ', TEST_SECRET)).toBe(false);
    expect(verifyCronofyWebhook(body, '', TEST_SECRET)).toBe(false);
    expect(verifyCronofyWebhook(body, ',,,', TEST_SECRET)).toBe(false);
  });
});

describe('POST /webhooks/cronofy', () => {
  it('accepts a verification notification with a valid signature', async () => {
    const body = buildBody('verification');
    const res = await post(body, sign(body));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a change notification and exposes changes_since', async () => {
    const body = buildBody('change', {
      notification: { changes_since: '2026-08-26T09:24:16Z' },
      channel: {
        filters: { calendar_ids: ['cal_n23kjnwrw2_sakdnawerd3'], only_managed: false },
      },
    });
    const res = await post(body, sign(body));

    expect(res.status).toBe(200);
    // The payload carries no events — it's a ping. changes_since drives Read Events.
    expect(JSON.parse(body).notification.changes_since).toBe('2026-08-26T09:24:16Z');
  });

  it.each([
    'profile_disconnected',
    'conferencing_profile_disconnected',
    'profile_initial_sync_completed',
    'gdpr_requested',
  ])('accepts a %s notification', async (type) => {
    const body = buildBody(type);
    const res = await post(body, sign(body));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('returns 200 for an unknown notification type (forward compatibility)', async () => {
    // Cronofy: "your code should be tolerant of others, by ignoring them".
    const body = buildBody('some_future_type');
    const res = await post(body, sign(body));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a delivery signed during a secret rotation', async () => {
    const body = buildBody('change', { notification: { changes_since: '2026-08-26T09:24:16Z' } });
    const header = `${sign(body, ROTATED_SECRET)},${sign(body, TEST_SECRET)}`;
    const res = await post(body, header);

    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature with 400', async () => {
    const body = buildBody('change', { notification: { changes_since: '2026-08-26T09:24:16Z' } });
    const res = await post(body, sign(body, 'CRN_wrongsecret'));

    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('rejects a missing signature header with 400', async () => {
    const body = buildBody('verification');
    const res = await post(body, undefined);

    expect(res.status).toBe(400);
    expect(res.text).toBe('Missing signature header');
  });

  it('rejects a tampered body with 400', async () => {
    const original = buildBody('verification');
    const tampered = buildBody('gdpr_requested');
    const res = await post(tampered, sign(original));

    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('rejects invalid JSON that is correctly signed with 400', async () => {
    const body = 'not json at all';
    const res = await post(body, sign(body));

    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid JSON');
  });

  it('rejects a signed body missing notification.type with 400', async () => {
    const body = JSON.stringify({ channel: { channel_id: 'chn_1' } });
    const res = await post(body, sign(body));

    expect(res.status).toBe(400);
    expect(res.text).toBe('Missing notification.type');
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
