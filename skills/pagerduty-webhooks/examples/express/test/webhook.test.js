// Generated with: pagerduty-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');

// Set env BEFORE requiring the app — the handler reads process.env per request,
// but the startup warning reads it at require time.
//
// PagerDuty generates this secret when the subscription is created and returns
// it as delivery_method.secret. It is an opaque ASCII string used as-is as the
// HMAC key.
process.env.PAGERDUTY_WEBHOOK_SECRET = 'cdrEvpoWXCGq3zdGkgFBdFKzLjzWLxNfLbhKnTfBNLNmPnFR';

const request = require('supertest');
const {
  app,
  verifyPagerDutySignature,
  countV1Signatures,
  describeAgent,
} = require('../src/index');

const SECRET = process.env.PAGERDUTY_WEBHOOK_SECRET;

/**
 * Generate a real X-PagerDuty-Signature exactly as PagerDuty does:
 * HMAC-SHA256 over the RAW body, keyed with the subscription secret used
 * as-is, lowercase hex (Base16), prefixed `v1=`.
 */
function sign(rawBody, secret = SECRET) {
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return `v1=${digest}`;
}

// PagerDuty's own documented incident.priority_updated example payload.
const PRIORITY_UPDATED = {
  event: {
    id: '5ac64822-4adc-4fda-ade0-410becf0de4f',
    event_type: 'incident.priority_updated',
    resource_type: 'incident',
    occurred_at: '2020-10-02T18:45:22.169Z',
    agent: {
      html_url: 'https://acme.pagerduty.com/users/PLH1HKV',
      id: 'PLH1HKV',
      self: 'https://api.pagerduty.com/users/PLH1HKV',
      summary: 'Tenex Engineer',
      type: 'user_reference',
    },
    client: { name: 'PagerDuty' },
    data: {
      id: 'PGR0VU2',
      type: 'incident',
      self: 'https://api.pagerduty.com/incidents/PGR0VU2',
      html_url: 'https://acme.pagerduty.com/incidents/PGR0VU2',
      number: 2,
      status: 'triggered',
      incident_key: 'd3640fbd41094207a1c11e58e46b1662',
      created_at: '2020-04-09T15:16:27Z',
      reopened_at: '2020-10-02T18:45:22Z',
      title: 'A little bump in the road',
      service: {
        html_url: 'https://acme.pagerduty.com/services/PF9KMXH',
        id: 'PF9KMXH',
        self: 'https://api.pagerduty.com/services/PF9KMXH',
        summary: 'API Service',
        type: 'service_reference',
      },
      assignees: [
        {
          html_url: 'https://acme.pagerduty.com/users/PTUXL6G',
          id: 'PTUXL6G',
          self: 'https://api.pagerduty.com/users/PTUXL6G',
          summary: 'User 123',
          type: 'user_reference',
        },
      ],
      escalation_policy: {
        html_url: 'https://acme.pagerduty.com/escalation_policies/PUS0KTE',
        id: 'PUS0KTE',
        self: 'https://api.pagerduty.com/escalation_policies/PUS0KTE',
        summary: 'Default',
        type: 'escalation_policy_reference',
      },
      teams: [
        {
          html_url: 'https://acme.pagerduty.com/teams/PFCVPS0',
          id: 'PFCVPS0',
          self: 'https://api.pagerduty.com/teams/PFCVPS0',
          summary: 'Engineering',
          type: 'team_reference',
        },
      ],
      priority: {
        html_url: 'https://acme.pagerduty.com/account/incident_priorities',
        id: 'PSO75BM',
        self: 'https://api.pagerduty.com/priorities/PSO75BM',
        summary: 'P1',
        type: 'priority_reference',
      },
      urgency: 'high',
      conference_bridge: {
        conference_number: '+1 1234123412,,987654321#',
        conference_url: 'https://example.com',
      },
      resolve_reason: null,
    },
  },
};

// PagerDuty's own documented service.updated example — agent AND client null.
const SERVICE_UPDATED = {
  event: {
    id: '01BRB6ZP4M6T8ZG4X6BP63ZB9O',
    event_type: 'service.updated',
    resource_type: 'service',
    occurred_at: '2021-03-02T13:35:11.682Z',
    agent: null,
    client: null,
    data: {
      html_url: 'https://acme.pagerduty.com/services/PF9KMXH',
      id: 'PF9KMXH',
      self: 'https://api.pagerduty.com/services/PF9KMXH',
      summary: 'testing service updates',
      alert_creation: 'create_alerts_and_incidents',
      teams: [
        {
          html_url: 'https://acme.pagerduty.com/teams/PFCVPS0',
          id: 'PFCVPS0',
          self: 'https://api.pagerduty.com/teams/PFCVPS0',
          summary: 'Engineering',
          type: 'team_reference',
        },
      ],
      type: 'service',
    },
  },
};

const INCIDENT_TRIGGERED = {
  event: {
    id: '0d6ad1e1-5f09-4fbb-9f4d-9b14bd7bb1b7',
    event_type: 'incident.triggered',
    resource_type: 'incident',
    occurred_at: '2024-05-01T09:12:00.000Z',
    agent: null, // automation, not a person
    client: null,
    data: {
      id: 'PGR0VU2',
      type: 'incident',
      number: 2,
      status: 'triggered',
      title: 'A little bump in the road',
      html_url: 'https://acme.pagerduty.com/incidents/PGR0VU2',
      service: { id: 'PF9KMXH', summary: 'API Service', type: 'service_reference' },
      priority: null, // priority CAN be null when none is set
      urgency: 'high',
      assignees: [],
      resolve_reason: null,
    },
  },
};

const ROLE_ASSIGNED = {
  event: {
    id: 'ff8b3a2e-2a61-4a0b-bc5a-2fd1cf2d7f5c',
    event_type: 'incident.role.assigned',
    resource_type: 'incident',
    occurred_at: '2024-05-01T09:20:00.000Z',
    agent: { id: 'PLH1HKV', summary: 'Tenex Engineer', type: 'user_reference' },
    client: null,
    data: {
      type: 'incident_role_assignment',
      incident_role_assignments: [
        {
          assignee: { id: 'P75B6QD', summary: 'User 1810194', type: 'user_reference' },
          id: 'af64b84c-137e-40c6-875c-5dd30a2afaaa',
          incident: { id: 'PBAZLIU', summary: null, type: 'incident_reference' },
          old_assignee: null,
          role: { id: 'P8PQO4R', summary: 'Role Display Name', type: 'role_reference' },
          status: 'active',
          type: 'role_assignment_reference',
        },
      ],
    },
  },
};

const ANNOTATED = {
  event: {
    id: 'bb0f1b0e-5e9e-4a7e-9d3a-6e4f0f5a1c3d',
    event_type: 'incident.annotated',
    resource_type: 'incident',
    occurred_at: '2024-05-01T09:25:00.000Z',
    agent: { id: 'PLH1HKV', summary: 'Tenex Engineer', type: 'user_reference' },
    client: { name: 'PagerDuty' },
    data: {
      incident: { id: 'PGR0VU2', summary: 'A little bump in the road', type: 'incident_reference' },
      id: 'P2LA89X',
      content: 'I sure am glad we are using PagerDuty!',
      trimmed: false,
      type: 'incident_note',
    },
  },
};

/**
 * POST to the handler.
 *
 * `signature: undefined` signs the body correctly; `signature: null` omits the
 * header entirely; any string is sent verbatim.
 */
function post(payload, { signature, rawBody, webhookId } = {}) {
  const body = rawBody ?? JSON.stringify(payload);
  const req = request(app)
    .post('/webhooks/pagerduty')
    .set('Content-Type', 'application/json');

  const sig = signature === undefined ? sign(body) : signature;
  if (sig !== null) req.set('X-PagerDuty-Signature', sig);
  if (webhookId) req.set('X-Webhook-Id', webhookId);

  return req.send(body);
}

describe('X-PagerDuty-Signature verification', () => {
  test('accepts a valid signature and returns 202', async () => {
    const res = await post(PRIORITY_UPDATED);
    // PagerDuty recommends 202 Accepted + async processing.
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ received: true });
  });

  test('rejects a tampered body carrying the original signature', async () => {
    const original = JSON.stringify(PRIORITY_UPDATED);
    const signature = sign(original);
    const tampered = JSON.stringify({
      event: {
        ...PRIORITY_UPDATED.event,
        data: { ...PRIORITY_UPDATED.event.data, title: 'A catastrophic outage' },
      },
    });

    const res = await post(null, { rawBody: tampered, signature });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify(PRIORITY_UPDATED);
    const res = await post(null, { rawBody: body, signature: sign(body, 'not-the-secret') });
    expect(res.status).toBe(403);
  });

  test('returns 400 when the header is missing entirely', async () => {
    // There is NO handshake or unsigned validation request — every genuine V3
    // delivery is signed, so an unsigned request is malformed, not special.
    const res = await post(PRIORITY_UPDATED, { signature: null });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing or malformed X-PagerDuty-Signature header');
  });

  test('returns 400 (not 403) for a header with no v1= entry', async () => {
    // Mirrors the Go client's ErrMalformedHeader vs ErrNoValidSignatures split.
    const res = await post(PRIORITY_UPDATED, { signature: 'garbage' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when every entry is a non-v1 version', async () => {
    const res = await post(PRIORITY_UPDATED, { signature: 'v2=abc,v3=def' });
    expect(res.status).toBe(400);
  });

  test('rejects a bare digest with no v1= prefix', async () => {
    const body = JSON.stringify(PRIORITY_UPDATED);
    const bare = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    const res = await post(null, { rawBody: body, signature: bare });
    expect(res.status).toBe(400); // no parseable v1= entry at all
  });

  test('rejects a base64 digest (PagerDuty uses hex)', async () => {
    const body = JSON.stringify(PRIORITY_UPDATED);
    const b64 = crypto.createHmac('sha256', SECRET).update(body).digest('base64');
    const res = await post(null, { rawBody: body, signature: `v1=${b64}` });
    expect(res.status).toBe(403);
  });

  test('rejects a truncated hex digest without throwing (length guard)', async () => {
    // Without the length guard crypto.timingSafeEqual throws RangeError, which
    // would surface as a 500 that PagerDuty retries for 48 hours.
    const res = await post(PRIORITY_UPDATED, { signature: 'v1=deadbeef' });
    expect(res.status).toBe(403);
  });

  test('rejects non-hex characters in a v1= entry without throwing', async () => {
    const res = await post(PRIORITY_UPDATED, { signature: `v1=${'z'.repeat(64)}` });
    expect(res.status).toBe(403);
  });

  test('accepts an UPPERCASE hex digest (hex decoding is case-insensitive)', async () => {
    const body = JSON.stringify(PRIORITY_UPDATED);
    const res = await post(null, { rawBody: body, signature: sign(body).toUpperCase() });
    // `V1=` uppercased too, so the prefix no longer matches -> malformed header.
    expect(res.status).toBe(400);

    const mixed = `v1=${sign(body).slice(3).toUpperCase()}`;
    const res2 = await post(null, { rawBody: body, signature: mixed });
    expect(res2.status).toBe(202);
  });

  test('verifies the RAW bytes, not a re-serialized body', async () => {
    // Semantically identical to PRIORITY_UPDATED but formatted differently. A
    // handler that re-serialized before hashing would compute another digest.
    const pretty = JSON.stringify(PRIORITY_UPDATED, null, 2);
    const res = await post(null, { rawBody: pretty, signature: sign(pretty) });
    expect(res.status).toBe(202);
  });

  test('verifies a UTF-8 body with unicode characters', async () => {
    // PagerDuty: "PagerDuty webhook payloads support unicode characters...
    // ensure that you are using the proper UTF-8 character encoding."
    const payload = {
      event: {
        ...PRIORITY_UPDATED.event,
        data: { ...PRIORITY_UPDATED.event.data, title: 'Dégradation du café ☕ — 緊急' },
      },
    };
    const body = JSON.stringify(payload);
    const res = await post(null, { rawBody: body, signature: sign(body) });
    expect(res.status).toBe(202);
  });

  test('returns 400 for a verified request with an unparseable body', async () => {
    const body = 'not json at all';
    const res = await post(null, { rawBody: body, signature: sign(body) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test('returns 400 for valid JSON with no event object', async () => {
    const body = JSON.stringify({ messages: [{ event: 'incident.trigger' }] }); // V2 shape
    const res = await post(null, { rawBody: body, signature: sign(body) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing event object');
  });
});

describe('multi-signature secret rotation', () => {
  const OLD_SECRET = 'old-secret-being-rotated-out';

  test('accepts when the FIRST of two signatures matches', async () => {
    const body = JSON.stringify(PRIORITY_UPDATED);
    const header = `${sign(body)},${sign(body, OLD_SECRET)}`;
    const res = await post(null, { rawBody: body, signature: header });
    expect(res.status).toBe(202);
  });

  test('accepts when the SECOND of two signatures matches', async () => {
    // This is the case a "compare the whole header" verifier gets wrong.
    const body = JSON.stringify(PRIORITY_UPDATED);
    const header = `${sign(body, OLD_SECRET)},${sign(body)}`;
    const res = await post(null, { rawBody: body, signature: header });
    expect(res.status).toBe(202);
  });

  test('rejects when NEITHER of two signatures matches', async () => {
    const body = JSON.stringify(PRIORITY_UPDATED);
    const header = `${sign(body, OLD_SECRET)},${sign(body, 'another-wrong-secret')}`;
    const res = await post(null, { rawBody: body, signature: header });
    expect(res.status).toBe(403);
  });

  test('accepts without a space after the comma (what PagerDuty actually sends)', async () => {
    const body = JSON.stringify(PRIORITY_UPDATED);
    const header = `${sign(body, OLD_SECRET)},${sign(body)}`;
    expect(header).not.toContain(', ');
    const res = await post(null, { rawBody: body, signature: header });
    expect(res.status).toBe(202);
  });

  test('tolerates whitespace around the comma defensively', async () => {
    const body = JSON.stringify(PRIORITY_UPDATED);
    const header = ` ${sign(body, OLD_SECRET)} , ${sign(body)} `;
    const res = await post(null, { rawBody: body, signature: header });
    expect(res.status).toBe(202);
  });

  test('ignores an unknown future version alongside a valid v1', async () => {
    // A future v2= must not break this receiver.
    const body = JSON.stringify(PRIORITY_UPDATED);
    const header = `v2=${'a'.repeat(64)},${sign(body)}`;
    const res = await post(null, { rawBody: body, signature: header });
    expect(res.status).toBe(202);
  });

  test('handles the documented two-signature header shape', async () => {
    // The docs' own example value, verbatim (it will not match our secret).
    const header =
      'v1=f03de6f61df6e454f3620c4d6aca17ad072d3f8bbb2760eac3b2ad391b5e8073,' +
      'v1=130dcacb53a94d983a37cf2acba98e805a1c37185309ba56fdcccbcf00d6dd8b';
    expect(countV1Signatures(header)).toBe(2);
    const res = await post(PRIORITY_UPDATED, { signature: header });
    expect(res.status).toBe(403); // parseable, just not ours
  });
});

describe('fail-closed behaviour', () => {
  test('returns 500 when the secret is unset (never accepts unverified)', async () => {
    const saved = process.env.PAGERDUTY_WEBHOOK_SECRET;
    delete process.env.PAGERDUTY_WEBHOOK_SECRET;
    try {
      const res = await request(app)
        .post('/webhooks/pagerduty')
        .set('Content-Type', 'application/json')
        .set('X-PagerDuty-Signature', 'v1=' + 'a'.repeat(64))
        .send(JSON.stringify(PRIORITY_UPDATED));
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Webhook secret not configured');
    } finally {
      process.env.PAGERDUTY_WEBHOOK_SECRET = saved;
    }
  });
});

describe('event handling', () => {
  test('handles incident.triggered with a null agent and null priority', async () => {
    const res = await post(INCIDENT_TRIGGERED);
    expect(res.status).toBe(202);
    expect(INCIDENT_TRIGGERED.event.agent).toBeNull();
    expect(INCIDENT_TRIGGERED.event.data.priority).toBeNull();
  });

  test('handles service.updated, where agent AND client are both null', async () => {
    const res = await post(SERVICE_UPDATED);
    expect(res.status).toBe(202);
    expect(SERVICE_UPDATED.event.agent).toBeNull();
    expect(SERVICE_UPDATED.event.client).toBeNull();
  });

  test('handles incident.role.assigned, whose data is an array wrapper', async () => {
    const res = await post(ROLE_ASSIGNED);
    expect(res.status).toBe(202);
    expect(Array.isArray(ROLE_ASSIGNED.event.data.incident_role_assignments)).toBe(true);
  });

  test('handles incident.annotated (data.type incident_note)', async () => {
    const res = await post(ANNOTATED);
    expect(res.status).toBe(202);
    expect(ANNOTATED.event.data.type).toBe('incident_note');
  });

  test('acknowledges an unknown event type with 202 instead of throwing', async () => {
    // "Additional event types may be added to this list over time", plus
    // unannounced Early Access events.
    const res = await post({
      event: {
        id: 'd2d1d0cf-1111-2222-3333-444455556666',
        event_type: 'incident.something.brand_new',
        resource_type: 'incident',
        occurred_at: '2026-01-01T00:00:00.000Z',
        agent: null,
        client: null,
        data: { type: 'incident', id: 'PGR0VU2' },
      },
    });
    expect(res.status).toBe(202);
  });

  test('de-duplication key comes from X-Webhook-Id when present', async () => {
    const res = await post(PRIORITY_UPDATED, { webhookId: '01E2DXWJ4XQ8KQ4F0GZQ3W2P9Y' });
    expect(res.status).toBe(202);
  });

  test('V3 event names are past tense, unlike V2 extensions', async () => {
    // V2 extensions sent `incident.trigger` (singular, no `d`) inside a
    // messages[] array. V3 sends `incident.triggered` in a single event object.
    expect(INCIDENT_TRIGGERED.event.event_type).toBe('incident.triggered');
    expect(INCIDENT_TRIGGERED.event.event_type).not.toBe('incident.trigger');
  });
});

describe('verifyPagerDutySignature (unit)', () => {
  const body = Buffer.from(JSON.stringify(PRIORITY_UPDATED), 'utf8');

  test('returns true for a matching signature', () => {
    expect(verifyPagerDutySignature(body, sign(body), SECRET)).toBe(true);
  });

  test('returns false when the secret is undefined (fails closed)', () => {
    expect(verifyPagerDutySignature(body, sign(body), undefined)).toBe(false);
  });

  test('returns false when the header is undefined (fails closed)', () => {
    expect(verifyPagerDutySignature(body, undefined, SECRET)).toBe(false);
  });

  test('accepts a string body as well as a Buffer', () => {
    const str = JSON.stringify(PRIORITY_UPDATED);
    expect(verifyPagerDutySignature(str, sign(str), SECRET)).toBe(true);
  });

  test('uses the secret AS-IS — a base64-decoded secret does not match', () => {
    const correct = sign('{}');
    const decoded = `v1=${crypto
      .createHmac('sha256', Buffer.from(SECRET, 'base64'))
      .update('{}')
      .digest('hex')}`;
    expect(correct).not.toBe(decoded);
    expect(verifyPagerDutySignature('{}', decoded, SECRET)).toBe(false);
  });

  test('produces a v1= prefixed 64-character lowercase hex digest', () => {
    expect(sign('{}')).toMatch(/^v1=[0-9a-f]{64}$/);
  });

  test('signs the raw body with nothing prepended (no timestamp component)', () => {
    // A Stripe-style `${timestamp}.${body}` signed payload must NOT match.
    const raw = '{}';
    const stripeStyle = `v1=${crypto
      .createHmac('sha256', SECRET)
      .update(`1600000000.${raw}`)
      .digest('hex')}`;
    expect(verifyPagerDutySignature(raw, stripeStyle, SECRET)).toBe(false);
  });
});

describe('countV1Signatures (unit)', () => {
  test('counts only v1= entries', () => {
    expect(countV1Signatures(undefined)).toBe(0);
    expect(countV1Signatures('')).toBe(0);
    expect(countV1Signatures('garbage')).toBe(0);
    expect(countV1Signatures('v2=abc')).toBe(0);
    expect(countV1Signatures('v1=abc')).toBe(1);
    expect(countV1Signatures('v1=abc,v1=def')).toBe(2);
    expect(countV1Signatures('v2=abc,v1=def')).toBe(1);
    expect(countV1Signatures(' v1=abc , v1=def ')).toBe(2);
  });
});

describe('describeAgent (unit)', () => {
  test('falls back to "automation" for a null agent', () => {
    expect(describeAgent(SERVICE_UPDATED.event)).toBe('automation');
    expect(describeAgent({ agent: null })).toBe('automation');
    expect(describeAgent({})).toBe('automation');
  });

  test('describes a user agent', () => {
    expect(describeAgent(PRIORITY_UPDATED.event)).toBe('Tenex Engineer (user_reference)');
  });
});

describe('health check', () => {
  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
