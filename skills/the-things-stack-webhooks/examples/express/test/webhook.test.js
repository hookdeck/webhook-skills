// Generated with: the-things-stack-webhooks skill
// https://github.com/hookdeck/webhook-skills

const request = require('supertest');

// Synthetic credentials
const USERNAME = 'tts-webhook';
const PASSWORD = 'synthetic:pass-7Hq2';
process.env.TTS_WEBHOOK_USERNAME = USERNAME;
process.env.TTS_WEBHOOK_PASSWORD = PASSWORD;

const { app, verifyBasicAuth } = require('../src/index');

const UPLINK = '{"end_device_ids":{"device_id":"dev1","application_ids":{"application_id":"app1"},"dev_eui":"0004A30B001C0530","join_eui":"800000000000000C","dev_addr":"00BCB929"},"correlation_ids":["as:up:01E0WZGT6Y7657CPFPE5WEYDSQ"],"received_at":"2026-11-18T10:15:46.014773143Z","uplink_message":{"session_key_id":"AXA50tHUGUucuzS/bCGMNw==","f_port":1,"f_cnt":1,"frm_payload":"gkHe","decoded_payload":{"temperature":1.0,"luminosity":0.64},"rx_metadata":[{"gateway_ids":{"gateway_id":"gtw1","eui":"9C5C8E00001A05C4"},"rssi":-35,"channel_rssi":-35,"snr":5.2}],"settings":{"data_rate":{"lora":{"bandwidth":125000,"spreading_factor":7}},"frequency":"868300000"},"received_at":"2026-11-18T10:15:45.787Z"}}';
const JOIN = '{"end_device_ids":{"device_id":"dev1","application_ids":{"application_id":"app1"},"dev_eui":"0004A30B001C0530","join_eui":"800000000000000C","dev_addr":"01497ECC"},"correlation_ids":["as:up:01E191YN5F2HMBQCBCVRF731VY"],"received_at":"2026-11-18T10:10:09.935284891Z","join_accept":{"session_key_id":"AXBSH1Pk6Z0G166RlH16CQ==","received_at":"2026-11-18T10:10:09.736532315Z"}}';

/** What the Console stores: `Basic ${btoa(`${username}:${password}`)}`. */
const basic = (username = USERNAME, password = PASSWORD) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

const post = (body, authorization) => {
  const req = request(app).post('/webhooks/the-things-stack').set('Content-Type', 'application/json');
  if (authorization !== undefined) req.set('Authorization', authorization);
  return req.send(body);
};

beforeEach(() => {
  process.env.TTS_WEBHOOK_USERNAME = USERNAME;
  process.env.TTS_WEBHOOK_PASSWORD = PASSWORD;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyBasicAuth', () => {
  it('accepts the header the Console builds, with a colon in the password', () => {
    expect(verifyBasicAuth(basic(), USERNAME, PASSWORD)).toBe(true);
  });

  it('treats the scheme name case-insensitively', () => {
    expect(verifyBasicAuth(basic().replace('Basic', 'basic'), USERNAME, PASSWORD)).toBe(true);
  });

  it('rejects other schemes and malformed credentials', () => {
    expect(verifyBasicAuth(`Bearer ${PASSWORD}`, USERNAME, PASSWORD)).toBe(false);
    expect(verifyBasicAuth(`Basic ${Buffer.from('no-colon').toString('base64')}`, USERNAME, PASSWORD)).toBe(false);
    expect(verifyBasicAuth('Basic !!!', USERNAME, PASSWORD)).toBe(false);
  });
});

describe('POST /webhooks/the-things-stack', () => {
  it('accepts valid credentials and reads the uplink', async () => {
    const res = await post(UPLINK, basic());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type: 'uplink_message', device_id: 'dev1' });
  });

  it('tells message types apart by their top-level object', async () => {
    const res = await post(JOIN, basic());
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('join_accept');
  });

  it('rejects a wrong password', async () => {
    expect((await post(UPLINK, basic(USERNAME, 'wrong'))).status).toBe(401);
  });

  it('rejects a wrong username', async () => {
    expect((await post(UPLINK, basic('someone-else', PASSWORD))).status).toBe(401);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(UPLINK)).status).toBe(401);
  });

  it('returns 400 for invalid JSON with valid credentials', async () => {
    expect((await post('{"truncated": ', basic())).status).toBe(400);
  });

  it('returns 500 when the credentials are not set', async () => {
    delete process.env.TTS_WEBHOOK_PASSWORD;
    expect((await post(UPLINK, basic())).status).toBe(500);
  });
});
