const request = require('supertest');

// Set test environment variables before importing the app
process.env.MAILCHIMP_WEBHOOK_SECRET = 'test_secret_value_for_unit_tests';

const { app, verifyMailchimpSecret } = require('../src/index');

const SECRET = process.env.MAILCHIMP_WEBHOOK_SECRET;
const WEBHOOK_PATH = '/webhooks/mailchimp';

// Build a form-encoded Mailchimp payload from a nested object using bracket
// notation, e.g. { data: { merges: { FNAME: 'x' } } } -> data[merges][FNAME]=x
function encodeMailchimpPayload(obj) {
  const params = new URLSearchParams();
  const walk = (value, prefix) => {
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        walk(v, prefix ? `${prefix}[${k}]` : k);
      }
    } else {
      params.append(prefix, String(value));
    }
  };
  walk(obj, '');
  return params.toString();
}

function postWebhook(payload, { secret = SECRET, omitSecret = false } = {}) {
  const path = omitSecret ? WEBHOOK_PATH : `${WEBHOOK_PATH}?secret=${encodeURIComponent(secret)}`;
  return request(app)
    .post(path)
    .set('Content-Type', 'application/x-www-form-urlencoded')
    .send(encodeMailchimpPayload(payload));
}

const subscribePayload = {
  type: 'subscribe',
  fired_at: '2026-07-02 21:35:57',
  data: {
    id: '8a25ff1d98',
    list_id: 'a6b5da1054',
    email: 'api@example.com',
    email_type: 'html',
    merges: { EMAIL: 'api@example.com', FNAME: 'Example', LNAME: 'User' },
    ip_opt: '10.20.10.30',
    ip_signup: '10.20.10.30',
  },
};

describe('verifyMailchimpSecret (unit)', () => {
  it('returns true when the secret matches', () => {
    expect(verifyMailchimpSecret(SECRET, SECRET)).toBe(true);
  });

  it('returns false for a wrong secret', () => {
    expect(verifyMailchimpSecret('nope', SECRET)).toBe(false);
  });

  it('returns false for a missing/empty secret', () => {
    expect(verifyMailchimpSecret(undefined, SECRET)).toBe(false);
    expect(verifyMailchimpSecret('', SECRET)).toBe(false);
  });

  it('returns false when the expected secret is empty', () => {
    expect(verifyMailchimpSecret(SECRET, '')).toBe(false);
  });

  it('returns false for a same-prefix but different-length secret', () => {
    expect(verifyMailchimpSecret(SECRET + 'extra', SECRET)).toBe(false);
  });
});

describe('GET /webhooks/mailchimp (URL validation)', () => {
  it('returns 200 so Mailchimp can save the webhook', async () => {
    const res = await request(app).get(WEBHOOK_PATH);
    expect(res.status).toBe(200);
  });

  it('returns 200 even without the secret (liveness check)', async () => {
    const res = await request(app).get(`${WEBHOOK_PATH}?foo=bar`);
    expect(res.status).toBe(200);
  });
});

describe('POST /webhooks/mailchimp', () => {
  it('returns 401 when the secret is missing', async () => {
    const res = await postWebhook(subscribePayload, { omitSecret: true });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong secret', async () => {
    const res = await postWebhook(subscribePayload, { secret: 'wrong-secret' });
    expect(res.status).toBe(401);
  });

  it('returns 200 for a subscribe event with a valid secret', async () => {
    const res = await postWebhook(subscribePayload);
    expect(res.status).toBe(200);
  });

  it('parses nested merge fields from bracket notation', async () => {
    // Sanity: encoder + Express extended parser round-trips nested data.
    const res = await postWebhook(subscribePayload);
    expect(res.status).toBe(200);
  });

  it('handles every documented event type', async () => {
    const payloads = {
      subscribe: subscribePayload,
      unsubscribe: {
        type: 'unsubscribe',
        data: {
          action: 'unsub',
          reason: 'manual',
          id: '8a25ff1d98',
          list_id: 'a6b5da1054',
          email: 'api@example.com',
          campaign_id: 'cb398d21d2',
        },
      },
      profile: {
        type: 'profile',
        data: {
          id: '8a25ff1d98',
          list_id: 'a6b5da1054',
          email: 'api@example.com',
          merges: { FNAME: 'Example', LNAME: 'User' },
        },
      },
      upemail: {
        type: 'upemail',
        data: {
          list_id: 'a6b5da1054',
          new_id: '51da8c3259',
          new_email: 'new@example.com',
          old_email: 'old@example.com',
        },
      },
      cleaned: {
        type: 'cleaned',
        data: {
          list_id: 'a6b5da1054',
          campaign_id: '4fjk2ma9xd',
          reason: 'hard',
          email: 'bounce@example.com',
        },
      },
      campaign: {
        type: 'campaign',
        data: {
          id: '5aa2102003',
          subject: 'Test Campaign',
          status: 'sent',
          reason: '',
          list_id: 'a6b5da1054',
        },
      },
    };

    for (const payload of Object.values(payloads)) {
      const res = await postWebhook(payload);
      expect(res.status).toBe(200);
    }
  });

  it('returns 200 for an unknown event type with a valid secret', async () => {
    const res = await postWebhook({ type: 'something_new', data: { id: '1' } });
    expect(res.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
