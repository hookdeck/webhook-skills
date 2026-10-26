const request = require('supertest');

// Set test environment variables before importing the app
process.env.SHIP24_WEBHOOK_SECRET = 'test_ship24_webhook_secret_0123456789';

const app = require('../src/index');
const { verifyShip24Request, processedMessageIds } = require('../src/index');

const SECRET = process.env.SHIP24_WEBHOOK_SECRET;
const BEARER = `Bearer ${SECRET}`;

let counter = 0;

function trackingItem(topic = 'tracking/events', messageId = `msg-${++counter}`) {
  const base = {
    metadata: { generatedAt: '2025-03-04T17:13:35.000Z', messageId, topic },
    tracker: {
      trackerId: '26148317-7502-d3ac-44a9-546d240ac0dd',
      trackingNumber: '9400115901047177598206',
      isSubscribed: true,
    },
  };
  if (topic === 'tracking/pod') {
    return { ...base, data: { status: 'found', courier: 'ups-tracking', content: { type: 'text/plain', text: 'J. Doe' } } };
  }
  return {
    ...base,
    shipment: { shipmentId: 'f4f888d7-d140-423f-9a48-e0689d27e098' },
    events: [{ eventId: 'ee8ebe96', status: 'Delivered to the addressee', occurrenceDatetime: '2025-03-04T17:12:57' }],
    statistics: {},
  };
}

function post(body = JSON.stringify({ trackings: [trackingItem()] }), contentType = 'application/json') {
  return request(app).post('/webhooks/ship24').set('Content-Type', contentType).send(body);
}

describe('Ship24 webhook endpoint', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    processedMessageIds.clear();
  });
  afterEach(() => logSpy.mockRestore());

  describe('Authorization bearer verification', () => {
    it('accepts the correct secret', async () => {
      const res = await post().set('Authorization', BEARER);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it.each(['bearer', 'BEARER', 'bEaReR'])('accepts the scheme in any case (%s)', async (scheme) => {
      const res = await post().set('Authorization', `${scheme} ${SECRET}`);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await post().set('Authorization', `Bearer ${'x'.repeat(SECRET.length)}`);
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await post().set('Authorization', 'Bearer short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects a wrong scheme', async () => {
      expect((await post().set('Authorization', `Basic ${SECRET}`)).status).toBe(401);
      expect((await post().set('Authorization', `Token ${SECRET}`)).status).toBe(401);
      expect((await post().set('Authorization', SECRET)).status).toBe(401);
    });

    it('does not trim the secret', () => {
      // HTTP strips whitespace around header values, so check the function directly.
      expect(verifyShip24Request({ authorization: `Bearer ${SECRET} ` }, SECRET)).toBe(false);
      expect(verifyShip24Request({ authorization: `Bearer ${SECRET}` }, `${SECRET} `)).toBe(false);
      expect(verifyShip24Request({ authorization: 'Bearer  s3cret' }, ' s3cret')).toBe(true);
    });

    it('rejects an empty secret after the scheme', async () => {
      const res = await post().set('Authorization', 'Bearer ');
      expect(res.status).toBe(401);
    });

    it('authenticates before parsing the body', async () => {
      const res = await post('not json');
      expect(res.status).toBe(401);
    });

    it('fails closed when the secret is not configured', () => {
      expect(verifyShip24Request({ authorization: BEARER }, '')).toBe(false);
      expect(verifyShip24Request({ authorization: 'Bearer ' }, 'Bearer ')).toBe(false);
    });

    it('strips a "Bearer " prefix from the configured value, case-insensitively', () => {
      expect(verifyShip24Request({ authorization: BEARER }, `Bearer ${SECRET}`)).toBe(true);
      expect(verifyShip24Request({ authorization: BEARER }, `bearer ${SECRET}`)).toBe(true);
    });

    it('compares non-ASCII secrets byte for byte without throwing', () => {
      // Node decodes header bytes as latin1, so the UTF-8 bytes of "sécret" arrive like this.
      const wire = Buffer.from('sécret', 'utf8').toString('latin1');
      expect(verifyShip24Request({ authorization: `Bearer ${wire}` }, 'sécret')).toBe(true);
      expect(verifyShip24Request({ authorization: 'Bearer secret' }, 'sécret')).toBe(false);
    });
  });

  describe('raw body handling', () => {
    it('accepts any content type', async () => {
      for (const type of ['application/json', 'text/plain', 'application/octet-stream']) {
        const res = await post(JSON.stringify({ trackings: [trackingItem()] }), type).set('Authorization', BEARER);
        expect(res.status).toBe(200);
      }
    });

    it('rejects invalid JSON', async () => {
      const res = await post('{nope').set('Authorization', BEARER);
      expect(res.status).toBe(400);
    });

    it('rejects a body without a trackings array', async () => {
      for (const body of ['{}', '[]', '{"trackings":{}}', '{"trackings":[{}]}', 'null']) {
        const res = await post(body).set('Authorization', BEARER);
        expect(res.status).toBe(400);
      }
    });
  });

  describe('topics', () => {
    it('handles tracking/events', async () => {
      const res = await post(JSON.stringify({ trackings: [trackingItem('tracking/events')] })).set('Authorization', BEARER);
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Tracking update for 9400115901047177598206: Delivered to the addressee');
    });

    it('handles tracking/pod', async () => {
      const res = await post(JSON.stringify({ trackings: [trackingItem('tracking/pod')] })).set('Authorization', BEARER);
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Proof of delivery for 9400115901047177598206: found');
    });

    it('acknowledges unknown topics', async () => {
      const res = await post(JSON.stringify({ trackings: [trackingItem('tracking/other')] })).set('Authorization', BEARER);
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled topic: tracking/other');
    });

    it('loops over grouped trackings', async () => {
      const body = JSON.stringify({ trackings: [trackingItem('tracking/events'), trackingItem('tracking/events')] });
      const res = await post(body).set('Authorization', BEARER);
      expect(res.status).toBe(200);
      expect(logSpy.mock.calls.filter(([m]) => m.startsWith('Tracking update'))).toHaveLength(2);
    });
  });

  describe('deduplication', () => {
    it('skips a messageId it has already handled', async () => {
      const body = JSON.stringify({ trackings: [trackingItem('tracking/events', 'dup-1')] });
      expect((await post(body).set('Authorization', BEARER)).status).toBe(200);
      expect((await post(body).set('Authorization', BEARER)).status).toBe(200);
      expect(logSpy.mock.calls.filter(([m]) => m.startsWith('Tracking update'))).toHaveLength(1);
      expect(logSpy).toHaveBeenCalledWith('Duplicate message dup-1, skipping');
    });
  });
});
