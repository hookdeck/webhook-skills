const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'micetribe_test_secret_key';
process.env.MICETRIBE_WEBHOOK_SECRET = SECRET;
delete process.env.MICETRIBE_WEBHOOK_TOLERANCE_SECONDS;

const { app, verifyMicetribeSignature, toleranceFromEnv } = require('../src/index');

// Payload shaped like MICEtribe's documented registration.updated sample
function samplePayload(trigger = 'registration.updated', registrationId = '6a08287fa219e11ac60d2a10') {
  return {
    registration_id: registrationId,
    data: {
      registration_data: { email: 'attendee@example.com', fullname: 'Jane Doe', first_name: 'Jane', last_name: 'Doe' },
      entry_status: 'Approved',
      persona: 'attendee',
      barcode: 'ABC123XY',
      print: { print_count: 0, last_printed_at: '', last_printed_by: '' },
      checkin: { attended: false, checkin_at: '' },
      payment: { total_payment: '10.00', currency: 'QAR', method: 'SkipCash' }
    },
    meta: {
      event_id: 7337,
      event_name: 'My Event',
      webhook_name: 'crm-sync',
      occurred_at: '2026-06-01T12:29:11+00:00',
      trigger,
      webhook_url: 'https://your-server.com/webhooks/micetribe',
      request_method: 'post'
    }
  };
}

// hex HMAC-SHA256( secret, timestamp + "." + raw_body ), built as bytes
function sign(body, timestamp, secret = SECRET) {
  const bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(String(timestamp), 'latin1'), Buffer.from('.'), bodyBuf]))
    .digest('hex');
}

function now() {
  return String(Math.floor(Date.now() / 1000));
}

let requestCounter = 0;
function post(body, headers = {}) {
  const ts = headers['X-Timestamp'] ?? now();
  const sig = 'X-Signature' in headers ? headers['X-Signature'] : sign(body, ts);
  const req = request(app)
    .post('/webhooks/micetribe')
    .set('Content-Type', 'application/json')
    .set('X-Request-Id', `req-${++requestCounter}`)
    .set('X-Timestamp', ts);
  if (sig !== undefined) req.set('X-Signature', sig);
  for (const [k, v] of Object.entries(headers)) {
    if (k !== 'X-Signature' && k !== 'X-Timestamp') req.set(k, v);
  }
  return req.send(body);
}

describe('MICEtribe webhook', () => {
  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const res = await post(JSON.stringify(samplePayload()));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts uppercase hex', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = now();
      const res = await post(body, { 'X-Timestamp': ts, 'X-Signature': sign(body, ts).toUpperCase() });
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, not a re-serialization', async () => {
      // Unusual spacing and escapes would change under JSON.parse/JSON.stringify
      const body = '{ "registration_id" : "abc",\n "meta":{"trigger":"registration.created"}, "data":{"n":"caf\\u00e9"} }';
      const res = await post(body);
      expect(res.status).toBe(200);
    });

    it('verifies non-ASCII body bytes and non-JSON content types', async () => {
      const body = Buffer.from(JSON.stringify({ registration_id: 'r1', meta: { trigger: 'registration.created' }, data: { name: 'Zoë 日本' } }));
      const ts = now();
      const res = await request(app)
        .post('/webhooks/micetribe')
        .set('Content-Type', 'text/plain')
        .set('X-Timestamp', ts)
        .set('X-Request-Id', 'req-text')
        .set('X-Signature', sign(body, ts))
        .send(body);
      expect(res.status).toBe(200);
    });

    it('rejects a tampered body', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = now();
      const res = await post(body.replace('Approved', 'Rejected'), { 'X-Timestamp': ts, 'X-Signature': sign(body, ts) });
      expect(res.status).toBe(401);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = now();
      const res = await post(body, { 'X-Timestamp': ts, 'X-Signature': sign(body, ts, 'other_secret') });
      expect(res.status).toBe(401);
    });

    it('rejects when X-Timestamp differs from the signed one', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await post(body, { 'X-Timestamp': '1790000001', 'X-Signature': sign(body, '1790000000') });
      expect(res.status).toBe(401);
    });

    it('rejects a body-only signature (timestamp not included)', async () => {
      const body = JSON.stringify(samplePayload());
      const bare = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
      const res = await post(body, { 'X-Signature': bare });
      expect(res.status).toBe(401);
    });

    it('rejects a missing X-Signature', async () => {
      const res = await post(JSON.stringify(samplePayload()), { 'X-Signature': undefined });
      expect(res.status).toBe(401);
    });

    it('rejects an empty X-Signature', async () => {
      const res = await post(JSON.stringify(samplePayload()), { 'X-Signature': '' });
      expect(res.status).toBe(401);
    });

    it('rejects a missing X-Timestamp', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await request(app)
        .post('/webhooks/micetribe')
        .set('Content-Type', 'application/json')
        .set('X-Signature', sign(body, ''))
        .send(body);
      expect(res.status).toBe(401);
    });

    it('rejects a malformed signature (right length, non-hex)', async () => {
      const res = await post(JSON.stringify(samplePayload()), { 'X-Signature': 'z'.repeat(64) });
      expect(res.status).toBe(401);
    });

    it('rejects a wrong-length signature', async () => {
      const res = await post(JSON.stringify(samplePayload()), { 'X-Signature': 'abcd' });
      expect(res.status).toBe(401);
    });

    it('rejects a sha256= prefixed signature', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = now();
      const res = await post(body, { 'X-Timestamp': ts, 'X-Signature': `sha256=${sign(body, ts)}` });
      expect(res.status).toBe(401);
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.MICETRIBE_WEBHOOK_SECRET;
      try {
        const res = await post(JSON.stringify(samplePayload()));
        expect(res.status).toBe(500);
      } finally {
        process.env.MICETRIBE_WEBHOOK_SECRET = SECRET;
      }
    });
  });

  describe('timestamp tolerance (opt-in)', () => {
    const body = Buffer.from(JSON.stringify(samplePayload()));
    const ts = '1790000000';
    const sig = sign(body, ts);

    it('does not reject old timestamps by default', () => {
      expect(verifyMicetribeSignature(body, sig, ts, SECRET)).toEqual({ valid: true });
    });

    it('rejects old timestamps when a tolerance is set', () => {
      const result = verifyMicetribeSignature(body, sig, ts, SECRET, 300, 1790000000 + 301);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/tolerance/);
    });

    it('accepts timestamps inside the tolerance', () => {
      expect(verifyMicetribeSignature(body, sig, ts, SECRET, 300, 1790000000 + 299).valid).toBe(true);
    });

    it('rejects a non-numeric timestamp when a tolerance is set', () => {
      const bad = 'yesterday';
      expect(verifyMicetribeSignature(body, sign(body, bad), bad, SECRET, 300).valid).toBe(false);
    });

    it('reads the tolerance from the environment', () => {
      expect(toleranceFromEnv({})).toBe(0);
      expect(toleranceFromEnv({ MICETRIBE_WEBHOOK_TOLERANCE_SECONDS: '300' })).toBe(300);
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      expect(toleranceFromEnv({ MICETRIBE_WEBHOOK_TOLERANCE_SECONDS: 'abc' })).toBe(0);
      console.warn.mockRestore();
    });
  });

  describe('events', () => {
    const triggers = [
      'registration.created',
      'registration.updated',
      'registration.deleted',
      'registration.attended',
      'registration.printed'
    ];

    it.each(triggers)('handles %s', async (trigger) => {
      const res = await post(JSON.stringify(samplePayload(trigger, `reg-${trigger}`)));
      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });

    it('logs and accepts an unknown trigger', async () => {
      const res = await post(JSON.stringify(samplePayload('registration.future', 'reg-future')));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after a valid signature', async () => {
      const res = await post('not json');
      expect(res.status).toBe(400);
    });
  });

  describe('idempotency', () => {
    it('skips a redelivery with the same registration_id, trigger and X-Request-Id', async () => {
      const body = JSON.stringify(samplePayload('registration.created', 'reg-dup'));
      const ts = now();
      const send = () =>
        request(app)
          .post('/webhooks/micetribe')
          .set('Content-Type', 'application/json')
          .set('X-Timestamp', ts)
          .set('X-Request-Id', 'same-delivery')
          .set('X-Signature', sign(body, ts))
          .send(body);
      const first = await send();
      const second = await send();
      expect(first.body).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ received: true, duplicate: true });
    });
  });
});
