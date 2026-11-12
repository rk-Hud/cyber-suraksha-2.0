# Security scope and responsible reporting

CYBER SURAKSHA 2.0 is a training and digital-literacy prototype. Do **not** submit passwords, OTPs, bank statements, identity documents or real cybercrime reports here. For actual complaints, use the official cybercrime reporting portal (`https://cybercrime.gov.in/`) or financial cyber fraud helpline 1930 in India.

Static pages and `/api/v1/*` expose only educational content. The SQLite database contains only fictional seed data. Training endpoints evaluate inputs without storing visitor values. The URL checker parses strings but does not open user-submitted addresses. No real incident reporting feature exists.

The deployed web-service operator must review hosting provider logs, availability, TLS, content-security policy, accessibility and independent penetration testing before presenting any claim of production security. Stage 16 enterprise PKI and key-custody controls are outside this website and have not been signed off. Never copy `ca-encrypted.key`, server private keys, Windows trust stores, enterprise backups or privileged credentials to a public repository.
