"""Privacy-preserving Google Safe Browsing V5 hash-prefix relay.

Only four-byte prefixes are accepted. The server never accepts, canonicalizes,
visits or forwards a citizen's URL or message. See docs/REPUTATION.md.
"""
from __future__ import annotations

import base64
import binascii
import json
import math
import os
import re
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Callable
from urllib.parse import urlsplit

import requests
from flask import Blueprint, abort, jsonify, request

ENDPOINT = "https://safebrowsing.googleapis.com/v5/hashes:search"
THREATS = frozenset({"MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"})
ATTRIBUTES = frozenset({"CANARY", "FRAME_ONLY"})
MAX_PREFIXES = 30
MAX_RESPONSE_BYTES = 262_144
DURATION = re.compile(r"(?:0|[1-9][0-9]*)(?:\.[0-9]{1,9})?s\Z")


class ProviderUnavailable(Exception):
    """No upstream error message or URL is carried in this exception."""


def decode_bytes(value, size):
    if not isinstance(value, str) or len(value) > 64:
        raise ValueError("Invalid hash encoding")
    try:
        decoded = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error):
        raise ValueError("Invalid hash encoding") from None
    if len(decoded) != size or base64.b64encode(decoded).decode("ascii") != value:
        raise ValueError("Invalid hash length")
    return decoded


def validate_prefixes(payload):
    if not isinstance(payload, dict) or set(payload) != {"prefixes"}:
        raise ValueError("Only hash prefixes are accepted")
    values = payload["prefixes"]
    if not isinstance(values, list) or not 1 <= len(values) <= MAX_PREFIXES:
        raise ValueError("Invalid prefix count")
    result = []
    for value in values:
        decode_bytes(value, 4)
        if value not in result:
            result.append(value)
    return result


def sanitize_response(payload, prefixes):
    """Discard future/invalid enums and non-enforceable threat details."""
    if not isinstance(payload, dict) or not isinstance(payload.get("cacheDuration"), str):
        raise ProviderUnavailable()
    duration = payload["cacheDuration"]
    if not DURATION.fullmatch(duration):
        raise ProviderUnavailable()
    seconds = float(duration[:-1])
    if not math.isfinite(seconds) or seconds > 86_400:
        raise ProviderUnavailable()
    hashes = payload.get("fullHashes", [])
    if not isinstance(hashes, list) or len(hashes) > 1024:
        raise ProviderUnavailable()
    allowed = {decode_bytes(value, 4) for value in prefixes}
    output = []
    for record in hashes:
        if not isinstance(record, dict):
            raise ProviderUnavailable()
        try:
            digest = decode_bytes(record.get("fullHash"), 32)
        except ValueError:
            raise ProviderUnavailable() from None
        if digest[:4] not in allowed:
            continue
        details = record.get("fullHashDetails", [])
        if not isinstance(details, list) or len(details) > 32:
            raise ProviderUnavailable()
        accepted = set()
        for detail in details:
            if not isinstance(detail, dict):
                continue
            kind = detail.get("threatType")
            attributes = detail.get("attributes", [])
            if not isinstance(kind, str) or kind not in THREATS or not isinstance(attributes, list):
                continue
            # Google's forward-compatibility rule rejects the entire detail
            # for an unknown attribute. Canary/frame-only are not top-level hits.
            if any(not isinstance(value, str) or value not in ATTRIBUTES for value in attributes):
                continue
            if attributes:
                continue
            accepted.add(kind)
        if accepted:
            output.append({"fullHash": record["fullHash"],
                           "fullHashDetails": [{"threatType": value, "attributes": []} for value in sorted(accepted)]})
    # Current threat warnings must have a provider observation within 30 minutes.
    return output, min(seconds, 1800.0)


@dataclass(frozen=True)
class CachedPrefix:
    expires: float
    observed: float
    records: tuple


class ReputationService:
    """Bounded process-local cache and upstream failure budget; no query logs."""
    def __init__(self, api_key: str, *, transport=None, clock=time.monotonic, wall_clock=time.time):
        self._api_key = api_key
        self._transport = transport or self._request_google
        self._clock, self._wall_clock = clock, wall_clock
        self._cache = OrderedDict()
        self._record_count = 0
        self._lock = threading.RLock()
        self._slots = threading.BoundedSemaphore(2)
        self._failures = 0
        self._open_until = 0.0
        self._budget_window = 0
        self._budget_count = 0

    def _request_google(self, prefixes):
        # The endpoint is fixed; caller-provided strings cannot become a URL.
        parameters = [("key", self._api_key), *[("hashPrefixes", value) for value in prefixes]]
        try:
            deadline = time.monotonic() + 10
            with requests.Session() as session:
                with session.get(ENDPOINT, params=parameters, headers={"Accept": "application/json"},
                                 timeout=(3, 6), allow_redirects=False, stream=True) as response:
                    if response.status_code != 200 or response.headers.get("Content-Type", "").split(";", 1)[0].strip() != "application/json":
                        raise ProviderUnavailable()
                    body = bytearray()
                    for chunk in response.iter_content(chunk_size=8192):
                        body.extend(chunk)
                        if len(body) > MAX_RESPONSE_BYTES or time.monotonic() > deadline:
                            raise ProviderUnavailable()
                    return json.loads(body)
        except (requests.RequestException, ValueError, UnicodeError):
            # requests exceptions may contain a URL with the key; never propagate it.
            raise ProviderUnavailable() from None

    def lookup(self, prefixes):
        now = self._clock()
        with self._lock:
            if self._open_until > now:
                raise ProviderUnavailable()
            resolved = {value: self._cache[value] for value in prefixes if value in self._cache and self._cache[value].expires > now}
            missing = [value for value in prefixes if value not in resolved]
            if missing:
                window = int(now // 60)
                self._budget_count = self._budget_count + 1 if self._budget_window == window else 1
                self._budget_window = window
                if self._budget_count > 60:
                    raise ProviderUnavailable()
        if missing:
            if not self._slots.acquire(blocking=False):
                raise ProviderUnavailable()
            try:
                raw = self._transport(missing)
                records, duration = sanitize_response(raw, missing)
                checked_at = self._wall_clock()
                fetched = self._clock()
                grouped = {prefix: [] for prefix in missing}
                for record in records:
                    prefix = base64.b64encode(decode_bytes(record["fullHash"], 32)[:4]).decode("ascii")
                    grouped[prefix].append(record)
                with self._lock:
                    for prefix in missing:
                        entry = CachedPrefix(fetched + duration, checked_at, tuple(grouped[prefix]))
                        previous = self._cache.get(prefix)
                        self._record_count += len(entry.records) - (len(previous.records) if previous else 0)
                        self._cache[prefix] = entry
                        resolved[prefix] = entry
                        self._cache.move_to_end(prefix)
                    while len(self._cache) > 2048 or self._record_count > 4096:
                        _, removed = self._cache.popitem(last=False)
                        self._record_count -= len(removed.records)
                    self._failures, self._open_until = 0, 0.0
            except ProviderUnavailable:
                with self._lock:
                    self._failures += 1
                    if self._failures >= 3:
                        self._open_until = self._clock() + 60
                raise
            finally:
                self._slots.release()
        with self._lock:
            cached = [resolved[prefix] for prefix in prefixes]
            unique = {}
            for item in cached:
                for record in item.records:
                    unique[record["fullHash"]] = record
            duration = max(0.0, min(item.expires for item in cached) - self._clock())
            return {"provider": "google_safe_browsing_v5", "fullHashes": list(unique.values()),
                    "cacheDuration": f"{duration:.3f}s", "observedAt": min(item.observed for item in cached),
                    "coverage": "listed_threats_only"}


def register_reputation(app, csrf_check: Callable, rate_limit: Callable):
    """Mount using the portal's existing CSRF and shared database rate controls."""
    api_key = app.config.get("SAFEBROWSING_API_KEY") or os.environ.get("SAFEBROWSING_API_KEY", "")
    origin = (app.config.get("PUBLIC_BASE_URL") or app.config.get("PUBLIC_ORIGIN") or app.config.get("BASE_URL") or "").rstrip("/")
    parsed = urlsplit(origin)
    if api_key and (parsed.scheme != "https" or not parsed.netloc or parsed.path or parsed.query or parsed.fragment):
        raise ValueError("A canonical HTTPS PUBLIC_BASE_URL is required for reputation checks")
    service = ReputationService(api_key) if api_key else None
    if app.config.get("TESTING") and app.config.get("REPUTATION_TEST_TRANSPORT") and service:
        service = ReputationService(api_key, transport=app.config["REPUTATION_TEST_TRANSPORT"])
    app.extensions["reputation_service"] = service
    blueprint = Blueprint("reputation", __name__)

    @app.context_processor
    def reputation_context():
        return {"reputation_enabled": service is not None}

    @blueprint.post("/api/reputation")
    def reputation_lookup():
        if request.headers.get("Origin") != origin or request.query_string or request.content_encoding:
            abort(403)
        csrf_check()
        rate_limit("reputation", limit=10, period=60)
        if service is None:
            return jsonify(error="reputation_unavailable"), 503
        if request.content_length is not None and request.content_length > 4096:
            abort(413)
        if request.mimetype != "application/json":
            abort(415)
        try:
            body = request.stream.read(4097)
            if len(body) > 4096:
                abort(413)
            prefixes = validate_prefixes(json.loads(body))
        except (ValueError, TypeError, UnicodeError):
            return jsonify(error="invalid_prefixes"), 422
        try:
            result = service.lookup(prefixes)
        except ProviderUnavailable:
            response = jsonify(error="reputation_unavailable")
            response.status_code = 503
            response.headers["Retry-After"] = "60"
            return response
        response = jsonify(result)
        response.headers["Cache-Control"] = "private, no-store"
        return response

    app.register_blueprint(blueprint)
