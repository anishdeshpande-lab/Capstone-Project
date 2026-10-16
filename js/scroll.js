/*
 * scroll.js — Apple-style scroll effects for the portfolio page.
 *
 * Two kinds of effects:
 *   1. Reveal-on-enter: anything with .reveal fades/rises in the first time it
 *      scrolls into view (IntersectionObserver adds .in). Number tiles count up.
 *   2. Scroll-linked: values that track how far you've scrolled, written as CSS
 *      variables every frame (the CSS turns them into motion):
 *        hero        --p     headline shrinks and fades, glow grows
 *        statement   .lit    words light up one by one
 *        timeline    --line  the line draws itself
 *        marquee     --x     giant skill words slide sideways
 *        projects    --s/--b each card shrinks and dims as the next covers it
 *        awards      --z     "Hola." zooms in
 *        page        --progress  thin bar at the very top
 *
 * With "reduce motion" turned on, everything is simply shown, nothing moves.
 */

(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const $ = (sel) => document.querySelector(sel);

  // ---------- 1. Reveal on enter ----------

  const reveals = [...document.querySelectorAll(".reveal")];
  // Stagger siblings: the 2nd card in a row arrives a beat after the 1st, etc.
  reveals.forEach(el => {
    if (el.style.getPropertyValue("--d")) return;
    const siblings = [...el.parentElement.children].filter(c => c.classList.contains("reveal"));
    el.style.setProperty("--d", siblings.indexOf(el));
  });

  function countUp(el) {
    el.querySelectorAll("[data-count]").forEach(num => {
      const target = +num.dataset.count;
      const suffix = num.dataset.suffix || "";
      if (reduced) { num.textContent = target + suffix; return; }
      const start = performance.now();
      const duration = 1400;
      const tick = (now) => {
        const t = clamp((now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        num.textContent = Math.round(eased * target) + suffix;
        if (t < 1) requestAnimationFrame(tick);
      };
      num.textContent = "0" + suffix;
      requestAnimationFrame(tick);
    });
  }

  if (reduced || !("IntersectionObserver" in window)) {
    reveals.forEach(el => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("in");
        countUp(e.target);
        io.unobserve(e.target);
      }
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(el => io.observe(el));
  }

  // ---------- 2. Scroll-linked ----------

  const progressBar = $("#scroll-progress");
  const hero = $("#home");
  const statementSection = $("#about");
  const timeline = $("#timeline");
  const marquee = $("#marquee");
  const rows = [...document.querySelectorAll(".marquee-row")];
  const stackCards = [...document.querySelectorAll(".stack-card")];
  const awardWord = $("#award-word");

  // Split the About statement into words; words inside <em> get the gradient when lit
  const words = [];
  const statement = $("#statement");
  if (statement) {
    const parts = [...statement.childNodes];
    statement.replaceChildren();
    for (const node of parts) {
      const key = node.nodeType === Node.ELEMENT_NODE;
      node.textContent.split(/(\s+)/).forEach(token => {
        if (!token) return;
        if (/^\s+$/.test(token)) return statement.append(token);
        const span = document.createElement("span");
        span.className = key ? "w key" : "w";
        span.textContent = token;
        statement.append(span);
        words.push(span);
      });
    }
  }
  let litCount = -1;

  /** 0 at the moment a tall sticky section starts pinning, 1 when it un-pins. */
  const stickyProgress = (el) => {
    const r = el.getBoundingClientRect();
    return clamp(-r.top / (r.height - innerHeight));
  };

  function update() {
    ticking = false;
    const vh = innerHeight;

    const max = document.documentElement.scrollHeight - vh;
    progressBar?.style.setProperty("--progress", max > 0 ? (scrollY / max).toFixed(4) : 0);
    if (reduced || document.body.classList.contains("in-game") || document.body.classList.contains("in-midnight")) return;

    if (hero) hero.style.setProperty("--p", stickyProgress(hero).toFixed(4));

    if (words.length) {
      // Finish lighting a little before the section un-pins, so the full sentence lingers
      const lit = Math.round(clamp(stickyProgress(statementSection) * 1.25) * words.length);
      if (lit !== litCount) {
        words.forEach((w, i) => w.classList.toggle("lit", i < lit));
        litCount = lit;
      }
    }

    if (timeline) {
      const r = timeline.getBoundingClientRect();
      timeline.style.setProperty("--line", clamp((vh * 0.65 - r.top) / r.height).toFixed(4));
    }

    if (marquee) {
      const r = marquee.getBoundingClientRect();
      const t = (vh - r.top) / (vh + r.height); // 0 entering at the bottom → 1 leaving at the top
      rows.forEach(row => {
        const speed = +row.dataset.speed || 1;
        // Always offset left (≤ 0) so a row never leaves a gap at the screen's left edge
        row.style.setProperty("--x", `${((-0.35 + speed * (t - 0.5) * 0.6) * innerWidth).toFixed(1)}px`);
      });
    }

    // Each card shrinks and dims as the next one slides over it
    stackCards.forEach((card, i) => {
      const next = stackCards[i + 1];
      if (!next) return;
      const r = card.getBoundingClientRect();
      const covered = clamp((r.bottom - next.getBoundingClientRect().top) / r.height);
      card.style.setProperty("--s", (1 - covered * 0.07).toFixed(4));
      card.style.setProperty("--b", (1 - covered * 0.5).toFixed(4));
    });

    if (awardWord) {
      const r = awardWord.getBoundingClientRect();
      awardWord.style.setProperty("--z", clamp((vh - r.top) / (vh * 0.75)).toFixed(4));
    }
  }

  let ticking = false;
  const requestUpdate = () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  };
  addEventListener("scroll", requestUpdate, { passive: true });
  addEventListener("resize", requestUpdate);
  update();
})();
