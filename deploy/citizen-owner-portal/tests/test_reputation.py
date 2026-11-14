"""Hash-prefix relay regression tests; no real provider credentials or network calls."""
import base64
import json

import pytest
import requests
from flask import Flask, abort, request

from addons.reputation import (ENDPOINT, ProviderUnavailable, ReputationService,
                               decode_bytes, register_reputation,
                               sanitize_response, validate_prefixes)


def encoded(value):
    return base64.b64encode(value).decode('ascii')


PREFIX = encoded(b'abcd')
DIGEST = encoded(b'abcd' + bytes(28))


def response(*details, duration='300s', digest=DIGEST):
    return {'cacheDuration': duration, 'fullHashes': [
        {'fullHash': digest, 'fullHashDetails': list(details) or [{'threatType': 'MALWARE', 'attributes': []}]}
    ]}


@pytest.mark.parametrize('payload', [None, [], {'url': 'https://private.example'},
    {'prefixes': [PREFIX], 'message': 'private text'}, {'prefixes': []},
    {'prefixes': [PREFIX] * 31}, {'prefixes': ['abcd']}, {'prefixes': ['YWJjZA']},
    {'prefixes': [42]}, {'prefixes': [encoded(bytes(32))]}])
def test_input_schema_accepts_no_url_or_message(payload):
    with pytest.raises(ValueError):
        validate_prefixes(payload)


def test_prefix_encoding_is_canonical_and_duplicates_are_collapsed():
    assert validate_prefixes({'prefixes': [PREFIX, PREFIX]}) == [PREFIX]
    assert decode_bytes(PREFIX, 4) == b'abcd'


def test_response_filters_unknown_attributes_and_non_enforceable_reports():
    raw = response(
        {'threatType': 'SOCIAL_ENGINEERING', 'attributes': []},
        {'threatType': 'MALWARE', 'attributes': ['CANARY']},
        {'threatType': 'UNWANTED_SOFTWARE', 'attributes': ['FRAME_ONLY']},
        {'threatType': 'POTENTIALLY_HARMFUL_APPLICATION', 'attributes': ['FUTURE_ATTRIBUTE']},
        {'threatType': 'FUTURE_THREAT', 'attributes': []},
        {'threatType': {}, 'attributes': []},
    )
    records, ttl = sanitize_response(raw, [PREFIX])
    assert ttl == 300
    assert records == [{'fullHash': DIGEST, 'fullHashDetails': [
        {'threatType': 'SOCIAL_ENGINEERING', 'attributes': []}]}]


def test_foreign_prefixes_and_unknown_details_do_not_become_matches():
    records, _ = sanitize_response(response(digest=encoded(b'evil' + bytes(28))), [PREFIX])
    assert records == []
    records, _ = sanitize_response(response({'threatType': 'THREAT_TYPE_UNSPECIFIED'}), [PREFIX])
    assert records == []


@pytest.mark.parametrize('raw', [None, {}, {'cacheDuration': 'forever'},
    {'cacheDuration': '-1s'}, {'cacheDuration': 'NaNs'}, {'cacheDuration': '86401s'},
    {'cacheDuration': '3s', 'fullHashes': 'wrong'},
    {'cacheDuration': '3s', 'fullHashes': [{'fullHash': 'not-a-hash'}]}])
def test_malformed_provider_data_is_unavailable_not_safe(raw):
    with pytest.raises(ProviderUnavailable):
        sanitize_response(raw, [PREFIX])


def test_provider_ttl_is_not_treated_as_unlimited_protection():
    assert sanitize_response(response(duration='3600s'), [PREFIX])[1] == 1800
    assert sanitize_response({'cacheDuration': '12.125s'}, [PREFIX]) == ([], 12.125)


def test_positive_and_negative_results_use_the_provider_cache_duration():
    clock = [100.0]
    calls = []
    def fetch(prefixes):
        calls.append(prefixes)
        return {'cacheDuration': '5s', 'fullHashes': []}
    service = ReputationService('test-key', transport=fetch, clock=lambda: clock[0], wall_clock=lambda: clock[0] + 1000)
    first = service.lookup([PREFIX])
    clock[0] += 2
    second = service.lookup([PREFIX])
    assert len(calls) == 1
    assert first['fullHashes'] == [] and second['coverage'] == 'listed_threats_only'
    assert second['observedAt'] == first['observedAt']
    clock[0] += 4
    service.lookup([PREFIX])
    assert len(calls) == 2


def test_cache_eviction_during_a_fetch_cannot_drop_this_requests_snapshot():
    other = encoded(b'next')
    service = ReputationService('test-key', transport=lambda _: response())
    service.lookup([PREFIX])
    def evict(prefixes):
        service._cache.clear()
        return {'cacheDuration': '5s', 'fullHashes': []}
    service._transport = evict
    result = service.lookup([PREFIX, other])
    assert result['fullHashes'][0]['fullHash'] == DIGEST


def test_repeated_failures_open_a_short_circuit_without_a_false_verdict():
    clock = [100.0]
    calls = []
    def fail(prefixes):
        calls.append(prefixes)
        raise ProviderUnavailable()
    service = ReputationService('test-key', transport=fail, clock=lambda: clock[0])
    for _ in range(4):
        with pytest.raises(ProviderUnavailable): service.lookup([PREFIX])
    assert len(calls) == 3
    clock[0] += 61
    service._transport = lambda _: {'cacheDuration': '1s', 'fullHashes': []}
    assert service.lookup([PREFIX])['fullHashes'] == []


def test_http_transport_is_fixed_host_no_redirects_and_does_not_propagate_key(monkeypatch):
    captured = {}
    class Network:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def get(self, url, **kwargs):
            captured.update(url=url, **kwargs)
            raise requests.ConnectionError('private upstream URL ?key=secret-test-key')
    monkeypatch.setattr('addons.reputation.requests.Session', Network)
    service = ReputationService('secret-test-key')
    with pytest.raises(ProviderUnavailable) as error:
        service.lookup([PREFIX])
    assert 'secret-test-key' not in str(error.value)
    assert captured['url'] == ENDPOINT
    assert captured['allow_redirects'] is False
    assert captured['timeout'] == (3, 6)
    assert captured['params'] == [('key', 'secret-test-key'), ('hashPrefixes', PREFIX)]


@pytest.fixture
def client():
    app = Flask(__name__)
    app.config.update(TESTING=True, PUBLIC_BASE_URL='https://portal.example',
        SAFEBROWSING_API_KEY='test-key', REPUTATION_TEST_TRANSPORT=lambda prefixes: response())
    def csrf():
        if request.headers.get('X-CSRF-Token') != 'test-csrf': abort(403)
    def limit(scope, limit, period):
        assert (scope, limit, period) == ('reputation', 10, 60)
    register_reputation(app, csrf, limit)
    return app.test_client()


def post(client, payload=None, **kwargs):
    return client.post('/api/reputation', base_url='https://portal.example',
        headers={'Origin': 'https://portal.example', 'X-CSRF-Token': 'test-csrf', **kwargs.pop('headers', {})},
        json=payload if payload is not None else {'prefixes': [PREFIX]}, **kwargs)


def test_route_requires_same_origin_csrf_and_hash_only_schema(client):
    assert client.get('/api/reputation').status_code == 405
    assert post(client, headers={'Origin': 'https://foreign.example'}).status_code == 403
    assert post(client, headers={'X-CSRF-Token': 'wrong'}).status_code == 403
    assert post(client, {'prefixes': [PREFIX], 'url': 'https://never-transmit.example'}).status_code == 422
    result = post(client)
    assert result.status_code == 200
    assert result.json['fullHashes'][0]['fullHash'] == DIGEST
    assert result.headers['Cache-Control'] == 'private, no-store'
    assert 'safe' not in result.json


def test_provider_is_disabled_without_credentials():
    app = Flask(__name__)
    app.config.update(TESTING=True, PUBLIC_BASE_URL='https://portal.example', SAFEBROWSING_API_KEY='')
    register_reputation(app, lambda: None, lambda *args, **kwargs: None)
    assert app.extensions['reputation_service'] is None
    assert post(app.test_client()).status_code == 503


def test_cache_bounds_both_prefix_count_and_full_hash_record_count():
    clock = [0.0]
    empty = ReputationService('test-key', transport=lambda _: {'cacheDuration': '1800s', 'fullHashes': []}, clock=lambda: clock[0])
    for batch in range(69):
        prefixes = [encoded(index.to_bytes(4, 'big')) for index in range(batch * 30, batch * 30 + 30)]
        empty.lookup(prefixes)
        clock[0] += 1
    assert len(empty._cache) == 2048
    assert encoded(bytes(4)) not in empty._cache

    def populated(prefixes):
        prefix = decode_bytes(prefixes[0], 4)
        return {'cacheDuration': '1800s', 'fullHashes': [
            {'fullHash': encoded(prefix + index.to_bytes(28, 'big')),
             'fullHashDetails': [{'threatType': 'MALWARE', 'attributes': []}]}
            for index in range(1024)]}
    service = ReputationService('test-key', transport=populated)
    for index in range(5):
        assert len(service.lookup([encoded(index.to_bytes(4, 'big'))])['fullHashes']) == 1024
    assert service._record_count == 4096
    assert sum(len(value.records) for value in service._cache.values()) == 4096
