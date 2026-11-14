"""CYBER SURAKSHA 2.0 — independent cyber safety services.

Provides live self-service guidance and public resources; SOC lab data are synthetic.
This independent service does not collect police reports or sensitive personal data.
"""
from __future__ import annotations

import ipaddress
import os
import re
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ConfigDict
from fastapi.exceptions import RequestValidationError

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "site"
DB_FILE = Path(os.environ.get("CS20_DB_PATH", str(ROOT / "data" / "training.sqlite3")))

CASES = (
    ("CS-DEMO-001", "Phishing message", "ఫిషింగ్ సందేశం", "Awareness review",
     "A fictional account warning asks the recipient to open an unfamiliar link.",
     "ఒక ఊహాత్మక ఖాతా హెచ్చరిక తెలియని లింక్ తెరవమంటుంది.", "Medium"),
    ("CS-DEMO-002", "UPI payment-request scam", "UPI చెల్లింపు మోసం", "Investigation practice",
     "A fictional refund offer asks for a UPI PIN to receive money.",
     "ఒక ఊహాత్మక రీఫండ్ సందేశం డబ్బు అందుకోవడానికి UPI PIN అడుగుతుంది.", "High"),
    ("CS-DEMO-003", "Account takeover signal", "ఖాతా దుర్వినియోగ సూచన", "Containment practice",
     "A training account shows repeated failed logins followed by one unfamiliar successful login.",
     "ఒక శిక్షణ ఖాతాలో పలుమార్లు విఫలమైన లాగిన్‌ల తర్వాత తెలియని లాగిన్ విజయవంతమైంది.", "High"),
)
ALERTS = (
    ("SOC-DEMO-001", "Multiple failed logins before success", "High", "Authentication", "Investigate"),
    ("SOC-DEMO-002", "Unexpected PowerShell process", "Medium", "Endpoint", "Investigate"),
    ("SOC-DEMO-003", "Repeated blocked requests", "Low", "Network", "Review"),
)


def initialize_database() -> None:
    """Initialize immutable educational fixtures. No visitor data is written."""
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_FILE, timeout=10) as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS training_cases (
          id TEXT PRIMARY KEY, title_en TEXT NOT NULL, title_te TEXT NOT NULL,
          training_status TEXT NOT NULL, summary_en TEXT NOT NULL,
          summary_te TEXT NOT NULL, severity TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS training_alerts (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, severity TEXT NOT NULL,
          category TEXT NOT NULL, recommended_action TEXT NOT NULL
        );
        """)
        conn.executemany("INSERT OR IGNORE INTO training_cases VALUES (?,?,?,?,?,?,?)", CASES)
        conn.executemany("INSERT OR IGNORE INTO training_alerts VALUES (?,?,?,?,?)", ALERTS)
        conn.commit()


def get_rows(query: str, args: tuple = ()) -> list[dict]:
    # Query statements are fixed strings authored in this file, never user-supplied.
    connection = sqlite3.connect(DB_FILE.resolve().as_uri() + "?mode=ro", uri=True)
    try:
        connection.row_factory = sqlite3.Row
        return [dict(row) for row in connection.execute(query, args).fetchall()]
    finally:
        connection.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(
    title="CYBER SURAKSHA 2.0 — Independent Cyber Safety",
    version="2.1.1",
    docs_url=None, redoc_url=None, openapi_url=None,
    lifespan=lifespan,
)


# Anonymous API endpoints accept only small, structured JSON requests.
# This helps prevent accidental submission of passwords, complaint narratives, and evidence.
@app.middleware("http")
async def bounded_json_requests(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.method in ("POST", "PUT", "PATCH"):
        if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
            return JSONResponse(status_code=415, content={"detail": "JSON content type required"})
        # Read at most 4097 bytes even if content-length is omitted or dishonest.
        data = bytearray()
        async for chunk in request.stream():
            if len(data) + len(chunk) > 4096:
                return JSONResponse(status_code=413, content={"detail": "Request is too large"})
            data.extend(chunk)
        # In current Starlette, request.body() caching via _body is honored by call_next.
        request._body = bytes(data)
    return await call_next(request)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data:; script-src 'self'; "
        "style-src 'self'; connect-src 'self'; font-src 'self'; "
        "base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'"
    )
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    # HSTS is appropriate only for an externally confirmed HTTPS deployment.
    if os.environ.get("CS20_HTTPS_HSTS") == "1":
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
    return response


@app.exception_handler(RequestValidationError)
async def sanitized_validation_error(request: Request, exc: RequestValidationError):
    # Error descriptions can include invalid user input. Avoid echoing secrets.
    return JSONResponse(status_code=422, content={"detail": "Invalid request fields or format"})


@app.get("/api/v1/health")
def health():
    # A truthful status response: public assistance tools are live; police intake is not.
    db_ready = get_rows("SELECT COUNT(*) AS count FROM training_cases")[0]["count"] >= 3
    if not db_ready:
        raise HTTPException(status_code=503, detail="Reference database unavailable")
    return {
        "status": "ok", "project": "CYBER SURAKSHA 2.0", "mode": "independent-public-service",
        "services": ["url-signals", "incident-guidance", "official-resources", "awareness", "training"],
        "real_complaint_intake": False, "government_approved": False,
        "public_safety_tools": "active", "training_data": "synthetic",
        "database": "ready", "version": "2.1.1",
    }


@app.get("/api/v1/summary")
def summary():
    return {
        "cases": get_rows("SELECT COUNT(*) AS count FROM training_cases")[0]["count"],
        "alerts": get_rows("SELECT COUNT(*) AS count FROM training_alerts")[0]["count"],
        "real_cases": 0, "privacy": "No visitor input stored in the training database",
    }


@app.get("/api/v1/cases")
def list_cases(lang: Literal["en", "te"] = "en"):
    rows = get_rows("SELECT * FROM training_cases ORDER BY id")
    return {"items": [present_case(row, lang) for row in rows], "fictional": True}


def present_case(row: dict, lang: str):
    return {"id": row["id"], "title": row[f"title_{lang}"],
            "summary": row[f"summary_{lang}"],
            "training_status": row["training_status"], "severity": row["severity"],
            "fictional": True}


@app.get("/api/v1/cases/{case_id}")
def case_detail(case_id: str, lang: Literal["en", "te"] = "en"):
    if not re.fullmatch(r"CS-DEMO-00[1-3]", case_id):
        raise HTTPException(status_code=404, detail="Training case not found")
    rows = get_rows("SELECT * FROM training_cases WHERE id=?", (case_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Training case not found")
    return present_case(rows[0], lang)


@app.get("/api/v1/alerts")
def list_alerts():
    return {"items": get_rows("SELECT * FROM training_alerts ORDER BY id"), "fictional": True}


class TriageRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    alert_id: Literal["SOC-DEMO-001", "SOC-DEMO-002", "SOC-DEMO-003"]
    action: Literal["investigate", "ignore", "delete"]


@app.post("/api/v1/training/triage")
def evaluate_triage(payload: TriageRequest):
    ok = payload.action == "investigate"
    return {"correct": ok, "alert_id": payload.alert_id,
            "feedback": ("Verify the alert, preserve logs and escalate under procedure."
                         if ok else
                         "Do not ignore evidence or delete data before verification."),
            "persisted": False, "fictional": True}


class UrlCheckRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    url: str = Field(min_length=4, max_length=500)


@app.post("/api/v1/training/url-signals")
def url_signals(payload: UrlCheckRequest):
    """Never makes external requests. This is a *pattern* checker, not URL reputation."""
    try:
        parsed = urlsplit(payload.url.strip())
        hostname = parsed.hostname or ""
        if parsed.scheme not in ("http", "https") or not hostname:
            raise ValueError("Invalid URL")
        if any(c.isspace() for c in hostname):
            raise ValueError("Invalid URL")
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="A valid http(s) URL is required")
    signals = []
    if parsed.scheme == "http":
        signals.append("No HTTPS encryption")
    if parsed.username or parsed.password:
        signals.append("URL contains a user-info @ component")
    if "xn--" in hostname:
        signals.append("Internationalized punycode domain: verify spelling")
    try:
        ipaddress.ip_address(hostname)
        signals.append("IP address used instead of domain name")
    except ValueError:
        pass
    if hostname.lower() in {"bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "rb.gy"}:
        signals.append("Shortened link: destination is unknown")
    if re.search(r"verify|unlock|urgent|claim|reward|reset-password", payload.url, re.I):
        signals.append("Urgency / verification terms in URL")
    if len(payload.url) > 140:
        signals.append("Unusually long URL")
    return {"signals": signals, "verdict": "No conclusive verdict; educational indicators only",
            "url_not_opened": True, "persisted": False}


@app.get("/api/v1/official-resources")
def resources():
    return {"items": [
        {"name": "National Cyber Crime Reporting Portal", "url": "https://cybercrime.gov.in/"},
        {"name": "Financial cyber fraud helpline", "phone": "1930"}],
        "not_affiliated_with_government": True}


@app.exception_handler(HTTPException)
async def error_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})



# Anonymous, stateless guidance — accepts category labels, never names or case evidence.
class GuidanceRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    incident_type: Literal["payment_fraud", "phishing", "account_access", "device_security"]
    financial_loss: bool = False
    language: Literal["en", "te"] = "en"


_GUIDES = {
    "payment_fraud": {
      "en": ["Immediately call your bank or payment provider using the number from its official app or card.",
             "Ask the bank to secure the affected payment instrument and review unauthorized transfers.",
             "Preserve transaction reference numbers, screenshots and timestamps on your own device.",
             "For financial cyber fraud in India, call 1930 promptly and use cybercrime.gov.in to file an official report."],
      "te": ["మీ బ్యాంక్ లేదా చెల్లింపు సంస్థను వారి అధికారిక యాప్ లేదా కార్డులోని నంబర్ ద్వారా వెంటనే సంప్రదించండి.",
             "అనధికార లావాదేవీలను పరిశీలించమని, ప్రభావిత ఖాతా భద్రతను పెంచమని బ్యాంకును అడగండి.",
             "లావాదేవీ సూచికలు, స్క్రీన్‌షాట్‌లు, సమయాలను మీ పరికరంలో భద్రపరచుకోండి.",
             "భారతదేశంలో ఆర్థిక సైబర్ మోసం జరిగితే వెంటనే 1930కి కాల్ చేసి cybercrime.gov.inలో ఫిర్యాదు చేయండి."],
    },
    "phishing": {
      "en": ["Do not open the suspicious link again or enter passwords, PINs or OTPs.",
             "Visit the genuine provider's website or app independently and secure your account if you entered credentials.",
             "Keep the message and relevant screenshots as evidence on your own device.",
             "Report an actual cybercrime through cybercrime.gov.in; do not submit evidence to this website."],
      "te": ["అనుమానాస్పద లింకును మళ్లీ తెరవకండి; పాస్‌వర్డ్‌లు, PINలు లేదా OTPలు ఇవ్వకండి.",
             "అసలు సంస్థ యొక్క యాప్ లేదా వెబ్‌సైట్‌ను స్వయంగా తెరిచి అవసరమైతే ఖాతాను రక్షించండి.",
             "సందేశం మరియు సంబంధిత స్క్రీన్‌షాట్‌లను మీ పరికరంలో భద్రపరచుకోండి.",
             "నిజమైన సైబర్ నేరానికి cybercrime.gov.in ద్వారా ఫిర్యాదు చేయండి."],
    },
    "account_access": {
      "en": ["From a trusted device, change the affected account password using the official service.",
             "Sign out unfamiliar sessions and enable multi-factor authentication if available.",
             "Check recovery contacts, transaction history and recent login activity for unauthorized changes.",
             "Contact the provider's official support and preserve alerts or timestamps for a formal report."],
      "te": ["నమ్మదగిన పరికరం నుంచి అధికారిక సేవ ద్వారా ఖాతా పాస్‌వర్డ్ మార్చండి.",
             "తెలియని సెషన్లను ముగించి అందుబాటులో ఉంటే బహుళ-దశల ధృవీకరణను ప్రారంభించండి.",
             "రికవరీ వివరాలు, లావాదేవీలు, లాగిన్ చరిత్రలో అనధికార మార్పులను పరిశీలించండి.",
             "అధికారిక సపోర్టును సంప్రదించి హెచ్చరికలు, సమయాలను భద్రపరచుకోండి."],
    },
    "device_security": {
      "en": ["If you suspect active malware or ransomware, disconnect the affected device from networks where practical.",
             "Do not pay unknown parties or run unsolicited 'cleanup' tools.",
             "Use trusted professional support and preserve relevant details before reinstalling or wiping a device.",
             "Report suspected cybercrime through the official national portal when appropriate."],
      "te": ["మాల్వేర్ లేదా ర్యాన్సమ్‌వేర్ అనుమానం ఉంటే సాధ్యమైనప్పుడు పరికరాన్ని నెట్‌వర్క్ నుంచి విడదీయండి.",
             "తెలియని వ్యక్తులకు డబ్బు చెల్లించకండి; తెలియని క్లీనప్ సాధనాలు వాడకండి.",
             "నమ్మదగిన నిపుణుల సహాయం తీసుకుని పరికరాన్ని తొలగించే ముందు ఆధారాలు భద్రపరచండి.",
             "అవసరమైతే అధికారిక జాతీయ పోర్టల్ ద్వారా సైబర్ నేరాన్ని నివేదించండి."],
    },
}


@app.post("/api/v1/guidance")
def incident_guidance(payload: GuidanceRequest):
    """Real, immediate self-service guidance; no case intake or persistence."""
    language = payload.language
    steps = list(_GUIDES[payload.incident_type][language])
    if payload.financial_loss and payload.incident_type != "payment_fraud":
        steps.insert(0, "Call your bank and India's 1930 cyber fraud helpline promptly." if language == "en"
                     else "మీ బ్యాంకును మరియు భారతదేశపు సైబర్ మోసాల హెల్ప్‌లైన్ 1930ని వెంటనే సంప్రదించండి.")
    return {
        "steps": steps,
        "resources": {"cybercrime_portal": "https://cybercrime.gov.in/", "financial_fraud_helpline": "1930"},
        "independent_guidance": True,
        "official_complaint_submitted": False,
        "saved_on_server": False,
    }


@app.get("/api/v1/service-catalog")
def service_catalog():
    return {"operator_type": "independent", "complaint_intake": False,
            "public_services": [
              {"name": "Cyber awareness", "available": True},
              {"name": "Link signal checker", "available": True, "scope": "heuristics-no-reputation-verdict"},
              {"name": "Incident response planner", "available": True, "scope": "anonymous-guidance"},
              {"name": "Official reporting directory", "available": True},
              {"name": "SOC learning lab", "available": True, "data": "synthetic"},
              {"name": "Digital safety quiz", "available": True}
            ]}

app.mount("/", StaticFiles(directory=SITE, html=True), name="public")
