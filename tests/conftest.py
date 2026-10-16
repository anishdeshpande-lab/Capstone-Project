"""
Shared test setup.

Starts a tiny local web server for the site, launches Chrome (via Playwright)
with a fake microphone/camera, and fails any test where the page throws a
JavaScript error.
"""

import functools
import http.server
import pathlib
import socketserver
import threading

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript"}

    def log_message(self, *args):
        pass


@pytest.fixture(scope="session")
def server():
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


@pytest.fixture(scope="session")
def browser_type_launch_args(browser_type_launch_args):
    # Fake mic/camera so permission prompts never block a headless run
    return {
        **browser_type_launch_args,
        "args": [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
        ],
    }


@pytest.fixture
def site(page, server):
    """The home page, loaded and ready. Fails the test if any JavaScript error occurs."""
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.goto(f"{server}/index.html")
    page.evaluate("document.fonts.ready")
    yield page
    assert errors == [], f"JavaScript errors on the page: {errors}"


def type_command(page, text):
    """Type into Gideon's text box (the same path a visitor without a microphone uses)."""
    page.evaluate("document.getElementById('gideon').classList.remove('collapsed')")
    box = page.locator("#text-input")
    box.fill(text)
    box.press("Enter")


def transcript(page):
    return page.locator("#transcript").inner_text()
