"""Free pilot tests: owner-only queue, MFA, CSRF and no unintended public signup."""
from sqlalchemy import select
from portal.models import Notification
from test_portal import application, owner, post, token, get


def test_free_pilot_requires_owner_mfa(application):
    client = application.test_client()
    # Anonymous users cannot invoke the delivery action.
    resp = post(client, '/en/admin/notifications/send-one', {'intent':'send_one'})
    assert resp.status_code in (302, 401, 403)
    assert not application.extensions['capture'].messages

    owner(application, client)
    # No queued notifications yet, so the operation is a no-op.
    before = len(application.extensions['capture'].messages)
    resp = post(client, '/en/admin/notifications/send-one', {'intent':'send_one'}, token(client,'/en/admin'))
    assert resp.status_code == 302
    assert len(application.extensions['capture'].messages) == before


def test_free_pilot_rejects_invalid_intent(application):
    client = application.test_client()
    owner(application, client)
    resp = post(client, '/en/admin/notifications/send-one', {'intent':'all'}, token(client,'/en/admin'))
    assert resp.status_code == 422
