// Generated with: mailersend-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Must be set before src/index.js reads it.
process.env.MAILERSEND_WEBHOOK_SECRET = 'test_signing_secret_value';

const {
  app,
  server,
  verifySignature,
  parseCreatedAt,
  normalizeMeta,
  MAILERSEND_TEST_SECRET,
} = require('../src/index');

const SECRET = 'test_signing_secret_value';

afterAll(() => new Promise((resolve) => server.close(() => resolve())));

/**
 * Sign a payload exactly the way MailerSend does:
 * lowercase hex HMAC-SHA256 of the RAW body, keyed with the signing secret.
 * No timestamp, no nonce, no prefix — the body alone.
 */
function sign(rawBody, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

function post(rawBody, signature) {
  const req = request(app)
    .post('/webhooks/mailersend')
    .set('Content-Type', 'application/json');
  if (signature !== undefined) req.set('Signature', signature);
  return req.send(rawBody);
}

// A realistic activity event, verbatim envelope from the MailerSend docs.
function activityEvent(type = 'activity.sent', id = crypto.randomUUID()) {
  return JSON.stringify({
    type,
    created_at: '2025-08-05T21:23:54.000000Z',
    data: {
      id,
      domain_id: 'yv69oxl5kl785kw2',
      message_id: '6892766ae78995a317577aa1',
      email_id: '6892766a8d52ba62543d5e71',
      type: type.replace('activity.', ''),
      subject: 'Test email',
      recipient: 'test@mailersend.com',
      tags: ['test', 'test2'],
      meta: [],
    },
  });
}

// The URL-validation ping. Note: `message`, NOT `data`.
const TEST_PING = JSON.stringify({
  type: 'webhook.test',
  message: 'This is a ping test message',
  created_at: '2026-03-27T07:24:20.577080Z',
});

describe('signature verification', () => {
  it('accepts a correctly signed event', async () => {
    const body = activityEvent('activity.delivered');
    const res = await post(body, sign(body));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a signature computed with the wrong secret', async () => {
    const body = activityEvent();
    const res = await post(body, sign(body, 'the_wrong_secret'));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid signature' });
  });

  it('rejects a tampered body (signature covers the raw bytes)', async () => {
    const body = activityEvent();
    const signature = sign(body);
    const tampered = body.replace('test@mailersend.com', 'attacker@example.com');

    const res = await post(tampered, signature);

    expect(res.status).toBe(401);
  });

  it('rejects a body that is only re-serialised, not changed semantically', async () => {
    // Re-serialising reorders/reformats bytes; the digest no longer matches.
    // This is the single most common MailerSend integration bug.
    const body = activityEvent();
    const signature = sign(body);
    const reserialised = JSON.stringify(JSON.parse(body), null, 2);

    const res = await post(reserialised, signature);

    expect(res.status).toBe(401);
  });

  it('returns 400 when the Signature header is missing', async () => {
    const body = activityEvent();
    const res = await post(body, undefined);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Missing Signature header' });
  });

  it('does not throw on a malformed short signature (length guard)', async () => {
    // crypto.timingSafeEqual throws RangeError on a length mismatch. Without a
    // guard this would be a 500 on attacker-controlled input.
    const body = activityEvent();
    const res = await post(body, 'x');

    expect(res.status).toBe(401);
  });

  it('does not throw on a non-hex signature of the right length', async () => {
    const body = activityEvent();
    const res = await post(body, 'z'.repeat(64));

    expect(res.status).toBe(401);
  });

  it('accepts an uppercase hex signature', async () => {
    const body = activityEvent();
    const res = await post(body, sign(body).toUpperCase());

    expect(res.status).toBe(200);
  });

  it('returns 400 for a valid signature over invalid JSON', async () => {
    const body = 'not json at all';
    const res = await post(body, sign(body));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid JSON' });
  });
});

describe('webhook.test URL-validation ping', () => {
  it('accepts the ping signed with the fixed public test secret', async () => {
    // MailerSend signs the ping with test_Am3L1GuOIc4blLUuHqAPxxwkZaJyEk8G,
    // NOT the webhook signing secret. Rejecting it means the webhook never saves.
    const res = await post(TEST_PING, sign(TEST_PING, MAILERSEND_TEST_SECRET));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('also accepts the ping signed with the webhook signing secret', async () => {
    const res = await post(TEST_PING, sign(TEST_PING, SECRET));

    expect(res.status).toBe(200);
  });

  it('rejects the ping when signed with neither secret', async () => {
    const res = await post(TEST_PING, sign(TEST_PING, 'some_other_secret'));

    expect(res.status).toBe(401);
  });

  it('does not throw on the ping envelope, which has `message` and no `data`', async () => {
    const parsed = JSON.parse(TEST_PING);
    expect(parsed.data).toBeUndefined();
    expect(parsed.message).toBe('This is a ping test message');

    const res = await post(TEST_PING, sign(TEST_PING, MAILERSEND_TEST_SECRET));
    expect(res.status).toBe(200);
  });

  it('confirms the documented test secret value', () => {
    expect(MAILERSEND_TEST_SECRET).toBe('test_Am3L1GuOIc4blLUuHqAPxxwkZaJyEk8G');
  });
});

describe('the public test secret cannot authorise a real event', () => {
  it('rejects activity.hard_bounced signed with the public test secret', async () => {
    // The test secret is published in MailerSend's docs, so anyone can forge a
    // request that verifies against it. It must only ever authorise webhook.test.
    const body = activityEvent('activity.hard_bounced');
    const res = await post(body, sign(body, MAILERSEND_TEST_SECRET));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid signature' });
  });

  it('rejects sms.failed signed with the public test secret', async () => {
    const body = JSON.stringify({
      type: 'sms.failed',
      created_at: '2025-08-05T21:23:54.000000Z',
      data: { id: 'sms_1' },
    });
    const res = await post(body, sign(body, MAILERSEND_TEST_SECRET));

    expect(res.status).toBe(401);
  });
});

describe('event handling', () => {
  const eventTypes = [
    'activity.sent',
    'activity.delivered',
    'activity.soft_bounced',
    'activity.hard_bounced',
    'activity.deferred',
    'activity.opened',
    'activity.opened_unique',
    'activity.clicked',
    'activity.clicked_unique',
    'activity.unsubscribed',
    'activity.spam_complaint',
    'activity.survey_opened',
    'activity.survey_submitted',
  ];

  it.each(eventTypes)('accepts %s', async (type) => {
    const body = activityEvent(type);
    const res = await post(body, sign(body));

    expect(res.status).toBe(200);
  });

  it('accepts sender_identity.verified with a space-separated created_at', async () => {
    const body = JSON.stringify({
      type: 'sender_identity.verified',
      created_at: '2025-08-05 22:27:14',
      data: { id: 'si_1', email: 'sender@example.com' },
    });
    const res = await post(body, sign(body));

    expect(res.status).toBe(200);
  });

  it('accepts maintenance.start and maintenance.end', async () => {
    for (const type of ['maintenance.start', 'maintenance.end']) {
      const body = JSON.stringify({
        type,
        created_at: '2025-08-05 22:27:14',
        data: { id: `mnt_${type}` },
      });
      const res = await post(body, sign(body));

      expect(res.status).toBe(200);
    }
  });

  it('accepts inbound_message.rejected with a documented rejection reason', async () => {
    const body = JSON.stringify({
      type: 'inbound_message.rejected',
      created_at: '2025-08-05T21:23:54.000000Z',
      data: { id: 'inb_1', reason: 'attachment_size_exceeded' },
    });
    const res = await post(body, sign(body));

    expect(res.status).toBe(200);
  });

  it('accepts an unknown event type without erroring', async () => {
    const body = JSON.stringify({
      type: 'some.future.event',
      created_at: '2025-08-05T21:23:54.000000Z',
      data: { id: 'future_1' },
    });
    const res = await post(body, sign(body));

    expect(res.status).toBe(200);
  });
});

describe('verifySignature', () => {
  it('returns true for a matching signature', () => {
    const body = Buffer.from('{"type":"activity.sent"}', 'utf8');
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });

  it('returns false rather than throwing for missing inputs', () => {
    const body = Buffer.from('{}', 'utf8');
    expect(verifySignature(body, '', SECRET)).toBe(false);
    expect(verifySignature(body, sign(body), '')).toBe(false);
    expect(verifySignature(null, sign(body), SECRET)).toBe(false);
  });

  it('matches the digest from the MailerSend docs sample algorithm', () => {
    // hex, not base64; raw body only, no timestamp concatenation
    const raw = '{"type":"webhook.test"}';
    const expected = crypto.createHmac('sha256', SECRET).update(raw, 'utf8').digest('hex');
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
    expect(verifySignature(raw, expected, SECRET)).toBe(true);
  });
});

describe('payload quirks', () => {
  it('parses both documented created_at formats', () => {
    const iso = parseCreatedAt('2025-08-05T21:23:54.000000Z');
    expect(iso.toISOString()).toBe('2025-08-05T21:23:54.000Z');

    // Space-separated, no timezone — must be read as UTC, not local time
    const spaced = parseCreatedAt('2025-08-05 22:27:14');
    expect(spaced.toISOString()).toBe('2025-08-05T22:27:14.000Z');
  });

  it('returns null for an unparseable created_at', () => {
    expect(parseCreatedAt('not a date')).toBeNull();
    expect(parseCreatedAt(undefined)).toBeNull();
  });

  it('normalises meta from an empty array to an object', () => {
    // MailerSend sends `"meta": []` when there is nothing to report
    expect(normalizeMeta([])).toEqual({});
    expect(normalizeMeta({ reason: 'bounced' })).toEqual({ reason: 'bounced' });
    expect(normalizeMeta(undefined)).toEqual({});
  });
});
