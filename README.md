# CYBER SURAKSHA 2.0

## From Cyber Fraud Awareness to Intelligent Cybercrime Prevention & Response

An independently developed cybersecurity awareness and training platform.

### Current public websites

- Unified website: https://cyber-suraksha-2-0-unified-public.onrender.com/
- Independent R4 preview: https://cyber-suraksha-2-0-independent-preview.onrender.com/
- Local preview: http://127.0.0.1:8094/ (when running locally)

### Public features

- English, Hindi and Telugu awareness
- Scam Checker and safety guidance
- Action Planner
- Training and Quiz
- Official international cyber-safety resources
- Privacy information and access permissions

### Current R4 source

The active awareness application is in:

`deploy/cyber-suraksha-independent/`

- `main.py` — FastAPI application
- `site/` — public website
- `site/v2-assets/` — CSS, JavaScript and logo
- `site/legacy/` — previous website

The root Flask application and older evaluation components are retained as separate legacy implementations.

### Security and service limitations

This is an independent educational platform. Citizen accounts, real complaint intake, email OTP and administrator operations are not active on the R4 public website.

The platform is not affiliated with any government or law-enforcement agency and cannot submit official complaints.

For financial cyber fraud in India, call 1930 and use https://cybercrime.gov.in/.

See SECURITY.md, LICENSE and component documentation for security and licensing information.
