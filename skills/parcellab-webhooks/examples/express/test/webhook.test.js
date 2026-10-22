const request = require('supertest');

const USERNAME = 'parcellab';
const PASSWORD = 'p@ss:word:with:colons';
process.env.PARCELLAB_WEBHOOK_USERNAME = USERNAME;
process.env.PARCELLAB_WEBHOOK_PASSWORD = PASSWORD;

const app = require('../src/index');
const { verifyParcellabRequest, getEventName } = require('../src/index');

function basic(user = USERNAME, pass = PASSWORD) {
  return 'Basic ' + Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
}

// Shape from parcelLab's documented example payload (trimmed)
const delivered = {
  event: 'onDelivered',
  eventid: 'abc123-def456',
  timestamp: '2000-12-16T16:12:00.000Z',
  references: { courier: 'dhl-germany', tracking_number: '00340000000001', orderNo: 'ORD0012345' },
  data: { delivery_status: 'Delivered', delivery_location: 'Doorstep' },
  reporting: { lead_time_door_to_door: 2, lead_time_qualified_attempt: 2, lead_time_end_to_end: 3 },
};

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/parcellab')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('parcelLab webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  describe('authentication', () => {
    it('accepts correct Basic credentials', async () => {
      const res = await post(delivered, { Authorization: basic() });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts a lowercase scheme and a password containing colons', async () => {
      const res = await post(delivered, { Authorization: basic().replace('Basic', 'basic') });
      expect(res.status).toBe(200);
    });

    it('accepts non-ASCII credentials', async () => {
      process.env.PARCELLAB_WEBHOOK_PASSWORD = 'pässwörd-日本';
      const res = await post(delivered, { Authorization: basic(USERNAME, 'pässwörd-日本') });
      process.env.PARCELLAB_WEBHOOK_PASSWORD = PASSWORD;
      expect(res.status).toBe(200);
    });

    it('rejects a missing Authorization header', async () => {
      expect((await post(delivered)).status).toBe(401);
    });

    it('rejects a wrong password', async () => {
      expect((await post(delivered, { Authorization: basic(USERNAME, 'nope') })).status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      expect((await post(delivered, { Authorization: basic('someone', PASSWORD) })).status).toBe(401);
    });

    it('rejects a non-Basic scheme', async () => {
      expect((await post(delivered, { Authorization: `Bearer ${PASSWORD}` })).status).toBe(401);
    });

    it('rejects a Basic value that is not valid base64 or has no colon', async () => {
      expect((await post(delivered, { Authorization: 'Basic !!!not-base64!!!' })).status).toBe(401);
      const noColon = 'Basic ' + Buffer.from('parcellab').toString('base64');
      expect((await post(delivered, { Authorization: noColon })).status).toBe(401);
    });

    it('rejects every request when credentials are not configured', () => {
      expect(verifyParcellabRequest({ authorization: basic() }, {})).toBe(false);
      expect(verifyParcellabRequest({ authorization: basic('', '') }, {})).toBe(false);
    });

    it('authenticates before parsing: bad credentials with invalid JSON is 401, not 400', async () => {
      expect((await post('{not json', { Authorization: basic(USERNAME, 'nope') })).status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await post(delivered, { Authorization: basic() }, 'text/plain');
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authentication', async () => {
      expect((await post('{not json', { Authorization: basic() })).status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      expect((await post('[1,2]', { Authorization: basic() })).status).toBe(400);
    });
  });

  describe('events', () => {
    const events = [
      'onCreated', 'onUpdated', 'onDispatch', 'onScheduled', 'onDelay', 'onInternalDelay',
      'onOutForDelivery', 'onFailedAttempt', 'onPickupReady', 'onDelivered', 'onReturn',
    ];

    it.each(events)('handles %s', async (event) => {
      const res = await post({ ...delivered, event }, { Authorization: basic() });
      expect(res.status).toBe(200);
      expect(console.log).not.toHaveBeenCalledWith('Unhandled parcelLab event:', event);
    });

    it('acknowledges unknown events', async () => {
      const res = await post({ ...delivered, event: 'onSomethingNew' }, { Authorization: basic() });
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Unhandled parcelLab event:', 'onSomethingNew');
    });

    it('reads the event from a CloudEvents type', async () => {
      const cloudEvent = {
        specversion: '1.0',
        type: 'com.parcellab.tracking.event.outfordelivery',
        data: { references: { tracking_number: '00340000000001' } },
      };
      expect(getEventName(cloudEvent)).toBe('onOutForDelivery');
      const res = await post(cloudEvent, { Authorization: basic() }, 'application/cloudevents+json');
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Shipment 00340000000001 is out for delivery');
    });
  });
});
