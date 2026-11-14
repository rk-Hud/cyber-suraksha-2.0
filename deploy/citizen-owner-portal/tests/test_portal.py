"""Real account/case HTTP flows; no live mailbox or production credentials used."""
import json
import re
import secrets
import time

import pyotp
import pytest
from sqlalchemy import select

from portal import create_app
from portal.mail import DeliveryError, Mailer, dispatch_due
from portal.models import AuditEvent, BrowserSession, CaseEvent, Challenge, Complaint, LoginEvent, Notification, SiteContent, User

BASE = 'https://portal.test'
PASSWORD = 'site-password-for-tests-4821'


class MailCapture:
    def __init__(self):
        self.messages = []
        self.fail = False

    def __call__(self, recipient, subject, body, identity):
        if self.fail:
            raise DeliveryError('delivery_failed')
        self.messages.append({'to': recipient, 'subject': subject, 'body': body, 'identity': identity})

    def code(self, email):
        message = next(m for m in reversed(self.messages) if m['to'] == email and m['identity'] is None)
        return re.search(r'(?<!\d)\d{6}(?!\d)', message['body']).group()


@pytest.fixture
def application(tmp_path):
    mail = MailCapture()
    app = create_app({'TESTING': True, 'PRIVATE_MODE': False, 'SECRET_KEY': 's' * 48, 'OTP_HMAC_KEY': 'o' * 48,
                      'TOTP_ENCRYPTION_KEY': 't' * 48, 'DATABASE_URL': 'sqlite:///' + str(tmp_path / 'accounts.db'),
                      'ADMIN_EMAIL': 'owner@example.test', 'PUBLIC_BASE_URL': BASE,
                      'MAIL_TRANSPORT': mail, 'PUBLIC_REGISTRATION': True})
    result = app.test_cli_runner().invoke(args=['init-db'])
    assert result.exit_code == 0, result.output
    app.extensions['capture'] = mail
    yield app
    app.extensions['portal_engine'].dispose()


def get(client, path):
    return client.get(path, base_url=BASE)


def token(client, path='/en/'):
    response = get(client, path)
    assert response.status_code == 200, (path, response.status_code)
    found = re.search(r'<meta name="csrf-token" content="([a-f0-9]{64})"', response.get_data(as_text=True))
    assert found
    return found.group(1)


def post(client, path, data, csrf=None):
    return client.post(path, data={**data, 'csrf_token': csrf or token(client)}, base_url=BASE, headers={'Origin': BASE})


def challenge(application, client):
    cookie = client.get_cookie(application.config['SESSION_COOKIE_NAME'], domain='portal.test')
    assert cookie
    with application.app_context():
        from portal.security import digest
        hashed = digest(cookie.value)
    with application.extensions['portal_sessionmaker']() as db:
        browser = db.scalar(select(BrowserSession).where(BrowserSession.token_hash == hashed))
        return browser.pending_challenge


def signup(application, client, email='citizen@example.test', name='Citizen Example', lang='en'):
    response = post(client, f'/{lang}/register', {'name': name, 'email': email, 'password': PASSWORD,
                    'confirm_password': PASSWORD, 'consent': 'yes'})
    assert response.status_code == 302
    response = post(client, f'/{lang}/verify', {'challenge_id': challenge(application, client),
                    'otp': application.extensions['capture'].code(email)}, csrf=token(client, f'/{lang}/verify'))
    assert response.status_code == 302
    return response


def owner(application, client):
    signup(application, client, 'owner@example.test', 'Project Owner')
    assert get(client, '/en/admin').status_code == 302
    csrf = token(client, '/en/admin/mfa')
    assert post(client, '/en/admin/mfa/setup', {'intent': 'start'}, csrf).status_code == 302
    with application.extensions['portal_sessionmaker']() as db:
        row = db.scalar(select(BrowserSession).where(BrowserSession.pending_totp_secret.is_not(None)))
        secret = application.extensions['portal_cipher'].decrypt(row.pending_totp_secret.encode()).decode()
    assert post(client, '/en/admin/mfa/setup', {'intent': 'confirm', 'code': pyotp.TOTP(secret).now()}, token(client, '/en/admin/mfa')).status_code == 302
    assert get(client, '/en/admin').status_code == 200
    return secret


def create_case(client, subject='Suspicious payment request'):
    response = post(client, '/en/cases/new', {'subject': subject, 'category': 'financial',
                    'details': 'I received a suspicious payment request and need guidance.', 'consent': 'yes'}, token(client, '/en/cases/new'))
    assert response.status_code == 302
    return response.headers['Location'].rsplit('/', 1)[-1]


@pytest.mark.parametrize('lang', ['en', 'hi', 'te'])
def test_real_localized_pages(application, lang):
    client = application.test_client()
    for path in [f'/{lang}/', f'/{lang}/register', f'/{lang}/login', f'/{lang}/admin/login', f'/{lang}/forgot']:
        response = get(client, path)
        assert response.status_code == 200
        assert f'<html lang="{lang}">'.encode() in response.data
        assert b'cs-logo.svg' in response.data
    home = get(client, f'/{lang}/').get_data(as_text=True)
    assert 'id="operations-details"' not in home and 'id="glossary"' not in home
    assert home.count('<tr data-group=') == 20


def test_registration_verifies_mail_and_hashes_site_password(application):
    client = application.test_client()
    signup(application, client)
    with application.extensions['portal_sessionmaker']() as db:
        user = db.scalar(select(User))
        assert user.role == 'citizen' and user.verified_at
        assert PASSWORD not in user.password_hash and user.password_hash.startswith('scrypt:')
        assert db.scalar(select(LoginEvent).where(LoginEvent.success.is_(True))).email == user.email
        assert db.scalar(select(Challenge)) is None
    assert get(client, '/en/cases').status_code == 200
    assert get(client, '/en/admin').status_code == 403


def test_code_expiry_attempts_and_reuse(application):
    client = application.test_client()
    assert post(client, '/en/register', {'name': 'Test Citizen', 'email': 'bounded@example.test', 'password': PASSWORD,
                'confirm_password': PASSWORD, 'consent': 'yes'}).status_code == 302
    cid = challenge(application, client)
    real = application.extensions['capture'].code('bounded@example.test')
    wrong = '000000' if real != '000000' else '111111'
    csrf = token(client, '/en/verify')
    for _ in range(5):
        assert post(client, '/en/verify', {'challenge_id': cid, 'otp': wrong}, csrf).status_code == 422
    assert post(client, '/en/verify', {'challenge_id': cid, 'otp': real}, csrf).status_code == 422
    with application.extensions['portal_sessionmaker']() as db:
        row = db.get(Challenge, cid)
        assert row.attempts == 5
        assert db.scalar(select(User)) is None


def test_expired_correct_otp_cannot_create_account(application):
    client = application.test_client()
    post(client, '/en/register', {'name': 'Expired Citizen', 'email': 'expired@example.test', 'password': PASSWORD,
         'confirm_password': PASSWORD, 'consent': 'yes'})
    cid = challenge(application, client)
    with application.extensions['portal_sessionmaker']() as db:
        db.get(Challenge, cid).expires_at = int(time.time()) - 1
        db.commit()
    assert post(client, '/en/verify', {'challenge_id': cid, 'otp': application.extensions['capture'].code('expired@example.test')}).status_code == 422


def test_signin_requires_password_then_fresh_email_code(application):
    client = application.test_client()
    signup(application, client)
    assert post(client, '/en/logout', {}, token(client, '/en/cases')).status_code == 302
    assert get(client, '/en/cases').status_code == 302
    bad = post(client, '/en/login', {'email': 'citizen@example.test', 'password': 'wrong password'})
    assert bad.status_code == 401
    assert post(client, '/en/login', {'email': 'citizen@example.test', 'password': PASSWORD}).status_code == 302
    assert get(client, '/en/cases').status_code == 302
    cid, code = challenge(application, client), application.extensions['capture'].code('citizen@example.test')
    assert post(client, '/en/verify', {'challenge_id': cid, 'otp': code}, token(client, '/en/verify')).status_code == 302
    assert get(client, '/en/cases').status_code == 200
    assert post(client, '/en/verify', {'challenge_id': cid, 'otp': code}, token(client, '/en/cases')).status_code == 422


def test_test_rollout_allows_only_configured_owner_registration(application):
    application.config['PUBLIC_REGISTRATION'] = False
    client = application.test_client()
    assert post(client, '/en/register', {'name': 'Citizen Example', 'email': 'citizen@example.test', 'password': PASSWORD,
                'confirm_password': PASSWORD, 'consent': 'yes'}).status_code == 403
    signup(application, client, 'owner@example.test', 'Owner Example')


def test_mail_failure_does_not_authenticate_or_expose_otp(application):
    client = application.test_client()
    application.extensions['capture'].fail = True
    response = post(client, '/en/register', {'name': 'Citizen Example', 'email': 'failure@example.test', 'password': PASSWORD,
                    'confirm_password': PASSWORD, 'consent': 'yes'})
    assert response.status_code == 503
    assert PASSWORD.encode() not in response.data
    with application.extensions['portal_sessionmaker']() as db:
        assert db.scalar(select(User)) is None
        assert db.scalar(select(Challenge)).consumed_at


def test_no_production_test_mail_transport(application):
    config = {**application.config, 'TESTING': False}
    with pytest.raises(ValueError, match='forbidden'):
        Mailer(config)


def test_citizen_case_is_private_and_transactionally_queued(application):
    first, other = application.test_client(), application.test_client()
    signup(application, first)
    signup(application, other, 'other@example.test', 'Other Citizen')
    identifier = create_case(first)
    assert get(first, '/en/cases/' + identifier).status_code == 200
    assert get(other, '/en/cases/' + identifier).status_code == 404
    with application.extensions['portal_sessionmaker']() as db:
        row = db.get(Complaint, identifier)
        assert row.status == 'pending'
        assert db.scalar(select(CaseEvent).where(CaseEvent.complaint_id == identifier)).sequence == 1
        assert db.scalar(select(Notification).where(Notification.complaint_id == identifier)).status == 'pending'
    assert dispatch_due(application) == 1
    message = application.extensions['capture'].messages[-1]
    assert message['to'] == 'citizen@example.test' and 'Pending' in message['body']
    assert 'suspicious payment request' not in message['body']
    assert dispatch_due(application) == 0


def test_owner_mfa_status_update_audit_and_conflict(application):
    citizen, admin = application.test_client(), application.test_client()
    signup(application, citizen)
    identifier = create_case(citizen)
    owner(application, admin)
    csrf = token(admin, '/en/admin')
    assert post(admin, '/en/admin/cases/' + identifier, {'status': 'in_review', 'message': 'I am reviewing this case.', 'version': '1'}, csrf).status_code == 302
    assert post(admin, '/en/admin/cases/' + identifier, {'status': 'resolved', 'message': 'Old edit must not overwrite.', 'version': '1'}, csrf).status_code == 409
    with application.extensions['portal_sessionmaker']() as db:
        row = db.get(Complaint, identifier)
        assert row.status == 'in_review' and row.version == 2
        assert len(db.scalars(select(CaseEvent).where(CaseEvent.complaint_id == identifier)).all()) == 2
        assert db.scalar(select(AuditEvent).where(AuditEvent.action == 'case.updated')).actor_id
        assert len(db.scalars(select(Notification).where(Notification.complaint_id == identifier)).all()) == 2
    body = get(admin, '/en/admin').get_data(as_text=True)
    assert 'citizen@example.test' in body and 'Citizen Example' in body
    assert 'password_hash' not in body and 'code_hash' not in body


def test_owner_content_changes_real_branding_and_xss_is_escaped(application):
    admin = application.test_client()
    owner(application, admin)
    value = {'title': '<script>My own platform</script>', 'logo_url': '/static/img/cs-logo.svg',
             'tagline': {'en': 'Local safety tools', 'hi': 'स्थानीय सुरक्षा साधन', 'te': 'స్థానిక భద్రతా సాధనాలు'}}
    response = post(admin, '/en/admin/content', {'section': 'branding', 'version': '1', 'content': json.dumps(value)}, token(admin, '/en/admin/content'))
    assert response.status_code == 302
    home = get(admin, '/en/').get_data(as_text=True)
    assert '&lt;script&gt;My own platform&lt;/script&gt;' in home
    assert '<script>My own platform</script>' not in home
    assert post(admin, '/en/admin/content', {'section': 'branding', 'version': '1', 'content': json.dumps(value)}, token(admin, '/en/admin/content')).status_code == 409
    value['logo_url'] = 'javascript:alert(1)'
    assert post(admin, '/en/admin/content', {'section': 'branding', 'version': '2', 'content': json.dumps(value)}, token(admin, '/en/admin/content')).status_code == 422


def test_disabling_user_revokes_sessions_and_pending_auth_challenges(application):
    citizen, admin = application.test_client(), application.test_client()
    signup(application, citizen)
    owner(application, admin)
    with application.extensions['portal_sessionmaker']() as db:
        user = db.scalar(select(User).where(User.role == 'citizen'))
        uid = user.id
    assert post(admin, '/en/admin/users/' + uid, {'active': 'no', 'version': '1'}, token(admin, '/en/admin/users')).status_code == 302
    assert get(citizen, '/en/cases').status_code == 302
    with application.extensions['portal_sessionmaker']() as db:
        assert db.scalar(select(BrowserSession).where(BrowserSession.user_id == uid)) is None
        assert not db.get(User, uid).active


def test_invalid_forms_csrf_headers_and_hosts_fail_closed(application):
    client = application.test_client()
    assert client.post('/en/register', base_url=BASE, data={}).status_code == 403
    csrf = token(client)
    assert client.post('/en/register', base_url=BASE, data={'csrf_token': csrf}, headers={'Origin': 'https://evil.example'}).status_code == 403
    assert client.get('/en/', base_url='https://evil.example').status_code == 400
    assert client.get('/en/', base_url='http://portal.test').status_code == 400
    assert client.get('/healthz', base_url='http://portal.test').status_code == 200
    response = get(client, '/en/')
    assert response.headers['X-Frame-Options'] == 'DENY'
    assert response.headers['X-Content-Type-Options'] == 'nosniff'
    assert response.headers['Cache-Control'] == 'no-store'
    assert "frame-ancestors 'none'" in response.headers['Content-Security-Policy']


def test_notification_failure_retries_without_changing_case(application):
    client = application.test_client()
    signup(application, client)
    identifier = create_case(client)
    application.extensions['capture'].fail = True
    assert dispatch_due(application) == 0
    with application.extensions['portal_sessionmaker']() as db:
        job = db.scalar(select(Notification))
        assert job.status == 'pending' and job.attempts == 1 and job.last_error == 'delivery_failed'
        assert db.get(Complaint, identifier).status == 'pending'
        job.due_at = 0
        db.commit()
    application.extensions['capture'].fail = False
    assert dispatch_due(application) == 1


def test_login_limits_do_not_silently_reset(application):
    client = application.test_client()
    csrf = token(client)
    for _ in range(6):
        assert post(client, '/en/login', {'email': 'bounded@example.test', 'password': PASSWORD}, csrf).status_code == 401
    assert post(client, '/en/login', {'email': 'bounded@example.test', 'password': PASSWORD}, csrf).status_code == 429


def test_private_testing_limits_pages_and_registration_to_owner(application):
    application.config['PRIVATE_MODE'] = True
    application.config['PUBLIC_REGISTRATION'] = True
    citizen = application.test_client()
    assert get(citizen, '/en/').status_code == 302
    csrf = token(citizen, '/en/register')
    refused = post(citizen, '/en/register', {'name': 'Unapproved person', 'email': 'other@example.test',
                   'password': PASSWORD, 'confirm_password': PASSWORD, 'consent': 'yes'}, csrf=csrf)
    assert refused.status_code == 403
    assert application.extensions['capture'].messages == []
    with application.extensions['portal_sessionmaker']() as db:
        assert db.scalar(select(User).where(User.email == 'other@example.test')) is None
    csrf = token(citizen, '/en/register')
    accepted = post(citizen, '/en/register', {'name': 'Independent owner', 'email': 'owner@example.test',
                    'password': PASSWORD, 'confirm_password': PASSWORD, 'consent': 'yes'}, csrf=csrf)
    assert accepted.status_code == 302
    verified = post(citizen, '/en/verify', {'challenge_id': challenge(application, citizen),
                    'otp': application.extensions['capture'].code('owner@example.test')}, csrf=token(citizen, '/en/verify'))
    assert verified.status_code == 302
    assert get(citizen, '/en/').status_code == 200


def test_background_retention_prunes_only_expired_login_metadata(application):
    from portal.maintenance import prune_security_state
    from portal.models import LoginEvent
    now = int(time.time())
    with application.extensions['portal_sessionmaker']() as db:
        db.add_all([LoginEvent(email='expired@example.test', name='Old', success=False, reason='invalid',
                               ip_label='127.0.0.0/24', created_at=now - 31 * 86400),
                    LoginEvent(email='current@example.test', name='Current', success=False, reason='invalid',
                               ip_label='127.0.0.0/24', created_at=now)])
        db.commit()
    prune_security_state(application)
    with application.extensions['portal_sessionmaker']() as db:
        assert [row.email for row in db.scalars(select(LoginEvent)).all()] == ['current@example.test']
