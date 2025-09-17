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
    "Jan":1, "Jan.":1, "January":1,
    "Feb":2, "Feb.":2, "February":2,
    "Mar":3, "Mar.":3, "March":3,
    "Apr":4, "Apr.":4, "April":4,
    "May":5,
    "Jun":6, "June":6,
    "Jul":7, "July":7,
    "Aug":8, "Aug.":8, "August":8,
    "Sep":9, "Sept":9, "Sep.":9, "Sept.":9, "September":9,
    "Oct":10, "Oct.":10, "October":10,
    "Nov":11, "Nov.":11, "November":11,
    "Dec":12, "Dec.":12, "December":12,
}

def slug(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return re.sub(r"-+", "-", s).strip("-")

def parse_iso_date(date_text: str, scraped_at: str) -> str | None:
    """
    date_text like 'Sep 5' or 'Nov. 28' → 'YYYY-MM-DD'
    Year is taken from scraped_at (UTC) to pin to the current season run.
    """
    if not date_text:
        return None
    m = re.match(r"\s*([A-Za-z.]+)\s+(\d{1,2})\s*$", date_text)
    if not m:
        return None
    mon_s, day_s = m.groups()
    mon = MONTHS.get(mon_s, None)
    if not mon:
        return None
    try:
        year = datetime.fromisoformat(scraped_at.replace("Z","")).year if scraped_at else datetime.now(CENTRAL).year
    except Exception:
        year = datetime.now(CENTRAL).year
    return f"{year:04d}-{mon:02d}-{int(day_s):02d}"

def normalize(items: list, scraped_at: str):
    rows = []
    for it in items:
        # venue → H/A/N
        han = {"Home":"H","Away":"A","Neutral":"N"}.get(it.get("venue_type") or "", "N")

        # Date/time
        date_iso = parse_iso_date(it.get("date_text"), scraped_at)
        time_local = it.get("time_local")

        # Opponent + ranks
        opponent = it.get("opponent_name") or "TBA"
        opp_rank = it.get("opp_rank")
        nu_rank  = it.get("nu_rank")

        # city/arena split from location ("Lincoln, Neb. / Bob Devaney Sports Center")
        city, arena = None, None
        loc = it.get("location") or ""
        mloc = re.search(r"(.+?)\s*/\s*(.+)$", loc)
        if mloc:
            city  = mloc.group(1).strip()
            arena = re.sub(r"\s*presented by\b.*$", "", mloc.group(2).strip(), flags=re.I)
        else:
            # fallback if the slash isn't present
            city = loc.strip()

        # result
        res = it.get("result")
        result_str = None
        result_css = None
        status = "scheduled"
        if res:
            result_str = f"{res.get('outcome')} {res.get('sets')}"
            result_css = "win" if res.get("outcome") == "W" else "loss" if res.get("outcome") == "L" else None
            status = "final"
        elif (it.get("status") or "").lower() == "upcoming":
            status = "scheduled"
        else:
            status = "scheduled"

        # badges / title
        title = f"{('#'+str(opp_rank)+' ') if opp_rank else ''}{opponent}".strip()

        # logos & tv
        nu_logo  = it.get("nebraska_logo_url")
        opp_logo = it.get("opponent_logo_url")
        tv_logo  = it.get("tv_network_logo_url")   # single image URL (BTN/FS1/etc.)
        tv_list  = it.get("networks") or []        # optional text list if you later add detection

        # arena key
        arena_key = slug(arena or "unknown")

        rows.append({
            "date": date_iso,
            "time_local": time_local,
            "home_away": han,
            "nu_rank": nu_rank,
            "opponent": opponent,
            "opp_rank": opp_rank,
            "title": title,
            "arena": arena,
            "city": city,
            "arena_key": arena_key,
            "nu_logo": nu_logo,
            "opp_logo": opp_logo,
            "tv_logo": tv_logo,    # <-- use this in UI
            "tv": tv_list,         # <-- optional fallback list
            "status": status,
            "result": result_str,
            "result_css": result_css,
            "notes": None,
            "links": it.get("links") or [],
        })

    # sort by date then time
    def sk(x): return (x.get("date") or "9999-12-31", x.get("time_local") or "23:59")
    rows.sort(key=sk)
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
