const request = require('supertest');
const crypto = require('crypto');

// Sinch webhook secrets are opaque strings used as-is (UTF-8) as the HMAC key
process.env.SINCH_WEBHOOK_SECRET = 'test_sinch_webhook_secret';

const app = require('../src/index');

const webhookSecret = process.env.SINCH_WEBHOOK_SECRET;

/**
 * Sign like Sinch: base64(HMAC-SHA256(secret, body + "." + nonce + "." + timestamp))
 */
function sign(payload, secret, nonce, timestamp) {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(payload), Buffer.from(`.${nonce}.${timestamp}`, 'latin1')]))
    .digest('base64');
}

function signedHeaders(payload, { secret = webhookSecret, nonce = '01FJA8B4A7BM43YGWSG9GBV067', timestamp = Math.floor(Date.now() / 1000) } = {}) {
  return {
    'Content-Type': 'application/json',
    'x-sinch-webhook-signature': sign(payload, secret, nonce, String(timestamp)),
    'x-sinch-webhook-signature-nonce': nonce,
    'x-sinch-webhook-signature-timestamp': String(timestamp),
  };
}

const payloads = {
  message: {
    app_id: '01EB37HMH1M6SV18ABNS3G135H',
    accepted_time: '2020-11-16T08:17:44.993024Z',
    event_time: '2020-11-16T08:17:42.814Z',
    project_id: 'c36f3d3d-1523-4edd-ae42-11995557ff61',
    message: {
      id: '01EQ8235TD19N21XQTH12B145D',
      direction: 'TO_APP',
      contact_message: { text_message: { text: 'Hi!' } },
      channel_identity: { channel: 'MESSENGER', identity: '2742085512340733', app_id: '01EB37HMH1M6SV18ABNS3G135H' },
      conversation_id: '01EQ8172WMDB8008EFT4M30481',
      contact_id: '01EQ4174TGGY5B1VPTPGHW19R0',
    },
    correlation_id: 'correlation-id-1',
  },
  message_delivery_report: {
    app_id: '01EB37HMH1M6SV18BSNS3G135H',
    accepted_time: '2020-11-17T15:09:11.659Z',
    event_time: '2020-11-17T15:09:13.267185Z',
    project_id: 'c36f3d3d-1513-2edd-ae42-11995557ff61',
    message_delivery_report: {
      message_id: '01EQBC1A3BEK731GY4YXEN0C2R',
      conversation_id: '01EPYATA64TMNZ1FV02JKF12JF',
      status: 'QUEUED_ON_CHANNEL',
      channel_identity: { channel: 'MESSENGER', identity: '2734085512340733', app_id: '01EB27HMH1M6SV18ASNS3G135H' },
    },
  },
  contact_create_notification: {
    app_id: '',
    accepted_time: '2020-11-17T15:36:28.155494Z',
    project_id: 'c36f3a3d-1513-4edd-ae42-11995557ff61',
    contact_create_notification: {
      contact: {
        id: '01EQBDK8771J6A1FV8MQPE1XAR',
        channel_identities: [{ channel: 'VIBER', identity: '9KC0p+pi4zPGFO99ACDxdQ==', app_id: '01EB37KMH1M6SV18ASNS3G135H' }],
        display_name: 'Unknown',
      },
    },
  },
};

describe('Sinch Webhook Handler', () => {
  describe('published test vector', () => {
    // Worked example from Sinch's docs
    const secret = 'foo_secret1234';
    const body = "{\"app_id\":\"\",\"accepted_time\":\"2021-10-18T17:49:13.813615Z\",\"project_id\":\"e2df3a34-a71b-4448-9db5-a8d2baad28e4\",\"contact_create_notification\":{\"contact\":{\"id\":\"01FJA8B466Y0R2GNXD78MD9SM1\",\"channel_identities\":[{\"channel\":\"SMS\",\"identity\":\"48123456789\",\"app_id\":\"\"}],\"display_name\":\"New Test Contact\",\"email\":\"new.contact@email.com\",\"external_id\":\"\",\"metadata\":\"\",\"language\":\"EN_US\"}},\"message_metadata\":\"\"}";
    const headers = {
      'Content-Type': 'application/json',
      'x-sinch-webhook-signature-nonce': '01FJA8B4A7BM43YGWSG9GBV067',
      'x-sinch-webhook-signature-timestamp': '1634579353',
      'x-sinch-webhook-signature': '6bpJoRmFoXVjfJIVglMoJzYXxnoxRujzR4k2GOXewOE=',
    };

    it('computes the documented signature', () => {
      expect(sign(body, secret, headers['x-sinch-webhook-signature-nonce'], headers['x-sinch-webhook-signature-timestamp']))
        .toBe('6bpJoRmFoXVjfJIVglMoJzYXxnoxRujzR4k2GOXewOE=');
    });

    it('accepts the documented request', async () => {
      const original = process.env.SINCH_WEBHOOK_SECRET;
      process.env.SINCH_WEBHOOK_SECRET = secret;
      try {
        const response = await request(app).post('/webhooks/sinch').set(headers).send(body);
        expect(response.status).toBe(200);
      } finally {
        process.env.SINCH_WEBHOOK_SECRET = original;
      }
    });
  });

  describe('valid callbacks', () => {
    for (const [name, payload] of Object.entries(payloads)) {
      it(`accepts a signed ${name} callback`, async () => {
        const body = JSON.stringify(payload);
        const response = await request(app).post('/webhooks/sinch').set(signedHeaders(body)).send(body);
        expect(response.status).toBe(200);
      });
    }

    it('verifies the exact bytes whatever the content type', async () => {
      const body = JSON.stringify(payloads.message);
      const headers = { ...signedHeaders(body), 'Content-Type': 'text/plain' };
      const response = await request(app).post('/webhooks/sinch').set(headers).send(body);
      expect(response.status).toBe(200);
    });

    it('accepts an unrecognised callback once signed', async () => {
      const body = JSON.stringify({ project_id: 'p', something_new: {} });
      const response = await request(app).post('/webhooks/sinch').set(signedHeaders(body)).send(body);
      expect(response.status).toBe(200);
    });
  });

  describe('invalid requests', () => {
    const body = JSON.stringify(payloads.message);

    it('rejects a wrong secret', async () => {
      const response = await request(app).post('/webhooks/sinch').set(signedHeaders(body, { secret: 'other' })).send(body);
      expect(response.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const response = await request(app).post('/webhooks/sinch').set(signedHeaders(body)).send(body + ' ');
      expect(response.status).toBe(401);
    });

    it('rejects a changed nonce', async () => {
      const headers = { ...signedHeaders(body), 'x-sinch-webhook-signature-nonce': 'OTHERNONCE' };
      const response = await request(app).post('/webhooks/sinch').set(headers).send(body);
      expect(response.status).toBe(401);
    });

    it('rejects a changed timestamp', async () => {
      const headers = { ...signedHeaders(body), 'x-sinch-webhook-signature-timestamp': '1' };
      const response = await request(app).post('/webhooks/sinch').set(headers).send(body);
      expect(response.status).toBe(401);
    });

    for (const header of ['x-sinch-webhook-signature', 'x-sinch-webhook-signature-nonce', 'x-sinch-webhook-signature-timestamp']) {
      it(`rejects a missing ${header}`, async () => {
        const headers = signedHeaders(body);
        delete headers[header];
        const response = await request(app).post('/webhooks/sinch').set(headers).send(body);
        expect(response.status).toBe(401);
      });
    }

    it('rejects malformed signatures', async () => {
      const good = signedHeaders(body);
      const sig = good['x-sinch-webhook-signature'];
      const malformed = [
        sig.slice(0, -1),                 // too short
        sig + 'A',                        // too long
        sig.replace(/.$/, '').slice(0, -1) + '-=',  // bad alphabet
        sig.slice(0, -1) + '$',           // unpadded / bad char
        sig.replace(/[A-Za-z]/, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())), // case change
      ];
      for (const value of malformed) {
        const response = await request(app)
          .post('/webhooks/sinch')
          .set({ ...good, 'x-sinch-webhook-signature': value })
          .send(body);
        expect(response.status).toBe(401);
      }
    });

    it('rejects an empty body without a signature', async () => {
      const response = await request(app).post('/webhooks/sinch').send();
      expect(response.status).toBe(401);
    });

    it('returns 400 for a signed non-JSON body', async () => {
      const bad = 'not json';
      const response = await request(app).post('/webhooks/sinch').set(signedHeaders(bad)).send(bad);
      expect(response.status).toBe(400);
    });
  });

  describe('timestamp tolerance (opt-in)', () => {
    const body = JSON.stringify(payloads.message);
    const old = Math.floor(Date.now() / 1000) - 3600;

    afterEach(() => {
      delete process.env.SINCH_WEBHOOK_TOLERANCE_SECONDS;
    });

    it('accepts an old timestamp by default (retries and replays)', async () => {
      const response = await request(app).post('/webhooks/sinch').set(signedHeaders(body, { timestamp: old })).send(body);
      expect(response.status).toBe(200);
    });

    it('rejects an old timestamp when a tolerance is set', async () => {
      process.env.SINCH_WEBHOOK_TOLERANCE_SECONDS = '300';
      const response = await request(app).post('/webhooks/sinch').set(signedHeaders(body, { timestamp: old })).send(body);
      expect(response.status).toBe(401);
    });

    it('accepts a fresh timestamp when a tolerance is set', async () => {
      process.env.SINCH_WEBHOOK_TOLERANCE_SECONDS = '300';
      const response = await request(app).post('/webhooks/sinch').set(signedHeaders(body)).send(body);
      expect(response.status).toBe(200);
    });
  });

  it('health check', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
  });
});
