# Technical Design Document

## 1. Purpose

CYBER SURAKSHA 2.0 demonstrates a collection of cyber-safety and defensive-security learning workflows in one local web application. It is intended for student learning, hackathon demonstration and awareness—not for handling real cybercrime complaints.

## 2. Design goals

- Provide a simple browser-based interface that can run locally on a student Windows laptop.
- Demonstrate basic server-side form processing and local persistence.
- Separate the learning workflows into understandable modules.
- Use fictional data for scenarios and SOC triage practice.
- Keep the setup free of paid APIs and cloud dependencies.

## 3. Technology decisions

| Technology | Role | Reason in this prototype |
|---|---|---|
| Python | Application language | Beginner-friendly and widely used for automation/security learning |
| Flask 3.1.1 | Web framework | Lightweight routing and template rendering |
| SQLite | Local persistence | File-based database; no separate database server |
| Jinja | HTML templating | Server-rendered pages |
| CSS | User interface styling | Static stylesheet served by Flask |
| `unittest` | Automated tests | Built into Python; supports repeatable route/database tests |

## 4. Functional modules

1. **Incident intake and register:** accepts a fictional incident description, creates a reference and stores the record locally.
2. **Fraud simulator:** presents fictional payment-fraud situations and supports response decision practice.
3. **SOC simulator:** displays synthetic security alerts and supports severity filtering, investigation notes and workflow status changes.
4. **Zero Trust simulator:** demonstrates contextual access decisions for predefined scenarios; it does not control a real identity provider or device.
5. **Disclosure intake:** records a local report concerning a fictional training asset.
6. **Awareness centre:** provides English, Hindi and Telugu awareness learning content and a quiz.

## 5. Non-functional considerations

- **Portability:** Python and a local SQLite file keep the prototype lightweight.
- **Privacy:** the database is local and excluded from version control by default.
- **Maintainability:** route logic, templates, styles and tests are stored in separate paths.
- **Testability:** Flask's test client and temporary test databases exercise key workflows.
- **Security posture:** suitable only for local demonstration; not reviewed or hardened for public deployment.

## 6. Error handling and data integrity

The application uses SQLite parameterized statements in its data operations and creates its tables if they do not already exist. The test suite includes an additive-migration preservation check. This is not a substitute for production database migration tooling, input-fuzzing or a full security assessment.

## 7. Out of scope

Live cybercrime submission, police/CERT-In/bank integration, payment blocking, live threat-intelligence lookups, production SIEM/EDR integrations, endpoint isolation, real Zero Trust enforcement, user accounts, role-based access, multi-tenant hosting and automated vulnerability verification.

## 8. Future improvements

- Add authentication, role-based access and CSRF protection before any multi-user deployment.
- Move configuration and secret management to environment-specific settings.
- Add structured audit logging, retention/deletion policies and safer evidence handling.
- Add accessibility and responsive UI testing.
- Expand automated tests for validation boundaries and error cases.
- Add a reviewed, anonymized demonstration dataset and documented reset procedure.
