import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.MAILCHIMP_WEBHOOK_SECRET = 'test_secret_value_for_unit_tests';
});

const SECRET = 'test_secret_value_for_unit_tests';
const WEBHOOK_URL = 'https://example.com/webhooks/mailchimp';

// Import the route handler after env vars are set
async function loadRoute() {
  return import('../app/webhooks/mailchimp/route');
}

// Build a form-encoded Mailchimp payload using bracket notation.
function encodeMailchimpPayload(obj: Record<string, unknown>): string {
  const params = new URLSearchParams();
  const walk = (value: unknown, prefix: string) => {
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, prefix ? `${prefix}[${k}]` : k);
      }
    } else {
      params.append(prefix, String(value));
    }
  };
  walk(obj, '');
  return params.toString();
}

function buildRequest(
  payload: Record<string, unknown>,
  opts: { secret?: string | null } = {},
): Request {
  const secret = opts.secret === undefined ? SECRET : opts.secret;
  const url = secret === null ? WEBHOOK_URL : `${WEBHOOK_URL}?secret=${encodeURIComponent(secret)}`;
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: encodeMailchimpPayload(payload),
  });
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
  it('returns true when the secret matches', async () => {
    const { verifyMailchimpSecret } = await loadRoute();
    expect(verifyMailchimpSecret(SECRET, SECRET)).toBe(true);
  });

  it('returns false for a wrong secret', async () => {
    const { verifyMailchimpSecret } = await loadRoute();
    expect(verifyMailchimpSecret('nope', SECRET)).toBe(false);
  });

  it('returns false for a missing/empty secret', async () => {
    const { verifyMailchimpSecret } = await loadRoute();
    expect(verifyMailchimpSecret(null, SECRET)).toBe(false);
    expect(verifyMailchimpSecret('', SECRET)).toBe(false);
  });

  it('returns false for a same-prefix but different-length secret', async () => {
    const { verifyMailchimpSecret } = await loadRoute();
    expect(verifyMailchimpSecret(SECRET + 'extra', SECRET)).toBe(false);
  });
});

describe('parseFormData (unit)', () => {
  it('expands bracket notation into nested objects', async () => {
    const { parseFormData } = await loadRoute();
    const params = new URLSearchParams('type=subscribe&data[id]=1&data[merges][FNAME]=Ex');
    const parsed = parseFormData(params) as any;
    expect(parsed.type).toBe('subscribe');
    expect(parsed.data.id).toBe('1');
    expect(parsed.data.merges.FNAME).toBe('Ex');
  });
});

describe('GET /webhooks/mailchimp (URL validation)', () => {
  it('returns 200 so Mailchimp can save the webhook', async () => {
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe('POST /webhooks/mailchimp', () => {
  it('returns 401 when the secret is missing', async () => {
    const { POST } = await loadRoute();
    const res = await POST(buildRequest(subscribePayload, { secret: null }) as any);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong secret', async () => {
    const { POST } = await loadRoute();
    const res = await POST(buildRequest(subscribePayload, { secret: 'wrong' }) as any);
    expect(res.status).toBe(401);
  });

  it('returns 200 for a subscribe event with a valid secret', async () => {
    const { POST } = await loadRoute();
    const res = await POST(buildRequest(subscribePayload) as any);
    expect(res.status).toBe(200);
  });

  it('handles every documented event type', async () => {
    const { POST } = await loadRoute();
    const payloads: Record<string, unknown>[] = [
      subscribePayload,
      {
        type: 'unsubscribe',
        data: { action: 'unsub', reason: 'manual', id: '8a25ff1d98', list_id: 'a6b5da1054', email: 'api@example.com', campaign_id: 'cb398d21d2' },
      },
      {
        type: 'profile',
        data: { id: '8a25ff1d98', list_id: 'a6b5da1054', email: 'api@example.com', merges: { FNAME: 'Example' } },
      },
      {
        type: 'upemail',
        data: { list_id: 'a6b5da1054', new_id: '51da8c3259', new_email: 'new@example.com', old_email: 'old@example.com' },
      },
      {
        type: 'cleaned',
        data: { list_id: 'a6b5da1054', campaign_id: '4fjk2ma9xd', reason: 'hard', email: 'bounce@example.com' },
      },
      {
        type: 'campaign',
        data: { id: '5aa2102003', subject: 'Test Campaign', status: 'sent', reason: '', list_id: 'a6b5da1054' },
      },
    ];

    for (const payload of payloads) {
      const res = await POST(buildRequest(payload) as any);
      expect(res.status).toBe(200);
    }
  });

  it('returns 200 for an unknown event type with a valid secret', async () => {
    const { POST } = await loadRoute();
    const res = await POST(buildRequest({ type: 'something_new', data: { id: '1' } }) as any);
    expect(res.status).toBe(200);
  });
});
