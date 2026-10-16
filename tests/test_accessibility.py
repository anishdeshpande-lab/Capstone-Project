"""
Usability and accessibility: keyboard use, phone layout, and an automated
accessibility audit with axe-core (the engine behind Lighthouse's accessibility score).
"""

import pathlib
import re

import pytest
from playwright.sync_api import expect

# axe-core 4.10.2 (MPL-2.0, Deque Systems), kept in the repo so the test needs no network
AXE_FILE = pathlib.Path(__file__).parent / "vendor" / "axe.min.js"


@pytest.fixture(scope="session")
def axe_source():
    return AXE_FILE.read_text(encoding="utf-8")


def scroll_through(page):
    """Scroll top to bottom like a visitor, so every section has animated in."""
    height = page.evaluate("document.documentElement.scrollHeight - innerHeight")
    for y in range(0, height + 1, 400):
        page.evaluate(f"scrollTo(0, {y})")
        page.wait_for_timeout(30)
    page.wait_for_timeout(1500)
    page.evaluate("scrollTo(0, 0)")
    page.wait_for_timeout(800)  # let scroll effects and color transitions settle


def test_no_serious_accessibility_violations(browser, server, axe_source):
    # The audit script is injected only for this test, so the site's security policy is bypassed here
    context = browser.new_context(bypass_csp=True)
    page = context.new_page()
    page.goto(f"{server}/index.html")
    page.evaluate("document.fonts.ready")
    page.click("#boot-btn")
    scroll_through(page)
    page.add_script_tag(content=axe_source)
    results = page.evaluate("axe.run(document, { resultTypes: ['violations'] })")
    context.close()

    serious = [v for v in results["violations"] if v["impact"] in ("serious", "critical")]
    report = "\n".join(
        f"- {v['id']} ({v['impact']}): {v['help']} -> {[n['target'] for n in v['nodes']][:3]}"
        for v in serious
    )
    assert not serious, f"Accessibility problems:\n{report}"


def test_space_still_presses_a_focused_button(site):
    site.click("#boot-btn")
    site.focus("#enter-game")
    site.keyboard.press("Space")
    expect(site.locator("body")).to_have_class(re.compile(r"\bin-game\b"))


def test_skip_link_appears_for_keyboard_users(site):
    site.click("#boot-btn")
    site.focus(".skip-link")
    site.wait_for_timeout(400)  # it slides down over 0.2s
    box = site.locator(".skip-link").bounding_box()
    assert box["y"] >= 0, "skip link should slide into view when focused"


def test_phone_layout_has_no_sideways_scrolling(browser, server):
    context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page = context.new_page()
    page.goto(f"{server}/index.html")
    page.evaluate("document.fonts.ready")
    page.click("#boot-btn")
    scroll_through(page)
    overflow = page.evaluate("document.documentElement.scrollWidth - innerWidth")
    context.close()
    assert overflow <= 0, f"page is {overflow}px wider than a phone screen"
