#!/usr/bin/env python3
"""
Normalize Huskers VB raw scrape into a consistent structure for the UI.
- Fills ISO dates (parsing "SEP 20" if needed)
- Keeps only current-season rows
- Preserves ranks and builds a short 'title' ("#6 Stanford")
"""

import json, re
from pathlib import Path
from datetime import datetime
from dateutil import tz

DATA = Path("data")
RAW  = DATA / "vb_raw.json"
OUT  = DATA / "vb_schedule_normalized.json"

CENTRAL = tz.gettz("America/Chicago")

# Simple month lookup by 3-letter key
MONTH_IDX = {
    "jan":1, "feb":2, "mar":3, "apr":4, "may":5, "jun":6,
    "jul":7, "aug":8, "sep":9, "oct":10, "nov":11, "dec":12,
}

def slug(s: str) -> str:
    """URL-ish key maker (for arena image lookups etc.)."""
    s = (s or "").lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return re.sub(r"-+", "-", s).strip("-")

def parse_date_from_text(label: str, season_year: int) -> str | None:
    """
    Accepts 'AUG 22', 'Sep 5', 'Sept. 5', 'September 5' (case-insensitive).
    Returns 'YYYY-MM-DD' or None.
    """
    if not label:
        return None
    m = re.match(r"\s*([A-Za-z.]+)\s+(\d{1,2})\s*$", label)
    if not m:
        return None
    mon_token = m.group(1).replace(".", "")
    mon_key = mon_token[:3].lower()   # "September" -> "sep"
    mon = MONTH_IDX.get(mon_key)
    if not mon:
        return None
    day = int(m.group(2))
    return f"{season_year:04d}-{mon:02d}-{day:02d}"

def parse_rank_from_title(title: str) -> int | None:
    """
    Fallback: if a title starts like '#12 Opponent', return 12.
    (We prefer the scraper's explicit fields, but belts & suspenders.)
    """
    if not title:
        return None
    m = re.match(r"\s*#\s*(\d+)\b", title)
    return int(m.group(1)) if m else None

def normalize(items: list, scraped_at: str):
    # Determine the season year from the scrape timestamp; fall back to 'now' in Central
    try:
        season_year = datetime.fromisoformat((scraped_at or "").replace("Z", "+00:00")).year
    except Exception:
        season_year = datetime.now(CENTRAL).year

    rows = []
    for it in items:
        # --- Date: prefer ISO from scraper; else parse from visible label ---
        date_iso = it.get("date") or parse_date_from_text(it.get("date_text"), season_year)
        if not date_iso:
            # Can't place it on the calendar → skip
            continue

        # Keep only rows in this season (guards against old pages lingering)
        if not str(date_iso).startswith(f"{season_year}-"):
            continue

        # Home/Away/Neutral
        han = it.get("venue_type") or "N"

        # Clean city/arena; strip "presented by ..."
        city  = (it.get("city") or "").strip() or None
        arena = (it.get("arena") or "").strip() or None
        if arena:
            arena = re.sub(r"\s*presented by\b.*$", "", arena, flags=re.I).strip()
        arena_key = slug(arena or "unknown")

        # Status + result
        res = it.get("result")
        status = "final" if res else "scheduled"
        result_str = None
        result_css = None
        if res:
            result_str = f"{res.get('outcome')} {res.get('sets')}"  # e.g., "W 3-1"
            result_css = {"W": "W", "L": "L", "T": "T"}.get(res.get("outcome"))

        # Names + ranks
        opp = it.get("opponent_name") or "TBA"
        opp_rank = it.get("opp_rank")
        nu_rank  = it.get("nu_rank")

        # Best-effort rank fallback from a title if we didn't get explicit opp_rank
        if opp_rank is None:
            maybe = parse_rank_from_title(opp)
            if maybe is not None:
                opp_rank = maybe
                # Remove "#N " prefix from display name if present
                opp = re.sub(r"^\s*#\s*\d+\s+", "", opp).strip() or opp

        # Title shown in UI rows: "#6 Stanford" or just "Stanford"
        title = f"{('#'+str(opp_rank)+' ') if opp_rank else ''}{opp}".strip()

        # Compose final row
        rows.append({
            "date": date_iso,
            "time_local": it.get("time_local"),
            "home_away": han,
            "nu_rank": nu_rank,
            "opponent": opp,
            "opp_rank": opp_rank,
            "title": title,
            "arena": arena,
            "city": city,
            "arena_key": arena_key,
            "nu_logo": it.get("nebraska_logo_url"),
            "opp_logo": it.get("opponent_logo_url"),
            "tv_logo": it.get("tv_network_logo_url"),
            "tv": it.get("networks") or [],    # currently unused, but preserved
            "status": status,
            "result": result_str,
            "result_css": result_css,
            "notes": None,
            "links": it.get("links") or [],
        })

    # Sort by date (then time if present)
    rows.sort(key=lambda x: (x.get("date") or "9999-12-31", x.get("time_local") or "23:59"))
    return rows

def main():
    raw = json.loads(RAW.read_text("utf-8")) if RAW.exists() else {}
    items = raw.get("items", [])
    scraped_at = raw.get("scraped_at") or ""
    normalized = {"items": normalize(items, scraped_at)}
    OUT.write_text(json.dumps(normalized, indent=2), encoding="utf-8")
    print(f"wrote {OUT}")

if __name__ == "__main__":
    main()
