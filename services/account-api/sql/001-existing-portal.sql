-- Additive initial schema. Existing users, cases and encrypted owner factors are preserved.


CREATE TABLE IF NOT EXISTS portal_rate_buckets (
	key VARCHAR(64) NOT NULL,
	"window" INTEGER NOT NULL,
	count INTEGER NOT NULL,
	PRIMARY KEY (key, "window")
)

;


CREATE TABLE IF NOT EXISTS portal_site_content (
	section VARCHAR(40) NOT NULL,
	content JSON NOT NULL,
	version INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (section)
)

;


CREATE TABLE IF NOT EXISTS portal_users (
	id VARCHAR(36) NOT NULL,
	email VARCHAR(254) NOT NULL,
	name VARCHAR(100) NOT NULL,
	password_hash TEXT NOT NULL,
	language VARCHAR(2) NOT NULL,
	role VARCHAR(16) NOT NULL,
	active BOOLEAN NOT NULL,
	verified_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	version INTEGER NOT NULL,
	totp_secret TEXT,
	totp_last_step INTEGER NOT NULL,
	PRIMARY KEY (id),
	CHECK (role IN ('citizen','owner')),
	CHECK (version > 0)
)

;


CREATE TABLE IF NOT EXISTS portal_audit_events (
	id VARCHAR(36) NOT NULL,
	actor_id VARCHAR(36) NOT NULL,
	action VARCHAR(40) NOT NULL,
	record VARCHAR(80) NOT NULL,
	metadata_json JSON NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(actor_id) REFERENCES portal_users (id)
)

;


CREATE TABLE IF NOT EXISTS portal_complaints (
	id VARCHAR(36) NOT NULL,
	reference VARCHAR(32) NOT NULL,
	user_id VARCHAR(36) NOT NULL,
	subject VARCHAR(160) NOT NULL,
	category VARCHAR(24) NOT NULL,
	details TEXT NOT NULL,
	status VARCHAR(24) NOT NULL,
	consent_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	version INTEGER NOT NULL,
	PRIMARY KEY (id),
	CHECK (status IN ('pending','in_review','awaiting_info','resolved','closed')),
	UNIQUE (reference),
	FOREIGN KEY(user_id) REFERENCES portal_users (id)
)

;


CREATE TABLE IF NOT EXISTS portal_login_events (
	id VARCHAR(36) NOT NULL,
	user_id VARCHAR(36),
	email VARCHAR(254) NOT NULL,
	name VARCHAR(100) NOT NULL,
	success BOOLEAN NOT NULL,
	reason VARCHAR(32) NOT NULL,
	ip_label VARCHAR(64) NOT NULL,
	user_agent VARCHAR(200) NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES portal_users (id)
)

;


CREATE TABLE IF NOT EXISTS portal_sessions (
	id VARCHAR(36) NOT NULL,
	token_hash VARCHAR(64) NOT NULL,
	user_id VARCHAR(36),
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	authenticated_at INTEGER,
	mfa_at INTEGER,
	pending_challenge VARCHAR(36),
	pending_totp_secret TEXT,
	pending_totp_expires INTEGER,
	notice VARCHAR(64),
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES portal_users (id)
)

;


CREATE TABLE IF NOT EXISTS portal_case_events (
	id VARCHAR(36) NOT NULL,
	complaint_id VARCHAR(36) NOT NULL,
	actor_id VARCHAR(36),
	sequence INTEGER NOT NULL,
	author_role VARCHAR(16) NOT NULL,
	author_name VARCHAR(100) NOT NULL,
	message TEXT NOT NULL,
	old_status VARCHAR(24),
	new_status VARCHAR(24),
	created_at INTEGER NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (complaint_id, sequence),
	FOREIGN KEY(complaint_id) REFERENCES portal_complaints (id),
	FOREIGN KEY(actor_id) REFERENCES portal_users (id)
)

;


CREATE TABLE IF NOT EXISTS portal_challenges (
	id VARCHAR(36) NOT NULL,
	browser_id VARCHAR(36) NOT NULL,
	user_id VARCHAR(36),
	email VARCHAR(254) NOT NULL,
	purpose VARCHAR(24) NOT NULL,
	code_hash VARCHAR(64) NOT NULL,
	payload JSON NOT NULL,
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	attempts INTEGER NOT NULL,
	consumed_at INTEGER,
	PRIMARY KEY (id),
	CHECK (attempts >= 0 AND attempts <= 5),
	FOREIGN KEY(browser_id) REFERENCES portal_sessions (id),
	FOREIGN KEY(user_id) REFERENCES portal_users (id)
)

;


CREATE TABLE IF NOT EXISTS portal_notifications (
	id VARCHAR(36) NOT NULL,
	user_id VARCHAR(36) NOT NULL,
	complaint_id VARCHAR(36) NOT NULL,
	language VARCHAR(2) NOT NULL,
	status VARCHAR(16) NOT NULL,
	case_status VARCHAR(24) NOT NULL,
	reference VARCHAR(32) NOT NULL,
	attempts INTEGER NOT NULL,
	due_at INTEGER NOT NULL,
	leased_at INTEGER,
	sent_at INTEGER,
	last_error VARCHAR(40),
	created_at INTEGER NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES portal_users (id),
	FOREIGN KEY(complaint_id) REFERENCES portal_complaints (id)
)

;

CREATE UNIQUE INDEX IF NOT EXISTS ix_portal_users_email ON portal_users (email);

CREATE INDEX IF NOT EXISTS ix_portal_audit_events_created_at ON portal_audit_events (created_at);

CREATE INDEX IF NOT EXISTS ix_portal_complaints_status ON portal_complaints (status);

CREATE INDEX IF NOT EXISTS ix_portal_complaints_user_id ON portal_complaints (user_id);

CREATE INDEX IF NOT EXISTS ix_portal_login_events_user_id ON portal_login_events (user_id);

CREATE INDEX IF NOT EXISTS ix_portal_login_events_created_at ON portal_login_events (created_at);

CREATE INDEX IF NOT EXISTS ix_portal_sessions_expires_at ON portal_sessions (expires_at);

CREATE INDEX IF NOT EXISTS ix_portal_sessions_user_id ON portal_sessions (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS ix_portal_sessions_token_hash ON portal_sessions (token_hash);

CREATE INDEX IF NOT EXISTS ix_portal_case_events_complaint_id ON portal_case_events (complaint_id);

CREATE INDEX IF NOT EXISTS ix_portal_challenges_browser_id ON portal_challenges (browser_id);

CREATE INDEX IF NOT EXISTS ix_portal_challenges_expires_at ON portal_challenges (expires_at);

CREATE INDEX IF NOT EXISTS ix_portal_notifications_status ON portal_notifications (status);

CREATE INDEX IF NOT EXISTS ix_portal_notifications_user_id ON portal_notifications (user_id);

CREATE INDEX IF NOT EXISTS ix_portal_notifications_due_at ON portal_notifications (due_at);

CREATE INDEX IF NOT EXISTS ix_portal_notifications_complaint_id ON portal_notifications (complaint_id);
