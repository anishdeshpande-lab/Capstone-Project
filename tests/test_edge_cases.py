"""
Edge cases: bad, weird, or hostile input. The site must neither break nor run injected code.
"""

import http.server
import json
import socketserver
import threading

import pytest
from playwright.sync_api import expect

from conftest import transcript, type_command

ATTACKS = [
    '<img src=x onerror="window.__pwned = true">',
    '"><script>window.__pwned = true</script>',
    "<svg onload=window.__pwned=true>",
    "javascript:window.__pwned=true",
    "((((a+)+)+)+)+$",
    "__proto__",
]


@pytest.mark.parametrize("attack", ATTACKS)
def test_malicious_input_is_shown_as_text_not_run(site, attack):
    site.click("#boot-btn")
    type_command(site, attack)
    site.wait_for_timeout(200)
    assert site.evaluate("window.__pwned") is None, "injected code ran"
    assert site.locator("#transcript img, #transcript svg, #transcript script").count() == 0
    assert attack.strip()[:20] in transcript(site)


def test_empty_and_enormous_input(site):
    site.click("#boot-btn")
    type_command(site, "")
    type_command(site, "   ")
    site.evaluate("respond('tell me about ' + 'a'.repeat(100000))")  # bypasses the text box's length limit
    site.evaluate("for (let i = 0; i < 150; i++) respond('spam ' + i)")
    lines = site.locator("#transcript .line").count()
    assert lines <= 80, f"transcript should be capped at 80 lines, has {lines}"


def test_unknown_command_gets_a_helpful_reply(site):
    site.click("#boot-btn")
    type_command(site, "purple elephant sandwich")
    expect(site.locator("#transcript")).to_contain_text("didn't understand")


def test_wrong_game_answer_does_not_advance(site):
    site.click("#boot-game")
    type_command(site, "I am ready")
    type_command(site, "a tree")
    type_command(site, "a rock")
    expect(site.locator("#g-chapter")).to_have_text("Chapter I")
    expect(site.locator("#transcript")).to_contain_text("hint")


@pytest.mark.parametrize("save", [
    {"chapter": 999, "shards": "x", "complete": True},
    {"chapter": -5, "shards": [1, {}, None]},
    {"__proto__": {"polluted": 1}},
    "not json at all",
])
def test_tampered_save_game_is_ignored(page, server, save):
    raw = save if isinstance(save, str) else json.dumps(save)
    page.add_init_script(f"localStorage.setItem('gideon-chronicle-save', {json.dumps(raw)})")
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.goto(f"{server}/index.html")
    page.click("#boot-game")
    expect(page.locator("#g-chapter")).to_have_text("Prologue")
    assert page.evaluate("({}).polluted") is None
    assert errors == []


def test_security_policy_blocks_injected_scripts(site):
    site.evaluate("""() => {
        const s = document.createElement('script');
        s.textContent = 'window.__inline = true';
        document.body.appendChild(s);
    }""")
    site.wait_for_timeout(200)
    assert site.evaluate("window.__inline") is None


def test_other_sites_cannot_frame_the_page(page, server):
    # A real second web server on another port (= another origin) plays the attacker,
    # serving a page that tries to embed ours in an iframe
    evil_html = f"<iframe src='{server}/index.html' width=800 height=400></iframe>".encode()

    class Evil(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(evil_html)

        def log_message(self, *args):
            pass

    attacker = socketserver.TCPServer(("127.0.0.1", 0), Evil)
    threading.Thread(target=attacker.serve_forever, daemon=True).start()
    try:
        page.goto(f"http://127.0.0.1:{attacker.server_address[1]}/")
        frame = page.frame_locator("iframe")
        expect(frame.locator("body")).to_contain_text("can't be shown inside another page")
    finally:
        attacker.shutdown()


def test_malicious_url_hash_is_harmless(page, server):
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.goto(f"{server}/index.html#<img src=x onerror=window.__pwned=1>")
    page.wait_for_timeout(300)
    assert page.evaluate("window.__pwned") is None
    assert errors == []
