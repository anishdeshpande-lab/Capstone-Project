# Anish Deshpande: Gideon Portfolio

A personal portfolio website you can **talk to**. Inspired by Gideon, the AI from *The Flash*, the site listens through your microphone and answers out loud: say "show me the projects" and it scrolls there and tells you about them.

**Live site:** https://anishdeshpande-lab.github.io/Capstone-Project/
**Repository:** https://github.com/anishdeshpande-lab/Capstone-Project

NOBE Capstone Project, Fall 2026.

---

## Features

### The portfolio
- **One long, Apple-style scrolling page:** the hero shrinks as you scroll, the About statement lights up word by word, stats count up, the education timeline draws itself, skill words slide sideways, project cards stack on top of each other.
- **Gideon, the voice assistant:** speech recognition plus speech synthesis (Web Speech API). Press <kbd>Space</kbd> or click the orb, then speak, or type in the panel if your browser has no voice input.
  - "Show me the projects" / "Where does Anish go to school?" scrolls to that section and summarizes it
  - "Tell me about the jazz band" / "Project two" scrolls to that card, highlights it, and reads it aloud
  - "Go back", "scroll down", "help", "stop"
- **Generated sound design:** a chime and a soft drone around Gideon's voice, made live with the Web Audio API (no audio files).

### Creative interactive features
1. **The Shattered Chronicle** (say "enter the ruins"): a story-driven, dark-fantasy voice game. Each chapter is a riddle or trial answered out loud; each correct answer restores a "memory shard" that reveals part of the résumé. One trial is passed by **clapping three times** into the microphone.
2. **The Midnight Reading** (say "read the book"): a horror mini-game. Read a book about Anish aloud, line by line, while monsters creep in from the window and doorway. **Look at them** to hold them back (webcam gaze tracking with MediaPipe, processed entirely on-device). Includes jump scares, plus a gentle mode without them.

---

## Setup (run it locally)

Requirements: **Python 3.10+** and **Chrome or Edge** (the browsers with speech recognition).

```bash
git clone https://github.com/anishdeshpande-lab/Capstone-Project.git
cd Capstone-Project
python -m http.server 8000
```

Open **http://localhost:8000**. The microphone only works on `localhost` or HTTPS, not by double-clicking the file.

No build step: the site is plain HTML, CSS, and JavaScript.

## Tests

Automated browser tests use **pytest + Playwright**: they start the site on a local server, drive a real Chromium browser, and fail on any JavaScript error.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
python -m playwright install chromium
python -m pytest -v
```

| File | What it covers |
|---|---|
| `tests/test_normal_use.py` | **Normal use:** opening the site, voice commands scrolling to sections, asking about a specific item, nav links, every scroll animation firing, a full playthrough of the game, the horror mode following along as lines are read |
| `tests/test_edge_cases.py` | **Edge cases:** script-injection attempts typed into Gideon (shown as text, never run), empty and 100,000-character input, unknown commands, wrong game answers, tampered save data, injected `<script>` tags blocked by the Content Security Policy, other sites trying to embed the page, malicious URL hashes |

## CI/CD (GitHub Actions)

Workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

| Trigger | Jobs |
|---|---|
| Every pull request | `lint` (every JS file must parse) and `tests` (the full Playwright suite) |
| Push to `main` (a merged PR) | `lint` and `tests` again, then **`deploy`** to GitHub Pages, which only runs if both pass |

**Branch protection on `main`** requires the `lint` and `tests` checks to pass before a pull request can be merged, so only verified code reaches the live site.

## Deployment

Deployment is automatic: merging a pull request into `main` triggers the workflow, and after the checks pass, the `deploy` job publishes `index.html`, `css/`, and `js/` to GitHub Pages. Tests and tooling are not deployed.

One-time setup (already done for this repo): **Settings → Pages → Source: GitHub Actions**, and **Settings → Branches → protect `main`, require status checks `lint` and `tests`**.

## Security

The site has no server code, database, logins, or secrets, so the attack surface is the browser itself. Protections:
- All visitor input is rendered with `textContent`, never `innerHTML`, so typed or spoken text can't become code.
- A strict **Content Security Policy** only allows the site's own scripts (plus one pinned library), so even injected markup can't run scripts.
- The page refuses to run inside another site's frame, which prevents tricking visitors into granting microphone or camera access.
- Input length is capped, the transcript is capped, and saved game data is validated before use.
- Camera video for the horror mode is processed locally and never leaves the device.

---

## AI use

This project was built with substantial help from **Claude (Anthropic), via Claude Code**, an AI coding assistant. I directed the project (the idea, the features, the content, the design direction, and every change request) and reviewed and tested the results; the AI wrote most of the code, including:

- the voice engine, command matching, and the scrolling page's design and animations
- both games (story, riddles, gaze tracking, generated sound effects)
- the security hardening, the automated test suite, the GitHub Actions workflow, and this README's first draft

All résumé content comes from my own résumé. I checked behavior by running the site and the test suite.

## Limitations

- **Voice input needs Chrome or Edge.** Firefox has no speech recognition; there, Gideon still talks, and you type instead. Chrome sends audio to Google's servers for transcription, so voice input needs an internet connection.
- **Speech recognition makes mistakes**, especially with names and unusual words. Commands and game answers accept several phrasings to compensate.
- **Gaze tracking is approximate.** It mainly detects head turns, and works best in good lighting with a short calibration. Arrow keys work as a fallback.
- **Clap detection** depends on the microphone and room noise; tapping the drum on screen always works.
- **Gideon's voice** depends on the voices installed on the visitor's device.
- **The automated tests use typed input**, because CI has no real microphone, camera, or speaker. Real speech and webcam behavior were tested by hand.

## Project structure

```
index.html            the page: portfolio sections, game screens, Gideon's panel
css/style.css         portfolio theme and scroll effects
css/game.css          The Shattered Chronicle
css/midnight.css      The Midnight Reading
js/gideon.js          voice engine: listening, speaking, mic levels
js/commands.js        what Gideon understands in the portfolio
js/app.js             wiring: navigation, transcript, inputs, security guard
js/scroll.js          scroll-driven animations
js/ambience.js        generated sound design
js/story.js, game.js  the game's script and engine
js/midnight.js        the horror mode
tests/                Playwright test suite
.github/workflows/    CI/CD
```
