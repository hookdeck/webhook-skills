// Generated with: the-things-stack-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '../app/webhooks/the-things-stack/route';
import { verifyBasicAuth } from '../lib/verify-the-things-stack';

const USERNAME = 'tts-webhook';
const PASSWORD = 'synthetic:pass-7Hq2';
const UPLINK = '{"end_device_ids":{"device_id":"dev1","application_ids":{"application_id":"app1"},"dev_eui":"0004A30B001C0530","join_eui":"800000000000000C","dev_addr":"00BCB929"},"correlation_ids":["as:up:01E0WZGT6Y7657CPFPE5WEYDSQ"],"received_at":"2026-11-18T10:15:46.014773143Z","uplink_message":{"session_key_id":"AXA50tHUGUucuzS/bCGMNw==","f_port":1,"f_cnt":1,"frm_payload":"gkHe","decoded_payload":{"temperature":1.0,"luminosity":0.64},"rx_metadata":[{"gateway_ids":{"gateway_id":"gtw1","eui":"9C5C8E00001A05C4"},"rssi":-35,"channel_rssi":-35,"snr":5.2}],"settings":{"data_rate":{"lora":{"bandwidth":125000,"spreading_factor":7}},"frequency":"868300000"},"received_at":"2026-11-18T10:15:45.787Z"}}';
const JOIN = '{"end_device_ids":{"device_id":"dev1","application_ids":{"application_id":"app1"},"dev_eui":"0004A30B001C0530","join_eui":"800000000000000C","dev_addr":"01497ECC"},"correlation_ids":["as:up:01E191YN5F2HMBQCBCVRF731VY"],"received_at":"2026-11-18T10:10:09.935284891Z","join_accept":{"session_key_id":"AXBSH1Pk6Z0G166RlH16CQ==","received_at":"2026-11-18T10:10:09.736532315Z"}}';

const basic = (username = USERNAME, password = PASSWORD) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

const post = (body: string, authorization?: string) =>
  POST(
    new Request('http://localhost/webhooks/the-things-stack', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(authorization === undefined ? {} : { authorization }) },
      body,
    })
  );

beforeEach(() => {
  process.env.TTS_WEBHOOK_USERNAME = USERNAME;
  process.env.TTS_WEBHOOK_PASSWORD = PASSWORD;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyBasicAuth', () => {
  it('accepts the Console header (colon in the password) and rejects other schemes', () => {
    expect(verifyBasicAuth(basic(), USERNAME, PASSWORD)).toBe(true);
    expect(verifyBasicAuth(`Bearer ${PASSWORD}`, USERNAME, PASSWORD)).toBe(false);
    expect(verifyBasicAuth(`Basic ${Buffer.from('no-colon').toString('base64')}`, USERNAME, PASSWORD)).toBe(false);
  });
});

describe('POST /webhooks/the-things-stack', () => {
  it('accepts valid credentials and reads the uplink', async () => {
    const res = await post(UPLINK, basic());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type: 'uplink_message', device_id: 'dev1' });
  });

  it('tells message types apart by their top-level object', async () => {
    expect((await (await post(JOIN, basic())).json()).type).toBe('join_accept');
  });

  it('rejects a wrong password, a wrong username and a missing header', async () => {
    expect((await post(UPLINK, basic(USERNAME, 'wrong'))).status).toBe(401);
    expect((await post(UPLINK, basic('someone-else', PASSWORD))).status).toBe(401);
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
