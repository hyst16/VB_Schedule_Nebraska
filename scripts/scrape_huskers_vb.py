#!/usr/bin/env python3
import json
import re
from pathlib import Path
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

SOURCE_URL = "https://huskers.com/sports/volleyball/schedule"
OUT = Path("data/vb_raw.json")
OUT.parent.mkdir(parents=True, exist_ok=True)

# -------- Helpers (same style as your football scraper) --------

def clean(s):
    return " ".join(s.split()) if isinstance(s, str) else s

def safe_text(locator, timeout=1000):
    """Return innerText of the FIRST match, or None if no match."""
    try:
        if not locator or locator.count() == 0:
            return None
        return locator.first.inner_text(timeout=timeout).strip()
    except PWTimeout:
        return None

def safe_attr(locator, name, timeout=1000):
    """Return attribute of the FIRST match, or None if no match."""
    try:
        if not locator or locator.count() == 0:
            return None
        return locator.first.get_attribute(name, timeout=timeout)
    except PWTimeout:
        return None

def get_img_src(locator):
    """Return best-available image URL after lazy-load, or None."""
    if not locator or locator.count() == 0:
        return None
    img = locator.first
    try:
        current = img.evaluate("(el) => el.currentSrc || el.src || el.getAttribute('data-src') || ''")
        if current and not current.startswith("data:image"):
            return current
        src = safe_attr(locator, "src")
        if src and not src.startswith("data:image"):
            return src
        data_src = safe_attr(locator, "data-src")
        if data_src and not data_src.startswith("data:image"):
            return data_src
    except PWTimeout:
        pass
    return None

def get_img_alt(locator):
    """Return alt text of FIRST match, lowercased, or ''."""
    alt = safe_attr(locator, "alt") or ""
    return alt.lower()

# -------- Per-event parsing (Sidearm CSS matches football) --------

def parse_event(event):
    # Venue type: Home / Away / Neutral
    venue_type = safe_text(event.locator(".schedule-event-venue__type-label"))

    # Date pieces
    weekday = safe_text(event.locator(".schedule-event-date__time time"))  # e.g., Fri
    date_text = safe_text(event.locator(".schedule-event-date__label"))    # e.g., Sep 5

    # Result / time
    status = "tbd"
    result = None
    time_local = None

    has_win = event.locator(".schedule-event-item-result__win").count() > 0
    has_loss = event.locator(".schedule-event-item-result__loss").count() > 0
    has_tie = event.locator(".schedule-event-item-result__tie").count() > 0

    label_text = safe_text(event.locator(".schedule-event-item-result__label")) or ""

    if has_win or has_loss or has_tie:
        status = "final"
        outcome = "W" if has_win else "L" if has_loss else "T"
        # VB result often like "Win 3-0" — grab the set score
        parts = label_text.split()
        set_score = next((p for p in parts if "-" in p or "–" in p), label_text).replace("–", "-")
        result = {"outcome": outcome, "sets": set_score}
    else:
        # Upcoming: label_text usually holds "8:00 PM CDT" or similar
        tl = clean(label_text)
        time_local = tl if tl else None
        status = "upcoming" if time_local else "tbd"

    # Ensure lazy images load
    try:
        event.scroll_into_view_if_needed(timeout=2000)
    except PWTimeout:
        pass

    # Logos (order on Sidearm: Nebraska first, Opponent second)
    wrappers = event.locator(".schedule-event-item-default__images .schedule-event-item-default__image-wrapper")
    nebraska_logo_url = opponent_logo_url = None
    nebraska_alt = opponent_alt = ""

    if wrappers.count() >= 1:
        nebraska_logo = wrappers.nth(0).locator("img")
        nebraska_logo_url = get_img_src(nebraska_logo)
        nebraska_alt = get_img_alt(nebraska_logo)
    if wrappers.count() >= 2:
        opponent_logo = wrappers.nth(1).locator("img")
        opponent_logo_url = get_img_src(opponent_logo)
        opponent_alt = get_img_alt(opponent_logo)

    # Divider & opponent text
    divider_text = safe_text(event.locator(".schedule-event-item-default__divider"))  # "vs" / "at"
    opponent_name = clean(safe_text(event.locator(".schedule-event-item-default__opponent-name"))) or ""

    # Location (e.g., "Lincoln, Neb. / Bob Devaney Sports Center")
    location = clean(safe_text(event.locator(".schedule-event-item-default__location .schedule-event-location"))) or ""

    # TV (grab first logo if present; Sidearm links group at the bottom)
    tv_logo = event.locator(".schedule-event-bottom__link img, .schedule-event-item-links__image")
    tv_network_logo_url = get_img_src(tv_logo) if tv_logo.count() > 0 else None

    # Links (Watch/Listen/Stats/Box/Recap)
    links = []
    link_nodes = event.locator(".schedule-event-bottom__link")
    for i in range(link_nodes.count()):
        a = link_nodes.nth(i)
        title = safe_text(a.locator(".schedule-event-item-links__title")) or clean(safe_text(a))
        href = safe_attr(a, "href")
        if href:
            if href.startswith("/"):
                href = "https://huskers.com" + href
            links.append({"title": title, "href": href})

    # ---- NU-only filter ----
    # Keep only events where Nebraska is one of the two teams in the logo strip.
    # This is robust on invitational weekends where non-NU matches appear.
    contains_nebraska = ("nebraska" in nebraska_alt) or ("nebraska" in opponent_alt)
    if not contains_nebraska:
        return None  # drop non-NU matches

    # Opponent name cleanup & ranking parse (e.g., "#22 Utah")
    opp_rank = None
    m = re.match(r"#(\d{1,2})\s+(.*)$", opponent_name)
    if m:
        opp_rank = int(m.group(1))
        opponent_name = m.group(2)

    # NU rank (if Sidearm shows it near the NU logo as "#1")
    nu_rank = None
    # Sometimes rank is rendered near the divider/NU area; try to extract from event text:
    ev_text = (safe_text(event.locator(".schedule-event-item-default")) or "") + " " + (divider_text or "")
    mnu = re.search(r"#(\d{1,2})\s+(?:vs|at)\b", ev_text)
    if mnu:
        nu_rank = int(mnu.group(1))

    return {
        "venue_type": venue_type,              # "Home"/"Away"/"Neutral"
        "weekday": weekday,                    # e.g., "Fri"
        "date_text": date_text,                # e.g., "Sep 5"
        "status": status,                      # "final"/"upcoming"/"tbd"
        "result": result,                      # {"outcome":"W","sets":"3-0"} or None
        "time_local": time_local,              # "8:00 PM CDT" or None
        "divider_text": divider_text,          # "vs"/"at"
        "nebraska_logo_url": nebraska_logo_url,
        "opponent_logo_url": opponent_logo_url,
        "opponent_name": opponent_name,        # e.g., "Wright State"
        "opp_rank": opp_rank,                  # e.g., 22
        "nu_rank": nu_rank,                    # e.g., 1
        "location": location,                  # "Lincoln, Neb. / Bob Devaney Sports Center"
        "tv_network_logo_url": tv_network_logo_url,
        "links": links,
    }

# -------- Main scrape --------

def scrape_with_playwright():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent="huskers-vb-schedule-scraper/1.0 (+https://example.com)",
            viewport={"width": 1400, "height": 2400},
        )
        page = ctx.new_page()
        page.goto(SOURCE_URL, wait_until="networkidle")
        page.wait_for_timeout(400)

        # Nudge lazy elements into view to populate currentSrc
        events = page.locator(".schedule-event-item")
        for i in range(events.count()):
            ev = events.nth(i)
            try:
                ev.scroll_into_view_if_needed(timeout=2000)
            except PWTimeout:
                pass
            page.wait_for_timeout(120)

        # Parse all events
        events = page.locator(".schedule-event-item")
        rows = []
        for i in range(events.count()):
            parsed = parse_event(events.nth(i))
            if parsed:
                rows.append(parsed)

        payload = {
            "source_url": SOURCE_URL,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "items": rows,   # keep "items" to match your normalizer
        }
        OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False))

        ctx.close()
        browser.close()

if __name__ == "__main__":
    scrape_with_playwright()
    print(f"Wrote {OUT}")
