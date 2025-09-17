#!/usr/bin/env python3
import json, re
from pathlib import Path
from datetime import datetime
from dateutil import tz

DATA = Path("data")
RAW  = DATA/"vb_raw.json"
OUT  = DATA/"vb_schedule_normalized.json"

CENTRAL = tz.gettz("America/Chicago")

def slug(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return re.sub(r"-+", "-", s).strip("-")

def normalize(items: list, scraped_at: str):
    year = datetime.fromisoformat((scraped_at or "").replace("Z","+00:00")).year \
           if scraped_at else datetime.now(CENTRAL).year

    rows = []
    for it in items:
        # date: prefer ISO date emitted by scraper
        date_iso = it.get("date")
        if not date_iso:
            # no date => drop (prevents last-season bleed)
            continue

        # hard season filter: keep only current season year
        if not str(date_iso).startswith(f"{year}-"):
            continue

        # home/away/neutral (already mapped to H/A/N in scraper under 'venue_type')
        han = it.get("venue_type") or "N"

        # city / arena
        city  = (it.get("city") or "").strip() or None
        arena = (it.get("arena") or "").strip() or None
        if arena:
            arena = re.sub(r"\s*presented by\b.*$", "", arena, flags=re.I).strip()
        arena_key = slug(arena or "unknown")

        # result / status
        res = it.get("result")
        status = "final" if res else "scheduled"
        result_str = None
        result_css = None
        if res:
            result_str = f"{res.get('outcome')} {res.get('sets')}"
            result_css = res.get("outcome")

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
            "result_css": {"W":"W","L":"L","T":"T"}.get(result_css),
            "notes": None,
            "links": it.get("links") or [],
        })

    # sort by date then time
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
