"""Persisted account, case and audit state. No citizen-tool input is collected."""
from __future__ import annotations

import time
import uuid
from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, JSON, Index, CheckConstraint, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def identifier():
    return str(uuid.uuid4())


def now():
    return int(time.time())


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "portal_users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(2), default="en")
    role: Mapped[str] = mapped_column(String(16), default="citizen")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    verified_at: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[int] = mapped_column(Integer, default=now)
    updated_at: Mapped[int] = mapped_column(Integer, default=now)
    version: Mapped[int] = mapped_column(Integer, default=1)
    totp_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    totp_last_step: Mapped[int] = mapped_column(Integer, default=-1)
    __table_args__ = (CheckConstraint("role IN ('citizen','owner')"), CheckConstraint("version > 0"))

    @property
    def totp_enabled(self):
        return bool(self.totp_secret)


class BrowserSession(Base):
    __tablename__ = "portal_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("portal_users.id"), nullable=True, index=True)
    created_at: Mapped[int] = mapped_column(Integer, default=now)
    expires_at: Mapped[int] = mapped_column(Integer, index=True)
    authenticated_at: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mfa_at: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pending_challenge: Mapped[str | None] = mapped_column(String(36), nullable=True)
    pending_totp_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    pending_totp_expires: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notice: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user: Mapped[User | None] = relationship()


class Challenge(Base):
    __tablename__ = "portal_challenges"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    browser_id: Mapped[str] = mapped_column(ForeignKey("portal_sessions.id"), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("portal_users.id"), nullable=True)
    email: Mapped[str] = mapped_column(String(254))
    purpose: Mapped[str] = mapped_column(String(24))
    code_hash: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[int] = mapped_column(Integer, default=now)
    expires_at: Mapped[int] = mapped_column(Integer, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed_at: Mapped[int | None] = mapped_column(Integer, nullable=True)
    __table_args__ = (CheckConstraint("attempts >= 0 AND attempts <= 5"),)


class LoginEvent(Base):
    __tablename__ = "portal_login_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("portal_users.id"), nullable=True, index=True)
    email: Mapped[str] = mapped_column(String(254))
    name: Mapped[str] = mapped_column(String(100), default="")
    success: Mapped[bool] = mapped_column(Boolean)
    reason: Mapped[str] = mapped_column(String(32))
    ip_label: Mapped[str] = mapped_column(String(64))
    user_agent: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[int] = mapped_column(Integer, default=now, index=True)


class RateBucket(Base):
    __tablename__ = "portal_rate_buckets"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    window: Mapped[int] = mapped_column(Integer, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=1)


class Complaint(Base):
    __tablename__ = "portal_complaints"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    reference: Mapped[str] = mapped_column(String(32), unique=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("portal_users.id"), index=True)
    subject: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(24))
    details: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="pending", index=True)
    consent_at: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[int] = mapped_column(Integer, default=now)
    updated_at: Mapped[int] = mapped_column(Integer, default=now)
    version: Mapped[int] = mapped_column(Integer, default=1)
    user: Mapped[User] = relationship()
    __table_args__ = (CheckConstraint("status IN ('pending','in_review','awaiting_info','resolved','closed')"),)


class CaseEvent(Base):
    __tablename__ = "portal_case_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("portal_complaints.id"), index=True)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("portal_users.id"), nullable=True)
    sequence: Mapped[int] = mapped_column(Integer)
    author_role: Mapped[str] = mapped_column(String(16))
    author_name: Mapped[str] = mapped_column(String(100))
    message: Mapped[str] = mapped_column(Text)
    old_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    new_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    created_at: Mapped[int] = mapped_column(Integer, default=now)


    __table_args__ = (UniqueConstraint("complaint_id", "sequence"),)


class Notification(Base):
    __tablename__ = "portal_notifications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    user_id: Mapped[str] = mapped_column(ForeignKey("portal_users.id"), index=True)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("portal_complaints.id"), index=True)
    language: Mapped[str] = mapped_column(String(2))
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    case_status: Mapped[str] = mapped_column(String(24))
    reference: Mapped[str] = mapped_column(String(32))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    due_at: Mapped[int] = mapped_column(Integer, default=now, index=True)
    leased_at: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sent_at: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[int] = mapped_column(Integer, default=now)
    user: Mapped[User] = relationship()


class SiteContent(Base):
    __tablename__ = "portal_site_content"
    section: Mapped[str] = mapped_column(String(40), primary_key=True)
    content: Mapped[dict | list] = mapped_column(JSON)
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[int] = mapped_column(Integer, default=now)


class AuditEvent(Base):
    __tablename__ = "portal_audit_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    actor_id: Mapped[str] = mapped_column(ForeignKey("portal_users.id"))
    action: Mapped[str] = mapped_column(String(40))
    record: Mapped[str] = mapped_column(String(80))
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[int] = mapped_column(Integer, default=now, index=True)
