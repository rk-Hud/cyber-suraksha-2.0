"""Delete expired authentication state without touching support case records."""
import time

from sqlalchemy import delete, select

from .models import BrowserSession, Challenge, LoginEvent, RateBucket


def prune_security_state(app):
    now = int(time.time())
    with app.extensions["portal_sessionmaker"]() as db:
        db.execute(delete(Challenge).where(Challenge.expires_at < now - 3600))
        expired = select(BrowserSession.id).where(BrowserSession.expires_at < now)
        db.execute(delete(Challenge).where(Challenge.browser_id.in_(expired)))
        db.execute(delete(BrowserSession).where(BrowserSession.expires_at < now))
        db.execute(delete(RateBucket).where(RateBucket.window < now - 86_400))
        db.execute(delete(LoginEvent).where(LoginEvent.created_at < now - app.config["LOGIN_RETENTION_DAYS"] * 86_400))
        db.commit()
