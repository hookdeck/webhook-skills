const request = require('supertest');
const crypto = require('crypto');
const nock = require('nock');

// Restrict trust to this topic so we can also test the 403 path.
const TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:MyTopic';
process.env.AWS_SNS_TOPIC_ARN = TOPIC_ARN;

const app = require('../src/index');

// A fixed RSA test key + matching self-signed X.509 cert. SNS signs with its
// private key; here the test plays the role of SNS. The handler fetches the
// cert from SigningCertURL (mocked with nock) and RSA-verifies the signature.
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCq7NPsBMMIqXhb
aAyLCjmjq4pLfH5YJsYOhwo1jXLXbYWttuTma4wrWMyjcmqeED3LFCBZ5fVAisgR
+vpjhA3+f2/huHZPcif6oTaYiJvINw/fL6AXhDsb2BA3tjoByeephSu3TbJraH2O
Dw37RJydEy7gvCE+kMLdu/9fGIwFeh2gndf80KU+HdvJiTK2rDKk1qZsFkbRy9Ku
QX5Osa3qbR7v4oGzK0D79kxZUbmRklSOkmONO9CwAKGchQVvWE6FCokOrJ29+J/2
5rYrpO0TNiOifDc7M7JKRzYoiHC/42mIKiWglXCYj/mzAKR0tEmolm/+bMEdrlCt
q4SFUPg3AgMBAAECggEANyzO9iPNX4jxQLR0RBfPZm2T7W0pDcSqb3sZCRN5jGAe
5GYjOtxhuYZnPKXNE+wTPnBnRw3L3wNNtTwqwqAYslwp3hfhHSExFZ8f1BpZC0b2
+SlTCPRW7lSPW6SX0gb+oMLLy1ap7zEiQo7KiR9rXOsZ2VLxelRZiyFKPMTcQlHT
C210bodqNpuuecuJ9oqnphcC+ZZGX+Xk+7ZAh8zXNWS8os1zXIea9Wrq4esMF/JL
hwWjg7vguc0SrW1FoSfyGENjLViEzxoWgHo3OPQK/BVG/5wHFpL0oQ+sUj4l9QTW
hMMi2OquRDLR8yUk1I0yTFBiav8q1R1SjS/QOG2vfQKBgQDlQAm4oqEqC+mlBxzx
2bK8OeznV56Kiv9s0mCLMpZglzFAgKtBMFp5X3aleNLxwkq3qEGOzn1KigWP5ECn
+9RWBINgLHeDidAhhmhVWMz/wwPWQgQGBY3MGM3fbQ+8udhj0bs7iqXR/XNHQ8hP
THw6CTp6yY7i45Wx/kbgfhMBewKBgQC+3o4DYyqKiJ+k+Xg0toKqfy+nAQr0g2V2
l9a1mbWOzNSD1bDma5UP47nSu4QM4CAgyIJgq0TpJkR91Dh+T+Cl9BRURkd+amha
4VZ0fEhgByutENuILWN/zr1DLaZPGa3gGhaO/VvahM8kBphDOjA+5PkraGKWIfDi
d9JOVs5xdQKBgG47ubDvemF2cvWokvF0Ra6eh9zB0/k4VxPjoQqt24M8kDE87Zwd
/RMppSpyC7S2QSlInaVmgvaJoZ0MG07rF7H435cqKpm0dcD5GUgYuBIvmrO28KpY
l1NRhgTuM0gDcRqmacp6o7tyjLDy1enTlFRvxY/vRWayGnQJGdmupcLrAoGAX/pT
mRp1muHmvTOBIaig/hEkqirZEmk8TS0/F2RqqpsPRhffc46njyzpFTGbzkmpfjK1
dNzKsx6+FDPyEHokMe8RhestKkFhpklniv2v+zG/4a/3ZHvGa89O1ogO9/mmuGkF
7PM0DCb6blgumqeY+Rd0wEImSO5aTdcI1sHJ370CgYEAz/1yWA7y8v9lOCx+Ye2m
B9lxQw85zP+0YqhiE/gd1aOt1KozURh8nUXa8/XyOC4eFz9MZhEjpj9ASInm0Q63
IkHGmALI8nfJVvE1iSB/JLDae00fm1NyhrL4sywFwPhxTibZPqZN1QrwJNMDR57I
oA3ZH3+BoWC0j+4LjFx0YrM=
-----END PRIVATE KEY-----`;

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDGzCCAgOgAwIBAgIUVOndghVTSFsZgYvi7NplBLEmEqEwDQYJKoZIhvcNAQEL
BQAwHDEaMBgGA1UEAwwRc25zLmFtYXpvbmF3cy5jb20wIBcNMjYwNzIyMTMzNTIx
WhgPMjEyNjA2MjgxMzM1MjFaMBwxGjAYBgNVBAMMEXNucy5hbWF6b25hd3MuY29t
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAquzT7ATDCKl4W2gMiwo5
o6uKS3x+WCbGDocKNY1y122Frbbk5muMK1jMo3JqnhA9yxQgWeX1QIrIEfr6Y4QN
/n9v4bh2T3In+qE2mIibyDcP3y+gF4Q7G9gQN7Y6AcnnqYUrt02ya2h9jg8N+0Sc
nRMu4LwhPpDC3bv/XxiMBXodoJ3X/NClPh3byYkytqwypNambBZG0cvSrkF+TrGt
6m0e7+KBsytA+/ZMWVG5kZJUjpJjjTvQsAChnIUFb1hOhQqJDqydvfif9ua2K6Tt
EzYjonw3OzOySkc2KIhwv+NpiColoJVwmI/5swCkdLRJqJZv/mzBHa5QrauEhVD4
NwIDAQABo1MwUTAdBgNVHQ4EFgQUgvsZVS+ZpcIYL+hSMLgFnTCNDhIwHwYDVR0j
BBgwFoAUgvsZVS+ZpcIYL+hSMLgFnTCNDhIwDwYDVR0TAQH/BAUwAwEB/zANBgkq
hkiG9w0BAQsFAAOCAQEAFzqkO4ODkL+ivq9PLUGqInCQAipiH9E/Q0KM6f2Ye22a
b/OQ3bAEIfXX4r0dD3bFLGheiQnNpVKAgbVuFRxs7G+F9VzhOJOF9otUmP+giIPi
0qe8vy9+DLlLlg2DNGF5MCGQfq0MITfD2PmNzIfLwQ7G2WKSSdhryA2hVD4KsIBX
wLbbFZntjeiGYzb7GFcpZx3iHbZ+g2AkUey+WCK5yQN25vUnjAjTk+4TTUHkIal7
SdxNtQHqVVlZ60C2WgTv/f+BdH5AYptNKLkzt4O1CglRfYMboxg2Z99CNShNGTLI
29vrwQik+qCuwCrXoQMV0yKHDnGx3CAu5XLPY87AGw==
-----END CERTIFICATE-----`;

const CERT_HOST = 'https://sns.us-east-1.amazonaws.com';
const CERT_PATH = '/SimpleNotificationService-test.pem';
const SIGNING_CERT_URL = CERT_HOST + CERT_PATH;

// Build the canonical "Key\nValue\n" string exactly as sns-validator does:
// a fixed ordered key list per type, including a key only if present.
// Both confirmation types include SubscribeURL and Token; a Notification doesn't.
function stringToSign(message) {
  const fields =
    message.Type === 'Notification'
      ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
      : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
  let out = '';
  for (const field of fields) {
    if (message[field] === undefined || message[field] === null) continue;
    out += `${field}\n${message[field]}\n`;
  }
  return out;
}

// Sign the message the way SNS would (SignatureVersion 1 = SHA1, 2 = SHA256).
function signMessage(message) {
  const algorithm = message.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1';
  const signer = crypto.createSign(algorithm);
  signer.update(stringToSign(message), 'utf8');
  return { ...message, Signature: signer.sign(TEST_PRIVATE_KEY, 'base64') };
}

function notification(overrides = {}) {
  return signMessage({
    Type: 'Notification',
    MessageId: '22b80b92-fdea-4c2c-8f9d-bdfb0c7bf324',
    TopicArn: TOPIC_ARN,
    Subject: 'My subject',
    Message: 'Hello world!',
    Timestamp: '2012-05-02T00:54:06.655Z',
    SignatureVersion: '1',
    SigningCertURL: SIGNING_CERT_URL,
    UnsubscribeURL: `${CERT_HOST}/?Action=Unsubscribe`,
    ...overrides,
  });
}

function subscriptionConfirmation(overrides = {}) {
  return signMessage({
    Type: 'SubscriptionConfirmation',
    MessageId: '165545c9-2a5c-472c-8df2-7ff2be2b3b1b',
    Token: '2336412f37',
    TopicArn: TOPIC_ARN,
    Message: 'You have chosen to subscribe to the topic.',
    SubscribeURL: `${CERT_HOST}/?Action=ConfirmSubscription&Token=2336412f37`,
    Timestamp: '2012-04-26T20:45:04.751Z',
    SignatureVersion: '1',
    SigningCertURL: SIGNING_CERT_URL,
    ...overrides,
  });
}

function post(message) {
  return request(app)
    .post('/webhooks/aws-sns')
    .set('Content-Type', 'text/plain')
    .set('x-amz-sns-message-type', message.Type)
    .send(JSON.stringify(message));
}

describe('AWS SNS Webhook Endpoint', () => {
  beforeEach(() => {
    // Serve the signing certificate. persist() covers sns-validator's cert cache.
    nock(CERT_HOST).persist().get(CERT_PATH).reply(200, TEST_CERT);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('returns 400 when the message-type header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/aws-sns')
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(notification()));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid JSON body', async () => {
    const res = await request(app)
      .post('/webhooks/aws-sns')
      .set('Content-Type', 'text/plain')
      .set('x-amz-sns-message-type', 'Notification')
      .send('not json');
    expect(res.status).toBe(400);
  });

  it('accepts a valid SignatureVersion 1 Notification', async () => {
    const res = await post(notification());
    expect(res.status).toBe(200);
  });

  it('accepts a valid SignatureVersion 2 (SHA256) Notification', async () => {
    const res = await post(notification({ SignatureVersion: '2' }));
    expect(res.status).toBe(200);
  });

  it('accepts a Notification without a Subject', async () => {
    const msg = notification();
    delete msg.Subject;
    const res = await post(signMessage(msg));
    expect(res.status).toBe(200);
  });

  it('rejects a tampered Notification with 400', async () => {
    const msg = notification();
    msg.Message = 'tampered after signing';
    const res = await post(msg);
    expect(res.status).toBe(400);
  });

  it('rejects an unsigned message with 400', async () => {
    const msg = notification();
    msg.Signature = Buffer.from('not-a-real-signature').toString('base64');
    const res = await post(msg);
    expect(res.status).toBe(400);
  });

  it('rejects a message from an untrusted topic with 403', async () => {
    const res = await post(
      notification({ TopicArn: 'arn:aws:sns:us-east-1:999999999999:OtherTopic' })
    );
    expect(res.status).toBe(403);
  });

  it('confirms a SubscriptionConfirmation by visiting SubscribeURL', async () => {
    const msg = subscriptionConfirmation();
    const confirm = nock(CERT_HOST)
      .get('/')
      .query({ Action: 'ConfirmSubscription', Token: '2336412f37' })
      .reply(200, '<ConfirmSubscriptionResponse/>');

    const res = await post(msg);
    expect(res.status).toBe(200);
    expect(confirm.isDone()).toBe(true);
  });

  it('accepts an UnsubscribeConfirmation', async () => {
    const msg = signMessage({
      Type: 'UnsubscribeConfirmation',
      MessageId: '165545c9-2a5c-472c-8df2-7ff2be2b3b1c',
      Token: '2336412f38',
      TopicArn: TOPIC_ARN,
      Message: 'You have chosen to deactivate the subscription.',
      SubscribeURL: `${CERT_HOST}/?Action=ConfirmSubscription&Token=2336412f38`,
      Timestamp: '2012-04-26T20:06:41.581Z',
      SignatureVersion: '1',
      SigningCertURL: SIGNING_CERT_URL,
    });
    const res = await post(msg);
    expect(res.status).toBe(200);
  });

  it('exposes a health endpoint', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
