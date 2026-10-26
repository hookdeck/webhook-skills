const request = require('supertest');

// Set test environment variables before importing the app.
// The secret is the exact, whole header value, including the "Bearer " the user typed in Datacake.
process.env.DATACAKE_WEBHOOK_HEADER = 'Authorization';
process.env.DATACAKE_WEBHOOK_SECRET = 'Bearer test_datacake_secret_0123456789';

const app = require('../src/index');
const { verifyDatacakeRequest } = require('../src/index');

const SECRET = process.env.DATACAKE_WEBHOOK_SECRET;

// Payloads follow the samples in Datacake's outgoing webhook docs.
const PAYLOADS = {
  device_measurement: {
    data: [
      { field: 'TEMPERATURE', value: 19.141228, device: 'f7384fd1-9e7f-4540-b4ed-5fa5810bcc27', timestamp: 1647852981 },
      { field: 'HUMIDITY', value: 66.95572, device: 'f7384fd1-9e7f-4540-b4ed-5fa5810bcc27', timestamp: 1647852981 },
      { field: 'ORIENTATION', value: '', device: 'f7384fd1-9e7f-4540-b4ed-5fa5810bcc27', timestamp: 1647852980 }
    ],
    event: 'device_measurement'
  },
  decoder_output: {
    data: {
      log: null,
      device: null,
      result: [
        { field: 'TOWER_LOCATION', value: '(34.492523,136.171631)', device: 'dev:864475044240892' },
        { field: 'RSSI', device: 'dev:864475044240892' },
        { field: 'PM25', value: 4.88, device: 'dev:864475044240892' }
      ],
      product: 'ef6275c7-3e9b-4134-9bef-24bc276a9592',
      execution_time: 664535
    },
    event: 'decoder_output'
  },
  downlink: {
    data: {
      meta: { type: 'lorawan', fport: 1, downlink: 'a6895656-8198-41fe-9c0e-f49074311190' },
      device: 'a52e6324-2cf9-4534-b523-819d94299414',
      payload: 'AQI=',
      product_id: '4e8e8623-18c4-4798-9877-699058a00e24',
      product_slug: 'temperatur-dach'
    },
    event: 'downlink'
  }
};

function post(body = JSON.stringify(PAYLOADS.device_measurement), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/datacake')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Datacake webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the exact header value', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value and does not strip a Bearer prefix', async () => {
      const res = await post().set('Authorization', SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set('Authorization', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set('Authorization', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects an empty header value', async () => {
      const res = await post().set('Authorization', '');
      expect(res.status).toBe(401);
    });

    it('authenticates before parsing the body', async () => {
      const res = await post('not json');
      expect(res.status).toBe(401);
    });
  });

  describe('verifyDatacakeRequest', () => {
    it('reads a custom header name', () => {
      expect(verifyDatacakeRequest({ 'x-datacake-token': 'abc123' }, 'X-Datacake-Token', 'abc123')).toBe(true);
      expect(verifyDatacakeRequest({ authorization: 'abc123' }, 'X-Datacake-Token', 'abc123')).toBe(false);
    });

    it('defaults the header name to Authorization', () => {
      const saved = process.env.DATACAKE_WEBHOOK_HEADER;
      delete process.env.DATACAKE_WEBHOOK_HEADER;
      try {
        expect(verifyDatacakeRequest({ authorization: SECRET })).toBe(true);
      } finally {
        process.env.DATACAKE_WEBHOOK_HEADER = saved;
      }
    });

    it('fails closed when no secret is configured', () => {
      expect(verifyDatacakeRequest({ authorization: 'anything' }, 'Authorization', undefined)).toBe(false);
      expect(verifyDatacakeRequest({ authorization: '' }, 'Authorization', '')).toBe(false);
    });

    it('handles non-ASCII secrets', () => {
      const secret = 'Bearer sécret-ü';
      const sent = Buffer.from(secret, 'utf8').toString('latin1'); // how Node decodes header bytes
      expect(verifyDatacakeRequest({ authorization: sent }, 'Authorization', secret)).toBe(true);
    });
  });

  describe('event handling', () => {
    for (const [event, payload] of Object.entries(PAYLOADS)) {
      it(`handles ${event}`, async () => {
        const res = await post(JSON.stringify(payload)).set('Authorization', SECRET);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ received: true });
      });
    }

    it('acknowledges unknown events', async () => {
      const res = await post(JSON.stringify({ event: 'something_new', data: {} })).set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(PAYLOADS.downlink), 'text/plain').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('tolerates a decoder_output with no result array', async () => {
      const res = await post(JSON.stringify({ event: 'decoder_output', data: {} })).set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });
  });

  describe('body validation', () => {
    it('rejects invalid JSON', async () => {
      const res = await post('{not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('rejects a JSON array', async () => {
      const res = await post('[]').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('rejects an empty body', async () => {
      const res = await post('').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
