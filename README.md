# CYBER SURAKSHA 2.0 — public awareness website

Official project website of Jatoth Ramakrishna's independent cybersecurity-awareness platform.

This branch contains only the static website under `docs/`. No backend code, credentials, databases or user records are included. All local Scam Checker, Action Planner and training interactions run in the visitor's browser. The directory contains twenty official cyber-agency references in English, Hindi and Telugu.

## GitHub Pages configuration

After this branch is pushed, open the repository's **Settings → Pages**, choose **Deploy from a branch**, select **gh-pages** and **/docs**, and save. The intended public address is https://rk-hud.github.io/cyber-suraksha-2.0/. The address becomes live only after GitHub confirms successful publication.

All local assets, language routes and form targets use the project base path `/cyber-suraksha-2.0/`. `docs/.nojekyll` prevents Jekyll processing. The language pages are `/en/`, `/hi/` and `/te/` below that project path.

The HTML declares a restrictive content-security policy. GitHub Pages controls HTTP response headers; this branch does not claim to configure headers that the platform does not support.

## Citizen services boundary

The static website does not execute Flask account routes or collect citizen complaints. Its availability notice remains explicit while public registration is closed and production email verification is unconfigured. The separate account service must be enabled and verified before public registration can be advertised as active. A support case is not a police complaint; for financial fraud in India contact the bank, call 1930 and use https://cybercrime.gov.in/.

Copyright (c) 2026 Jatoth Ramakrishna. Independently architected, developed, authored and owned for public cybersecurity awareness. No institutional sponsor, external funder or government affiliation.
