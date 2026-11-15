# Optional URL reputation evidence

The local checker remains usable without this integration. It does not need a Google key, transmit pasted content or fetch a suspicious address. The optional lookup adds current **listed-threat evidence** for a single web address; it cannot determine the safety of every URL, authenticate a message's sender, or convert a heuristic score into a fraud probability.

## What actually leaves the browser

After the visitor explicitly chooses the optional check, the browser normalizes a supported HTTP/HTTPS URL, builds the documented host/path expressions and computes SHA-256 locally. It sends only the first four bytes of each digest, as at most 30 standard-base64 prefixes, to `POST /api/reputation` on this same origin. Full hashes and the original URL/message stay in page memory. The server schema rejects URL, message and additional fields. It never resolves or visits the suspicious host.

The server calls the fixed Google endpoint `GET https://safebrowsing.googleapis.com/v5/hashes:search` with its API key and the required repeated `hashPrefixes` parameters. Google returns full hashes and threat details. The browser compares **complete 32-byte hashes**, so a shared four-byte prefix is not itself a threat match.

Hash prefixes are not a guarantee of anonymity: a party with candidate URLs can calculate their prefixes and draw inferences. Ordinary website/provider connections also reveal connection metadata. No URL or pasted message is included in this relay's request body, response, application logs or database. Do not enable HTTP-client debug logging, because the provider API key is an upstream URL parameter.

## Configuration and mounting

Set `SAFEBROWSING_API_KEY` through the protected Render environment configuration after obtaining an appropriate Google key, enabling the API and restricting its API/quota settings. Never put the key in source, templates, browser code, `.env.example`, chat, logs or the project dossier. This is separate from OpenAI API access; an OpenAI key does not provide Google reputation evidence.

The app factory registers:

```python
from addons.reputation import register_reputation
from portal.security import csrf_check, rate_limit
register_reputation(app, csrf_check, rate_limit)
```

The canonical origin comes from the validated `PUBLIC_BASE_URL` configuration. The route checks that exact Origin, the existing session CSRF token, a ten-per-minute database-backed caller limit, its bounded JSON body, and the exact prefix-only schema. It has no caller-selected upstream URL. Provider calls use certificate verification, bounded reads, timeouts, no redirects, a two-call concurrency bound, process request budget and short circuit breaker. The process cache is bounded to 2,048 prefixes and 4,096 stored full-hash records.

Without a configured key, the context flag `reputation_enabled` is false and the optional widget/script is not displayed. The route returns unavailable instead of inventing a provider result. A configured key makes the feature available to attempt; it does not establish that the key, API activation, quota or provider service is healthy. Configuration was **not live-verified** in this delivery because no Google key was supplied.

The frontend loads the same-origin `static/js/reputation.js` only when enabled. It uses `#reputation-check`, `#reputation-result`, the existing `#checker-input` and `meta[name=csrf-token]`. The app CSP must allow `connect-src 'self'` for this explicit same-origin operation. Local message analysis remains separate and on-device.

## Evidence and limitations

A current full-hash match is displayed as **Reported unsafe by Google Safe Browsing**, with the reported threat type and Google's attribution/reliability notice. Unknown threat types or attributes cause the complete detail to be ignored, as Google's forward-compatibility rules require. `CANARY` findings are not used for enforcement; `FRAME_ONLY` findings do not become top-level warnings.

An empty match is displayed as **No current threat-list warning was returned for this address**, followed by an explicit warning that this is not proof of safety. It never overrides a local lookalike-domain, HTTP or credential-request warning. Unavailable, unsupported and expired checks remain unverified. Google attribution is restricted to this separate provider-evidence widget; independent local warnings are not presented as Google's findings.

The server caches positive and negative prefix results using the response-specific duration, with a conservative 30-minute cap on retained observations. It does not treat one response's duration as a permanent global value. Provider warnings expire within 30 minutes of the underlying provider observation, and editing/clearing/replacing the input invalidates the visible result.

The canonicalization implementation follows the supported cases in Google's documented algorithm, including repeated percent-unescaping, IPv4 normalization, punycode, path normalization, query preservation, host suffixes, path prefixes and SHA-256. It deliberately rejects ambiguous/malformed authorities, IPv6 lookup inputs, decoded query delimiters inside paths and backslash forms. It does not submit a partial expression set for these inputs. Their local warning review still works; the optional provider result says unverified. This restriction is preferable to claiming an address was checked using an incompatible representation.

A visitor must paste one HTTP/HTTPS address for this optional lookup. A whole SMS/email is not sent or treated as externally authenticated. For a message with multiple shortened links, use the local message explanations and independently open the claimed organization's official channel; a reputation lookup cannot verify the sender or the eventual content of an arbitrary redirect chain.

## Provider terms and verified references

Official references were read on 13 November 2026:

- V5 request/response, four-byte prefixes, response caching, forward compatibility and threat attributes: https://developers.google.com/safe-browsing/reference/rest/v5/hashes/search
- Threat enums and the fact that SearchHashes does not provide a likely-safe verdict: https://developers.google.com/safe-browsing/reference/rest/v5/hashList
- Documented URL/hash-expression algorithm and unit examples: https://developers.google.com/safe-browsing/v4/urls-hashing
- API-key setup: https://developers.google.com/safe-browsing/v4/get-started
- Terms: https://developers.google.com/safe-browsing/terms

The terms read were last modified 20 November 2025. Unless a separate agreement applies, Google restricts Safe Browsing API use to noncommercial purposes. The owner must review current terms and eligibility before activating this optional service. The terms also require attribution/reliability notices and current provider information for unsafe-site warnings. No terms were accepted, account opened, key created or live provider request made by this work.

## Verification

The Python regression suite covers prefix-only input, fixed provider routing, no redirect/key exception leakage, exact full hashes, unknown/non-enforceable detail filtering, malformed responses, positive/negative caching, eviction, failure circuits, same-origin/CSRF enforcement and disabled behavior. Node tests cover official canonical examples for supported inputs, unsupported-input rejection, expression limits, Unicode/punycode handling, SHA-256/prefix agreement with Node, complete full-hash matching and all three dynamic-copy dictionaries.

These tests use explicit test transports and documented schema fixtures; they are not evidence of a live Google API connection or universal URL classification.
