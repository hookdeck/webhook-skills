import os

os.environ["SALESFORCE_ORG_ID"] = "00Dxx0000000000EAA"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)
ORG_ID = os.environ["SALESFORCE_ORG_ID"]


def build_outbound_message(org_id=ORG_ID, notifications=None):
    """Build a Salesforce Outbound Message SOAP envelope like the one Salesforce POSTs."""
    notifications = notifications or []
    notification_xml = ""
    for n in notifications:
        name = f"<sf:Name>{n['name']}</sf:Name>" if n.get("name") else ""
        notification_xml += f"""
      <Notification>
        <Id>{n['id']}</Id>
        <sObject xsi:type="sf:{n['type']}" xmlns:sf="urn:sobject.enterprise.soap.sforce.com">
          <sf:Id>{n['recordId']}</sf:Id>
          {name}
        </sObject>
      </Notification>"""

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Body>
    <notifications xmlns="http://soap.sforce.com/2005/09/outbound">
      <OrganizationId>{org_id}</OrganizationId>
      <ActionId>04kxx0000000000AAA</ActionId>
      <SessionId xsi:nil="true"/>
      <EnterpriseUrl>https://na1.salesforce.com/services/Soap/c/67.0/{org_id}</EnterpriseUrl>
      <PartnerUrl>https://na1.salesforce.com/services/Soap/u/67.0/{org_id}</PartnerUrl>{notification_xml}
    </notifications>
  </soapenv:Body>
</soapenv:Envelope>"""


def post(body):
    return client.post(
        "/webhooks/salesforce",
        content=body,
        headers={"Content-Type": "text/xml"},
    )


def test_acks_valid_message():
    body = build_outbound_message(
        notifications=[
            {
                "id": "04lxx000000000AAAA",
                "type": "Account",
                "recordId": "001xx000003DGb2AAG",
                "name": "Acme Corp",
            }
        ]
    )

    res = post(body)

    assert res.status_code == 200
    assert "text/xml" in res.headers["content-type"]
    assert "notificationsResponse" in res.text
    assert "<Ack>true</Ack>" in res.text


def test_rejects_mismatched_org_id():
    body = build_outbound_message(
        org_id="00Dyy0000000000ZZZ",
        notifications=[
            {"id": "04lxx000000000BBBB", "type": "Contact", "recordId": "003xx000004TmiQAAS"}
        ],
    )

    res = post(body)

    assert res.status_code == 401
    assert "<Ack>true</Ack>" not in res.text


def test_rejects_missing_org_id():
    body = """<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <notifications xmlns="http://soap.sforce.com/2005/09/outbound">
      <Notification><Id>x</Id></Notification>
    </notifications>
  </soapenv:Body>
</soapenv:Envelope>"""

    assert post(body).status_code == 401


def test_rejects_non_outbound_body():
    assert post("<html><body>not soap</body></html>").status_code == 401


def test_rejects_malformed_xml():
    assert post("this is not xml <<<").status_code == 401


def test_processes_multiple_notifications():
    notifications = [
        {
            "id": f"04lxx00000000{i}AAAA",
            "type": "Opportunity",
            "recordId": f"006xx00000000{i}AAAA",
        }
        for i in range(3)
    ]

    res = post(build_outbound_message(notifications=notifications))

    assert res.status_code == 200
    assert "<Ack>true</Ack>" in res.text


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "healthy"}
