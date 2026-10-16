"""
Normal use: what a typical visitor does.
"""

import re

from playwright.sync_api import expect

from conftest import transcript, type_command


def current_section(page):
    return page.locator(".topbar nav a.current").get_attribute("data-section")


def test_portfolio_opens_and_gideon_greets(site):
    site.click("#boot-btn")
    expect(site.locator("#boot")).to_have_class(re.compile(r"\bhidden\b"))
    expect(site.locator(".hero-title")).to_contain_text("Data. Rhythm.")
    expect(site.locator("#transcript")).to_contain_text("I am Gideon")


def test_voice_command_scrolls_to_section(site):
    site.click("#boot-btn")
    type_command(site, "show me the projects")
    # (wait_for_function would need eval, which the site's security policy forbids — good)
    expect(site.locator(".topbar nav a.current")).to_have_attribute("data-section", "projects")
    site.wait_for_timeout(1200)  # let the smooth scroll finish
    top = site.evaluate("document.getElementById('projects').getBoundingClientRect().top")
    assert 0 <= top <= 120, f"projects section should be at the top of the screen, was at {top}px"
    assert "Displaying Anish's projects" in transcript(site)


def test_asking_about_one_item_highlights_it(site):
    site.click("#boot-btn")
    type_command(site, "tell me about the jazz band")
    card = site.locator('[data-topic="jazz band"]')
    expect(card).to_have_class(re.compile(r"\bhighlight\b"))
    expect(site.locator("#transcript")).to_contain_text("second-highest jazz band")


def test_nav_link_scrolls_and_highlights(site):
    site.click("#boot-btn")
    site.click('.topbar nav a[data-section="education"]')
    site.wait_for_timeout(1500)
    assert current_section(site) == "education"


def test_scroll_effects_reveal_everything(site):
    site.click("#boot-btn")
    height = site.evaluate("document.documentElement.scrollHeight - innerHeight")
    for y in range(0, height + 1, 300):
        site.evaluate(f"scrollTo(0, {y})")
        site.wait_for_timeout(40)
    site.wait_for_timeout(1600)
    hidden = site.locator(".reveal:not(.in)").count()
    assert hidden == 0, f"{hidden} elements never animated in"
    assert site.locator(".stat-num").first.inner_text() == "15"
    words = site.locator("#statement .w").count()
    assert words > 20 and site.locator("#statement .w.lit").count() == words


def test_game_full_playthrough(site):
    site.click("#boot-game")
    expect(site.locator("#g-chapter")).to_have_text("Prologue")
    for answer in ["I am ready", "a book", "onward", "onward", "onward",
                   "python", "onward", "select", "onward"]:
        type_command(site, answer)
    expect(site.locator("#g-chapter")).to_have_text("Chapter V")
    for _ in range(3):                      # the drum trial, tapped on screen
        site.click("#g-drum")
        site.wait_for_timeout(200)
    expect(site.locator("#memory-name")).to_have_text("Shard of Thunder")
    for answer in ["onward", "the rhythm", "onward", "the truth", "onward", "hola", "onward"]:
        type_command(site, answer)
    expect(site.locator("#g-chapter")).to_have_text("Epilogue")
    expect(site.locator(".shard.found")).to_have_count(8)
    type_command(site, "speak plainly")
    expect(site.locator("body")).not_to_have_class("in-game")


def test_midnight_reading_follows_typed_lines(site):
    site.click("#boot-midnight")
    site.click('#mn-panel [data-act="keys"]')
    expect(site.locator("#mn-page")).to_have_text("Page 1 of 5")
    for line in ["This is the chronicle of Anish Deshpande",
                 "Anish studies Information Sciences and Data Science at the University of Illinois",
                 "Before that Anish studied Data Sciences at Penn State"]:
        site.fill("#mn-type-input", line)
        site.press("#mn-type-input", "Enter")
    expect(site.locator("#mn-page")).to_have_text("Page 2 of 5")
    site.click("#mn-leave")
    expect(site.locator("body")).not_to_have_class("in-midnight")
