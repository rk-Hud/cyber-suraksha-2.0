# Urgent CYBER SURAKSHA 2.0 upload instructions (Windows)

## A. Finish your current Git merge

In PowerShell at your *existing* repository folder:

```powershell
cd "C:\Users\ramak\Downloads\CyberSuraksha2_Complete\CYBER_SURAKSHA_2_0_COMPLETE"
git status
# If status says "All conflicts fixed but you are still merging":
git commit -m "Merge existing GitHub files"
```

Do not run `git init` again or delete your `.git` folder. Your existing database must stay local.

## B. Install this prepared release safely

Extract the supplied ZIP to Downloads. Navigate in PowerShell to the folder containing `INSTALL_RELEASE_WINDOWS.ps1`, or run it by full path. This example assumes you extracted into `Downloads\CYBER_SURAKSHA_2_0_SUBMISSION_READY`:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& "$env:USERPROFILE\Downloads\CYBER_SURAKSHA_2_0_SUBMISSION_READY\CYBER_SURAKSHA_2_0_COMPLETE\INSTALL_RELEASE_WINDOWS.ps1"
```

If your extracted folder is different, navigate in File Explorer, copy the script's full path, and substitute it in the command. The installer makes a backup Git branch before copying and does NOT overwrite the database or `.git` history.

## C. Test in your original Git project

```powershell
cd "C:\Users\ramak\Downloads\CyberSuraksha2_Complete\CYBER_SURAKSHA_2_0_COMPLETE"
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts/check_release.py
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

All tests must pass. If they fail, stop and inspect before publishing.

## D. Publish exact source and documentation

```powershell
git add app.py requirements.txt README.md CONTRIBUTING.md SECURITY.md LICENSE OWNERSHIP_AND_CREDITS.md DEPLOYMENT.md render.yaml .env.example .gitignore static templates tests docs sample_data scripts .github RELEASE_CHECKLIST.md MYBHARAT_SUBMISSION_STEPS.md MANUAL_TEST_CHECKLIST.md PROJECT_DOCUMENTATION.md SAFE_SAMPLE_DATA.md run_windows.bat URGENT_UPLOAD_README.md INSTALL_RELEASE_WINDOWS.ps1 VIDEO_DEMO_SCRIPT.md
git diff --cached --name-only
git diff --cached --check
git commit -m "Release CYBER SURAKSHA 2.0 submission and public demo"
git push -u origin main
```

Review staged file names **before** committing. Never add `.venv`, SQLite DB files, `.env`, local backups, IDs, or sensitive records. Do not use `git push --force`.

After verifying the files in GitHub, switch the repo **Public** for the required public source link. Do this only when you have checked there are no secrets or real user records in repository history.

## E. Public read-only web app

Use https://dashboard.render.com/ under your own account. Connect GitHub, choose **New → Blueprint**, select the repository, review the `render.yaml`, and deploy on the Free plan if available. Require `PUBLIC_DEMO_MODE=1`, `COOKIE_SECURE=1` and a secret environment variable that is not in Git. Only provide a website URL once it actually responds over HTTPS. The public demo blocks real incident/vulnerability report intake and SOC note changes.

A mobile user can add the hosted website to the Home Screen using a supporting browser. This is a web app, not an APK.

## F. MY Bharat submission

Open https://mybharat.gov.in/pages/hack-for-social-cause while signed in. Check whether submission/editing remains available; the public page has contradictory published dates, and November 2 is after its Oct 31 timeline. Use the prepared 7-slide deck only after checking the official IIT Bombay template and the AI assistance disclosure. Upload Annexure 1 and student/official ID details **only** on the official portal, not GitHub. Video is preferred (3-5 minutes) but listed as nonmandatory in the official FAQ. Confirm a portal receipt before treating the submission as complete.
