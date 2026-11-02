"""Launch local training mode. Password is hidden and not saved in files."""
from getpass import getpass
from pathlib import Path
import os
import sys
from werkzeug.security import generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

print("CYBER SURAKSHA 2.0 — LOCAL fictional case management")
print("Uses training data only. Do NOT enter real victim information.")
print("Public Render site remains unchanged. Never expose port 5000 on the internet.\n")
password = getpass("Choose a local admin password (at least 12 characters): ")
if len(password) < 12:
    raise SystemExit("Password must have at least 12 characters. Please restart.")
confirmation = getpass("Confirm local admin password: ")
if password != confirmation:
    raise SystemExit("Passwords did not match. Please restart.")

os.environ["PUBLIC_DEMO_MODE"] = "0"
os.environ["CYBER_SURAKSHA_STAGE3_ENABLED"] = "1"
os.environ["CYBER_SURAKSHA_STAGE3_ADMIN_HASH"] = generate_password_hash(password)
del password, confirmation
viewer = input("Enable optional read-only viewer login? (y/N): ").strip().lower()
if viewer == "y":
    vp = getpass("Choose viewer password (at least 12 characters): ")
    if len(vp) < 12:
        raise SystemExit("Viewer password must have at least 12 characters.")
    os.environ["CYBER_SURAKSHA_STAGE3_VIEWER_HASH"] = generate_password_hash(vp)
    del vp
from app import app
print("\nOpen http://127.0.0.1:5000/training-admin/login")
print("Press Ctrl+C to stop the server. Password hashes exist in memory only.")
app.run(host="127.0.0.1", port=5000, debug=False, use_reloader=False)
