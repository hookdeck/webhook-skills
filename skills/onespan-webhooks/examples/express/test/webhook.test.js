const request = require('supertest');

const AUTH = 'Basic myCallbackKey#1';
process.env.ONESPAN_AUTHORIZATION = AUTH;

const app = require('../src/index');
const { verifyOneSpanRequest } = require('../src/index');

// Shapes taken from OneSpan's documented callback payloads
const packageComplete = {
  '@class': 'com.silanis.esl.packages.event.ESLProcessEvent',
  name: 'PACKAGE_COMPLETE',
  sessionUser: 'e00696ec-d6f5-4feb-89c5-a5ce002a6c66',
  packageId: '5n4obeO8jYoPp126Cm-Y3fxdfbo=',
  message: null,
  documentId: null,
  createdDate: '2018-06-30T20:15:01.038Z',
};
const documentSigned = { ...packageComplete, name: 'DOCUMENT_SIGNED', documentId: 'default-consent' };
const signerComplete = { ...packageComplete, name: 'SIGNER_COMPLETE' };

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/onespan')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('OneSpan webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value', async () => {
    const res = await post(packageComplete, { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(packageComplete)).status).toBe(401);
  });

  it('rejects a wrong key', async () => {
    const res = await post(packageComplete, { Authorization: 'Basic wrongKey' });
    expect(res.status).toBe(401);
  });

  it('rejects the key without the "Basic " prefix', async () => {
    const res = await post(packageComplete, { Authorization: AUTH.replace('Basic ', '') });
    expect(res.status).toBe(401);
  });

  it('does not decode the key as HTTP Basic (base64)', async () => {
    const encoded = 'Basic ' + Buffer.from('myCallbackKey#1').toString('base64');
    expect((await post(packageComplete, { Authorization: encoded })).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(documentSigned), { Authorization: AUTH }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: AUTH })).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await post('[1,2]', { Authorization: AUTH })).status).toBe(400);
  });

  it('does not parse the body before authenticating', async () => {
    expect((await post('not json')).status).toBe(401);
  });

  it('accepts documented events and unknown event names', async () => {
    for (const body of [documentSigned, signerComplete, { ...packageComplete, name: 'PACKAGE_DECLINE', message: 'reason' }]) {
      expect((await post(body, { Authorization: AUTH })).status).toBe(200);
    }
    expect((await post({ name: 'SOMETHING_NEW' }, { Authorization: AUTH })).status).toBe(200);
  });

  it('never accepts when ONESPAN_AUTHORIZATION is unset', () => {
    expect(verifyOneSpanRequest({ authorization: 'Basic x' }, {})).toBe(false);
    expect(verifyOneSpanRequest({ authorization: '' }, { ONESPAN_AUTHORIZATION: '' })).toBe(false);
  });
});
