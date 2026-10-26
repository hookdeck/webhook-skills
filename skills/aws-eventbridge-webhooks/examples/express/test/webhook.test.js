const request = require('supertest');

// Set test environment variables before importing the app
process.env.AWS_EVENTBRIDGE_WEBHOOK_USERNAME = 'eventbridge-user';
process.env.AWS_EVENTBRIDGE_WEBHOOK_PASSWORD = 'p@ss:word-with-colon';

const app = require('../src/index');
const { verifyAwsEventbridgeRequest, parseBasicAuth } = require('../src/index');

const USER = process.env.AWS_EVENTBRIDGE_WEBHOOK_USERNAME;
const PASS = process.env.AWS_EVENTBRIDGE_WEBHOOK_PASSWORD;

function basic(user = USER, pass = PASS, scheme = 'Basic') {
  return `${scheme} ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
}

const EC2_EVENT = {
  version: '0',
  id: '7bf73129-1428-4cd3-a780-95db273d1602',
  'detail-type': 'EC2 Instance State-change Notification',
  source: 'aws.ec2',
  account: '123456789012',
  time: '2019-10-02T17:40:17Z',
  region: 'us-east-1',
  resources: ['arn:aws:ec2:us-east-1:123456789012:instance/i-abcd1111'],
  detail: { 'instance-id': 'i-abcd1111', state: 'pending' }
};
const S3_EVENT = {
  ...EC2_EVENT,
  'detail-type': 'Object Created',
  source: 'aws.s3',
  detail: { bucket: { name: 'my-bucket' }, object: { key: 'a/b.txt' } }
};
const ORDER_EVENT = {
  ...EC2_EVENT,
  'detail-type': 'OrderCreated',
  source: 'com.example.orders',
  detail: { orderId: '1234' }
};

function send(method, auth = basic(), body, contentType = 'application/json') {
  let req = request(app)[method.toLowerCase()]('/webhooks/aws-eventbridge');
  if (auth) req = req.set('Authorization', auth);
  if (body !== undefined) req = req.set('Content-Type', contentType).send(body);
  return req;
}

describe('Amazon EventBridge webhook endpoint', () => {
  describe('Basic authentication', () => {
    it('accepts the correct credentials', async () => {
      const res = await send('POST', basic(), JSON.stringify(EC2_EVENT));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts a lowercase scheme', async () => {
      const res = await send('POST', basic(USER, PASS, 'basic'), JSON.stringify(EC2_EVENT));
      expect(res.status).toBe(200);
    });

    it('splits on the first colon only (password may contain colons)', () => {
      expect(parseBasicAuth(basic('u', 'a:b:c'))).toEqual({ username: 'u', password: 'a:b:c' });
    });

    it('rejects a wrong password', async () => {
      const res = await send('POST', basic(USER, 'wrong'), JSON.stringify(EC2_EVENT));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await send('POST', basic('someone', PASS), JSON.stringify(EC2_EVENT));
      expect(res.status).toBe(401);
    });

    it('rejects when both are wrong, and when lengths differ', async () => {
      expect((await send('POST', basic('x', 'y'), '{}')).status).toBe(401);
      expect((await send('POST', basic('x'.repeat(200), 'y'.repeat(200)), '{}')).status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await send('POST', null, JSON.stringify(EC2_EVENT));
      expect(res.status).toBe(401);
    });

    it('rejects a non-Basic scheme', async () => {
      const res = await send('POST', `Bearer ${PASS}`, JSON.stringify(EC2_EVENT));
      expect(res.status).toBe(401);
    });

    it('rejects malformed base64 and credentials without a colon', async () => {
      expect((await send('POST', 'Basic !!!not-base64!!!', '{}')).status).toBe(401);
      const noColon = `Basic ${Buffer.from('nocolon').toString('base64')}`;
      expect((await send('POST', noColon, '{}')).status).toBe(401);
    });

    it('rejects everything when the credentials are unset', () => {
      const headers = { authorization: basic() };
      expect(verifyAwsEventbridgeRequest(headers, '', '')).toBe(false);
      expect(verifyAwsEventbridgeRequest(headers, USER, '')).toBe(false);
      delete process.env.AWS_EVENTBRIDGE_WEBHOOK_USERNAME;
      expect(verifyAwsEventbridgeRequest(headers)).toBe(false);
      process.env.AWS_EVENTBRIDGE_WEBHOOK_USERNAME = USER;
    });

    it('returns 401, not 200, for an empty GET without credentials', async () => {
      const res = await send('GET', null);
      expect(res.status).toBe(401);
    });
  });

  describe('HTTP methods', () => {
    it.each(['POST', 'PUT', 'PATCH'])('accepts %s with a body', async (method) => {
      const res = await send(method, basic(), JSON.stringify(EC2_EVENT));
      expect(res.status).toBe(200);
    });

    it.each(['GET', 'DELETE'])('accepts %s with an empty body', async (method) => {
      const res = await send(method);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('rejects methods outside the allowed set', async () => {
      const res = await request(app).options('/webhooks/aws-eventbridge').set('Authorization', basic());
      expect(res.status).toBe(405);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await send('POST', basic(), JSON.stringify(EC2_EVENT), 'text/plain');
      expect(res.status).toBe(200);
    });

    it('acknowledges a transformed (non-envelope) JSON body', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send('POST', basic(), JSON.stringify({ text: 'hello' }));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).includes('transformed'))).toBe(true);
      spy.mockRestore();
    });

    it('acknowledges a transformed plain-text body', async () => {
      const res = await send('POST', basic(), 'instance i-1 changed state', 'text/plain');
      expect(res.status).toBe(200);
    });

    it('authenticates before parsing (bad JSON without credentials is 401)', async () => {
      const res = await send('POST', null, '{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each([
      ['aws.ec2 / EC2 Instance State-change Notification', EC2_EVENT],
      ['aws.s3 / Object Created', S3_EVENT],
      ['com.example.orders / OrderCreated', ORDER_EVENT]
    ])('handles %s', async (_name, event) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send('POST', basic(), JSON.stringify(event));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send('POST', basic(), JSON.stringify({ ...EC2_EVENT, source: 'aws.other', 'detail-type': 'Something New' }));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
