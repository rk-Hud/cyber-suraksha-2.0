> **HISTORICAL RELEASE SECURITY RECORD.** These checks describe an earlier source version and do not constitute a current live assessment. [Current release readiness](../../docs/RELEASE_READINESS.md) · [Testing](../../docs/TESTING.md).

# Security limits and production controls still outstanding

The independent FastAPI public-awareness website is not an authorized police complaint portal or a government-sponsored service. User-facing exercises are synthetic. This package does not collect real police complaints.

**Improvements in R2:** Strict Pydantic body models reject unexpected fields; validation errors do not echo submitted values; API POST request bodies are limited to 4096 bytes; unknown API routes keep no-store headers; cross-origin isolation response headers are added. These controls reduce risk but do not eliminate bugs, network abuse or implementation vulnerabilities.

**Not independently proven:** external penetration test, accessibility (WCAG) compliance, rate limiting at the production reverse proxy, dependency/CVE scan from a fresh public index, DDoS resistance, production incidents/backups, verified DNS/HTTPS and public web browser acceptance. API server log configuration and privacy/security policies must be reviewed on any eventual real host.

**Original enterprise gateway remains separate:** Local port `8444`, Nginx client CA and upstream mTLS, operational CRL distribution, independent backup restore and production rollback are not changed or signed off by R2.
