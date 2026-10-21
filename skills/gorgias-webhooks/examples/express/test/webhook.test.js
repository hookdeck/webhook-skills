const request = require('supertest');

// A random shared secret, the kind `openssl rand -hex 32` produces.
const TEST_SECRET = '5f2b8c1e9a7d4e3f6b0c8a2d1e9f7b3c5a4d6e8f0b1c3a5d7e9f2b4c6a8d0e1f';
process.env.GORGIAS_WEBHOOK_SECRET = TEST_SECRET;

const { app, verifyGorgiasAuthorization, parseGorgiasBody, eventName } = require('../src/index');

// What Gorgias sends for the recommended body template (variables rendered as strings).
function samplePayload(event = 'ticket-created') {
  return {
    event,
    ticket_id: '48213',
    subject: 'Where is my order?',
    status: 'open',
    channel: 'email',
    customer_email: 'jane@example.com',
    assignee_email: '',
    updated_datetime: '2026-10-21T09:14:02.118000+00:00',
    message_text: "Hi, my order #1042 hasn't arrived yet.",
  };
}

const AUTH = `Bearer ${TEST_SECRET}`;

describe('verifyGorgiasAuthorization', () => {
  it('accepts the exact configured header value', () => {
    expect(verifyGorgiasAuthorization(AUTH, TEST_SECRET)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyGorgiasAuthorization('Bearer wrong', TEST_SECRET)).toBe(false);
  });

  it('rejects the bare secret without the Bearer scheme', () => {
    expect(verifyGorgiasAuthorization(TEST_SECRET, TEST_SECRET)).toBe(false);
  });

  it('rejects a different-length value without throwing', () => {
    expect(verifyGorgiasAuthorization(`${AUTH}x`, TEST_SECRET)).toBe(false);
  });

  it('fails closed when header or secret is missing', () => {
    expect(verifyGorgiasAuthorization(undefined, TEST_SECRET)).toBe(false);
    expect(verifyGorgiasAuthorization(AUTH, '')).toBe(false);
  });
});

describe('parseGorgiasBody / eventName', () => {
  it('parses JSON bodies', () => {
    const body = Buffer.from(JSON.stringify(samplePayload()));
    expect(parseGorgiasBody(body, 'application/json').ticket_id).toBe('48213');
  });

  it('parses form-urlencoded bodies', () => {
    const body = Buffer.from('event=ticket-updated&ticket_id=7&status=closed');
    expect(parseGorgiasBody(body, 'application/x-www-form-urlencoded')).toEqual({
      event: 'ticket-updated',
      ticket_id: '7',
      status: 'closed',
    });
  });

  it('treats an empty body as {}', () => {
    expect(parseGorgiasBody(Buffer.alloc(0), 'application/json')).toEqual({});
  });

  it('prefers the body event, then the query string', () => {
    expect(eventName({ event: 'ticket-created' }, { event: 'ticket-updated' })).toBe('ticket-created');
    expect(eventName({}, { event: 'ticket-updated' })).toBe('ticket-updated');
    expect(eventName({}, {})).toBe('unknown');
  });
});

describe('POST /webhooks/gorgias', () => {
  it('returns 200 for a valid Authorization header', async () => {
    const res = await request(app)
      .post('/webhooks/gorgias')
      .set('Content-Type', 'application/json')
      .set('Authorization', AUTH)
      .send(JSON.stringify(samplePayload()));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/gorgias')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(samplePayload()));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing Authorization header');
  });

  it('returns 401 for a wrong secret', async () => {
    const res = await request(app)
      .post('/webhooks/gorgias')
      .set('Content-Type', 'application/json')
      .set('Authorization', 'Bearer not-the-secret')
      .send(JSON.stringify(samplePayload()));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid Authorization header');
  });

  it('returns 400 for invalid JSON after authenticating', async () => {
    const res = await request(app)
      .post('/webhooks/gorgias')
      .set('Content-Type', 'application/json')
      .set('Authorization', AUTH)
      .send('{"event": "ticket-created", "subject": "say "hi""}');

    expect(res.status).toBe(400);
  });

  it('accepts form-urlencoded bodies', async () => {
    const res = await request(app)
      .post('/webhooks/gorgias')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('Authorization', AUTH)
      .send('event=ticket-message-created&ticket_id=48213');

    expect(res.status).toBe(200);
  });

  it('returns 500 when GORGIAS_WEBHOOK_SECRET is not set', async () => {
    delete process.env.GORGIAS_WEBHOOK_SECRET;
    try {
      const res = await request(app)
        .post('/webhooks/gorgias')
        .set('Content-Type', 'application/json')
        .set('Authorization', AUTH)
        .send(JSON.stringify(samplePayload()));
      expect(res.status).toBe(500);
    } finally {
      process.env.GORGIAS_WEBHOOK_SECRET = TEST_SECRET;
    }
  });

  it.each([
    'ticket-created',
    'ticket-updated',
    'ticket-message-created',
    'ticket-self-unsnoozed',
    'ticket-message-failed',
    'ticket-assignment-updated',
    'ticket-status-updated',
    'ticket-handed-over',
    'some-future-trigger',
  ])('handles %s', async (event) => {
    const res = await request(app)
      .post('/webhooks/gorgias')
      .set('Content-Type', 'application/json')
      .set('Authorization', AUTH)
      .send(JSON.stringify(samplePayload(event)));

    expect(res.status).toBe(200);
  });
});

describe('other methods Gorgias can use', () => {
  it.each(['put', 'patch', 'delete'])('accepts %s', async (method) => {
    const res = await request(app)
      [method]('/webhooks/gorgias')
      .set('Content-Type', 'application/json')
      .set('Authorization', AUTH)
      .send(JSON.stringify(samplePayload('ticket-updated')));

    expect(res.status).toBe(200);
  });

  it('accepts a DELETE with no body and the event in the query string', async () => {
    const res = await request(app)
      .delete('/webhooks/gorgias?event=ticket-status-updated')
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
  });

  it('still requires authentication on PUT', async () => {
    const res = await request(app)
      .put('/webhooks/gorgias')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(samplePayload()));

    expect(res.status).toBe(401);
  });
});
