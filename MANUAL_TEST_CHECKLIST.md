# Manual acceptance checklist — Stages 1 to 8

- [ ] Start app using `run_windows.bat`; dashboard loads.
- [ ] Open `/report`, submit a clearly fictional sample report, and receive a reference.
- [ ] Open `/incidents` and the new incident detail page.
- [ ] Open `/fraud-simulator`; test both fictional scenarios and submit answers.
- [ ] Open `/soc-simulator`; filter by severity and status.
- [ ] Open a SOC alert; save analyst notes and change workflow status.
- [ ] Open `/zero-trust`; run each simulated access scenario and review the decision.
- [ ] Open `/disclosure`; submit a report about a fictional training asset only.
- [ ] Open `/awareness?lang=en` and `/awareness?lang=te`; complete the quiz.
- [ ] Run automated tests using the command in `PROJECT_DOCUMENTATION.md`.
- [ ] Confirm the UI labels every simulated action honestly and makes no claim of real-world integrations.
- [ ] Back up the local SQLite database before making changes.
