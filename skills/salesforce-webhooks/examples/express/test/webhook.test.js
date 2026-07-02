const request = require('supertest');

// Set test environment before importing the app
process.env.NODE_ENV = 'test';
process.env.SALESFORCE_ORG_ID = '00Dxx0000000000EAA';

const { app } = require('../src/index');

const ORG_ID = process.env.SALESFORCE_ORG_ID;

/**
 * Build a Salesforce Outbound Message SOAP envelope like the one Salesforce POSTs.
 */
function buildOutboundMessage({ orgId = ORG_ID, notifications = [] } = {}) {
  const notificationXml = notifications
    .map(
      (n) => `
      <Notification>
        <Id>${n.id}</Id>
        <sObject xsi:type="sf:${n.type}" xmlns:sf="urn:sobject.enterprise.soap.sforce.com">
          <sf:Id>${n.recordId}</sf:Id>
          ${n.name ? `<sf:Name>${n.name}</sf:Name>` : ''}
        </sObject>
      </Notification>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Body>
    <notifications xmlns="http://soap.sforce.com/2005/09/outbound">
      <OrganizationId>${orgId}</OrganizationId>
      <ActionId>04kxx0000000000AAA</ActionId>
      <SessionId xsi:nil="true"/>
      <EnterpriseUrl>https://na1.salesforce.com/services/Soap/c/67.0/${orgId}</EnterpriseUrl>
      <PartnerUrl>https://na1.salesforce.com/services/Soap/u/67.0/${orgId}</PartnerUrl>${notificationXml}
    </notifications>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function post(body) {
  return request(app)
    .post('/webhooks/salesforce')
    .set('Content-Type', 'text/xml')
    .send(body);
}

describe('Salesforce Outbound Message listener', () => {
  describe('POST /webhooks/salesforce', () => {
    it('acks a valid message with the correct OrganizationId', async () => {
      const body = buildOutboundMessage({
        notifications: [
          { id: '04lxx000000000AAAA', type: 'Account', recordId: '001xx000003DGb2AAG', name: 'Acme Corp' },
        ],
      });

      const res = await post(body);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/xml/);
      expect(res.text).toContain('notificationsResponse');
      expect(res.text).toContain('<Ack>true</Ack>');
    });

    it('rejects a message with a mismatched OrganizationId', async () => {
      const body = buildOutboundMessage({
        orgId: '00Dyy0000000000ZZZ',
        notifications: [
          { id: '04lxx000000000BBBB', type: 'Contact', recordId: '003xx000004TmiQAAS' },
        ],
      });

      const res = await post(body);

      expect(res.status).toBe(401);
      expect(res.text).not.toContain('<Ack>true</Ack>');
    });

    it('rejects a message with no OrganizationId', async () => {
      const body = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <notifications xmlns="http://soap.sforce.com/2005/09/outbound">
      <Notification><Id>x</Id></Notification>
    </notifications>
  </soapenv:Body>
</soapenv:Envelope>`;

      const res = await post(body);
      expect(res.status).toBe(401);
    });

    it('rejects a body that is not an Outbound Message', async () => {
      const res = await post('<html><body>not soap</body></html>');
      expect(res.status).toBe(401);
    });

    it('processes multiple notifications in one message', async () => {
      const notifications = Array.from({ length: 3 }, (_, i) => ({
        id: `04lxx00000000${i}AAAA`,
        type: 'Opportunity',
        recordId: `006xx00000000${i}AAAA`,
      }));

      const res = await post(buildOutboundMessage({ notifications }));

      expect(res.status).toBe(200);
      expect(res.text).toContain('<Ack>true</Ack>');
    });
  });

  describe('GET /health', () => {
    it('returns healthy', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'healthy' });
    });
  });
});
