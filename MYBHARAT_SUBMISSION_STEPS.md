# MY Bharat urgent submission — CYBER SURAKSHA 2.0

**Project:** CYBER SURAKSHA 2.0 — From Cyber Fraud Awareness to Intelligent Cybercrime Prevention & Response  
**Team:** SENTRIX SYSTEMS  
**Registration:** HSC|TS|00087  
**Theme:** Digital Safety & Cyber Fraud Awareness  
**Project lead:** Jatoth Ramakrishna  
**Repository:** https://github.com/rk-Hud/cyber-suraksha-2.0

## Submission order

1. Finish the existing Git merge safely (`git status` should say no conflicts).
2. Extract the ZIP to a different folder. Complete the existing merge, then run the included `INSTALL_RELEASE_WINDOWS.ps1` with the path to your existing Git project. It creates a backup Git branch and copies only release files. **Never copy a database or secret into Git**.
3. Run `python scripts/check_release.py`; from the existing virtual environment run `python -m unittest discover -s tests -v`. If tests fail, do not claim all passed; resolve first.
4. Stage only the intended source and documentation (`git add app.py requirements.txt README.md CONTRIBUTING.md SECURITY.md LICENSE OWNERSHIP_AND_CREDITS.md DEPLOYMENT.md render.yaml .env.example .gitignore static templates tests docs sample_data scripts .github RELEASE_CHECKLIST.md MYBHARAT_SUBMISSION_STEPS.md MANUAL_TEST_CHECKLIST.md PROJECT_DOCUMENTATION.md SAFE_SAMPLE_DATA.md run_windows.bat`). Inspect `git diff --cached --name-only` for private files.
5. Commit and run `git push -u origin main`. Open the repository using your account to verify the commit and files. **For HSC the source repository must be PUBLIC**, after checking for secrets, private IDs and personal data. Do not expose private reports.
6. Upload the attached 7-slide PPTX/PDF after checking the event's required format/template. **Verify the provisional AI-assistance percentage on slide 7 and change it if inaccurate.** Add a demo video (3–5 min if the event requires it). Video narration outline is provided separately.
7. Open the **official MY Bharat event page** in your own logged-in account and submit the requested fields and supporting files. The exact form and deadline must be verified on the live portal. Do not claim the submission was completed until it displays confirmation.
8. If an official Annexure 1 declaration, student ID and government ID are required, prepare them in the portal's prescribed format; upload sensitive documents **only** to the official portal, never to GitHub.

## Honest prototype statement

"CYBER SURAKSHA 2.0 is a student-built Flask prototype for cyber-fraud awareness, fictional incident-reporting workflows, SOC investigation practice and Zero Trust decision simulation. A public demo is read-only. It has no live police, banking or government integration and does not automatically prevent fraud."

## Important

The presentation here is an independent 7-slide draft and **not guaranteed to be the official HSC slide template**. Copy the content into the official template if required. A URL that is not live should not be reported as a deployed site.
