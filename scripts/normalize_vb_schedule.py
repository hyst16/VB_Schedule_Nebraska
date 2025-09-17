#!/usr/bin/env python3
import json, re
from pathlib import Path
from datetime import datetime
from dateutil import tz

DATA = Path("data")
RAW  = DATA/"vb_raw.json"
OUT  = DATA/"vb_schedule_normalized.json"

CENTRAL = tz.gettz("America/Chicago")

MONTHS = {
    "Jan":1,"Jan.":1,"January":1,
    "Feb":2,"Feb.":2,"February":2,
    "Mar":3,"Mar.":3,"March":3,
    "Apr":4,"Apr.":4,"April":4,
    "May":5,
    "Jun":6,"June":6,
    "Jul":7,"July":7,
    "Aug":8,"Aug.":8,"August":8,
    "Sep":9,"Sep.":9,"Sept":9,"Sept.":9,"September":9,
    "Oct":10,"Oct.":10,"October":10,
    "Nov":11,"Nov.":11,"November":11,
    "Dec":12,"Dec.":12,"December":12,
}

def slug(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return re.sub(r"-+", "-", s).strip("-")

def parse_date_from_text(label: str, season_year: int) -> str | None:
    if not label: return None
    m = re.match(r"\s*([A-Za-z.]+)\s+(\d{1,2})\s*$", label)
    if not m: return None
    mon = MONTHS.get(m.group(1)); day = int(m.group(2))
    if not mon: return None
    return f"{season_year:04d}-{mon:02d}-{day:02d}"

def normalize(items: list, scraped_at: str):
    # Season year: use scrape timestamp
    try:
        season_year = datetime.fromisoformat((scraped_at or "").replace("Z","+00:00")).year
    except Exception:
        season_year = datetime.now(CENTRAL).year

    rows = []
    for it in items:
        # date: prefer ISO from scraper; else parse from date_text
        date_iso = it.get("date")
        if not date_iso:
            date_iso = parse_date_from_text(it.get("date_text"), season_year)
        if not date_iso:
            # still no date? skip this row (prevents cascades)
            continue

        # Hard guard: only keep rows from season_year
        if not str(date_iso).startswith(f"{season_year}-"):
            continue

        han = it.get("venue_type") or "N"

        city  = (it.get("city") or "").strip() or None
        arena = (it.get("arena") or "").strip() or None
        if arena:
            arena = re.sub(r"\s*presented by\b.*$", "", arena, flags=re.I).strip()
        arena_key = slug(arena or "unknown")

        # result / status
        res = it.get("result")
        status = "final" if res else "scheduled"
        result_str = None; result_css = None
        if res:
            result_str = f"{res.get('outcome')} {res.get('sets')}"
            result_css = {"W":"W","L":"L","T":"T"}.get(res.get("outcome"))

        opp = it.get("opponent_name") or "TBA"
        opp_rank = it.get("opp_rank")
        nu_rank  = it.get("nu_rank")
        title = f"{('#'+str(opp_rank)+' ') if opp_rank else ''}{opp}".strip()

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
            "tv": it.get("networks") or [],
            "status": status,
            "result": result_str,
            "result_css": result_css,
            "notes": None,
            "links": it.get("links") or [],
        })

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
