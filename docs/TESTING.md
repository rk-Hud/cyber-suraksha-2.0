# Testing and Quality Assurance

## Automated tests

Run from the repository root after installing dependencies:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

The current test file contains checks for:

- Stage 1/2 page availability and incident submission/detail retrieval.
- Preservation of an existing incident across additive schema initialization.
- SOC dashboard filtering, investigation note persistence and rejection of an invalid workflow status.
- Zero Trust simulation output.
- Local disclosure report persistence.
- English/Hindi/Telugu awareness page rendering and quiz scoring.
- `/health` response.

## Test evidence policy

A test result is valid only for the exact source version and environment in which it was run. Record the date, Python version, Flask version, command and complete pass/fail summary when preparing a release. Do not state that tests passed based solely on an earlier run or on the existence of test files.

## Manual acceptance checklist

- [ ] Launch with `run_windows.bat` and load the dashboard.
- [ ] Submit a fictional incident and open its generated reference page.
- [ ] Review the incident register.
- [ ] Complete each fraud-simulator scenario.
- [ ] Filter SOC alerts and save an investigation note.
- [ ] Try each Zero Trust simulation scenario.
- [ ] Submit a disclosure report for a fictional training asset only.
- [ ] Visit awareness pages in English, Hindi and Telugu and complete the quiz.
- [ ] Confirm the UI does not claim to contact authorities or enforce real-world controls.
- [ ] Confirm the local database is excluded from Git.

## Current verification note

The source package includes an automated test suite. Test execution must be repeated in the developer's Python environment after installing `requirements.txt`; this documentation intentionally does not claim a passing result without a successful run.
