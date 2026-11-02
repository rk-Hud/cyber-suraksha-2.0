"""One server, one site: public modules and private localhost admin together."""
from getpass import getpass
from pathlib import Path
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from werkzeug.security import generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Avoid launching a second Flask process, a common source of 404/connection errors.
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.settimeout(1)
    if sock.connect_ex(("127.0.0.1", 5000)) == 0:
        raise SystemExit("STOP: Port 5000 is already in use. Close the old Flask server with Ctrl+C, then retry.")

print("\nCYBER SURAKSHA 2.0 — ONE WEBSITE, ONE COMMAND")
print("Public learning modules + localhost-only training administration")
print("Use fictional data only. Do not enter real citizen information.")
print("Public Render deployment remains a separate, read-only hosting environment.\n")
password = getpass("Create local admin password (12+ characters): ")
if len(password) < 12:
    raise SystemExit("Password too short. Restart the launcher and choose a longer password.")
confirm = getpass("Confirm local admin password: ")
if password != confirm:
    raise SystemExit("Passwords do not match. Restart the launcher.")
os.environ["PUBLIC_DEMO_MODE"] = "0"
os.environ["COOKIE_SECURE"] = "0"  # HTTPS is not used on http://127.0.0.1
os.environ["CYBER_SURAKSHA_STAGE3_ENABLED"] = "1"
os.environ["CYBER_SURAKSHA_STAGE3_ADMIN_HASH"] = generate_password_hash(password)
del password, confirm

if input("Optional read-only viewer account? (y/N): ").strip().lower() == "y":
    vp = getpass("Create viewer password (12+ characters): ")
    if len(vp) < 12:
        raise SystemExit("Viewer password too short. Restart launcher.")
    os.environ["CYBER_SURAKSHA_STAGE3_VIEWER_HASH"] = generate_password_hash(vp)
    del vp
else:
    os.environ.pop("CYBER_SURAKSHA_STAGE3_VIEWER_HASH", None)

from app import app  # import after all environment settings are applied

def open_site_when_ready():
    for _ in range(50):
        try:
            with urllib.request.urlopen("http://127.0.0.1:5000/health", timeout=0.4) as res:
                if res.status == 200:
                    webbrowser.open("http://127.0.0.1:5000/")
                    return
        except Exception:
            time.sleep(0.2)

threading.Thread(target=open_site_when_ready, daemon=True).start()
print("\nWebsite: http://127.0.0.1:5000/")
print("Training admin: http://127.0.0.1:5000/training-admin/login")
print("Leave this window open. Press Ctrl+C to stop. No passwords are saved to files.\n")
app.run(host="127.0.0.1", port=5000, debug=False, use_reloader=False)
