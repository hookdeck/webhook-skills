const request = require('supertest');

const AUTH = 'Bearer 1b2c3d4e5f6047189a0bc1d2e3f40516';
process.env.SMTP2GO_AUTHORIZATION = AUTH;

const app = require('../src/index');
const { verifySmtp2goRequest, parseBody } = require('../src/index');

const delivered = {
  event: 'delivered',
  time: '2026-10-26T10:00:00Z',
  sendtime: '2026-10-26T09:59:58Z',
  sender: 'sender@example.com',
  rcpt: 'user@example.com',
  email_id: '1abcDE-ABC123-xy',
  id: 'wh-1',
  'message-id': '<abc@example.com>',
};
const bounce = { ...delivered, event: 'bounce', bounce: 'hard', message: '550 no such user' };
const sms = { event: 'sms_failed', destination_number: '+15555550100', message_id: 'sms-1', status_code: '500' };

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/smtp2go')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('SMTP2GO webhook', () => {
  let log;
  beforeEach(() => { log = jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value', async () => {
    const res = await post(delivered, { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(delivered)).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    expect((await post(delivered, { Authorization: 'Bearer nope' })).status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    expect((await post(delivered, { Authorization: AUTH.replace('Bearer ', '') })).status).toBe(401);
  });

  it('rejects a differently cased scheme (whole value is compared)', async () => {
    expect((await post(delivered, { Authorization: AUTH.replace('Bearer', 'bearer') })).status).toBe(401);
  });

  it('accepts a Basic value when that is what is configured', () => {
    const basic = 'Basic dXNlcjpwYXNz';
    expect(verifySmtp2goRequest({ authorization: basic }, { SMTP2GO_AUTHORIZATION: basic })).toBe(true);
    expect(verifySmtp2goRequest({ authorization: 'dXNlcjpwYXNz' }, { SMTP2GO_AUTHORIZATION: basic })).toBe(false);
  });

  it('rejects everything when no credential is configured', () => {
    expect(verifySmtp2goRequest({ authorization: '' }, {})).toBe(false);
    expect(verifySmtp2goRequest({ authorization: 'x' }, {})).toBe(false);
  });

  it('handles non-ASCII header values without throwing', () => {
    expect(verifySmtp2goRequest({ authorization: 'Bearer é' }, { SMTP2GO_AUTHORIZATION: AUTH })).toBe(false);
  });

  it('checks the credential before parsing the body', async () => {
    expect((await post('not json')).status).toBe(401);
  });

  it('handles a JSON bounce event', async () => {
    const res = await post(bounce, { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Bounce (hard) for user@example.com'));
  });

  it('handles a form-encoded event', async () => {
    const body = new URLSearchParams({ event: 'open', rcpt: 'user@example.com', email_id: 'e1' }).toString();
    const res = await post(body, { Authorization: AUTH }, 'application/x-www-form-urlencoded');
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Opened e1 by user@example.com'));
  });

  it('handles an SMS event', async () => {
    const res = await post(sms, { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('SMS sms-1 to +15555550100 failed (500)'));
  });

  it('accepts unknown events', async () => {
    const res = await post({ event: 'something_new' }, { Authorization: AUTH });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: AUTH })).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await post('[1,2]', { Authorization: AUTH })).status).toBe(400);
  });

  it('parseBody decodes both output types', () => {
    expect(parseBody('{"event":"click"}', 'application/json')).toEqual({ event: 'click' });
    expect(parseBody('event=click&rcpt=a%40b.com', 'application/x-www-form-urlencoded; charset=UTF-8'))
      .toEqual({ event: 'click', rcpt: 'a@b.com' });
  });
});
