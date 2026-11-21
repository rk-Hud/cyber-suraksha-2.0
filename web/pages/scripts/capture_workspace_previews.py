"""Capture actual static-build staging pages in an offline, unauthenticated browser.

No Google login, Neon network, database, credentials or real account data are used.
These are source UI screenshots, NOT authenticated administrator screenshots.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import pathlib
import shutil
import tempfile
import threading

from playwright.sync_api import sync_playwright

LANGS = ("en", "hi", "te")
VIEWS = {"desktop": (1366, 768), "mobile": (390, 844)}
PREFIX = "/cyber-suraksha-2.0/google-test"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def capture(source: pathlib.Path, dest: pathlib.Path):
    if not source.joinpath("en", "account.html").is_file():
        raise ValueError("Missing isolated staging output; refuse to capture arbitrary source")
    if dest.exists() and any(dest.iterdir()):
        raise ValueError("Destination contains existing files; refusing overwrite")
    dest.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="cs-source-previews-") as temp:
        root = pathlib.Path(temp)
        target = root / PREFIX.lstrip("/")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, target)
        handler = functools.partial(QuietHandler, directory=str(root))
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        port = server.server_address[1]
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                for view, (width, height) in VIEWS.items():
                    context = browser.new_context(
                        viewport={"width": width, "height": height},
                        is_mobile=(view == "mobile"),
                        device_scale_factor=1,
                        has_touch=(view == "mobile"),
                    )
                    # Permit loopback static assets only, never the staging APIs.
                    def restrict(route):
                        if route.request.url.startswith(f"http://127.0.0.1:{port}/"):
                            route.continue_()
                        else:
                            route.abort()
                    context.route("**/*", restrict)
                    for lang in LANGS:
                        for name in ("account", "operator"):
                            page = context.new_page()
                            url = f"http://127.0.0.1:{port}{PREFIX}/{lang}/{name}.html"
                            page.goto(url, wait_until="load", timeout=30000)
                            page.locator("main").wait_for()
                            if name == "operator":
                                page.locator("#operator-credentials").wait_for()
                            else:
                                page.locator("#account-app").wait_for()
                            page.screenshot(
                                path=str(dest / f"{lang}-{name}-{view}.png"),
                                full_page=False,
                                animations="disabled",
                            )
                            page.close()
                    context.close()
                browser.close()
        finally:
            server.shutdown()
            thread.join(timeout=5)
            server.server_close()

    (dest / "README.md").write_text(
        "# CYBER SURAKSHA 2.0 — isolated source preview evidence\\n\\n"
        "Generated from the staging static-site build in disposable GitHub Actions.\\n"
        "12 authentic browser screenshots: EN/HI/TE account and operator sign-in at "
        "1366×768 and 390×844.\\n\\n"
        "**No live API request was permitted, no authentication was performed, "
        "and no owner dashboard personal data was accessed.** These screenshots "
        "are not proof of successful Google/TOTP or deployment.\\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    capture(args.source.resolve(), args.output.resolve())
    print("Captured 12 source-only desktop/mobile screenshots; no external network.")
