#!/usr/bin/env python3
import json, re
from pathlib import Path
from datetime import datetime
from dateutil import tz

DATA = Path("data")
RAW = DATA/"vb_raw.json"
OUT = DATA/"vb_schedule_normalized.json"

CENTRAL = tz.gettz("America/Chicago")

ARENA_OVERRIDES = json.loads((DATA/"arena_overrides.json").read_text("utf-8")) if (DATA/"arena_overrides.json").exists() else {}

MONTHS = {m:i for i,m in enumerate(["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], start=1)}

slug = lambda s: re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", (s or "").lower())).strip("-")

def normalize_items(items):
    norm = []
    season_year = datetime.now(CENTRAL).year
    for it in items:
        opponent = it.get("opponent") or "TBA"
        loc = it.get("location") or ""
        date_s = it.get("date")
        if not date_s:
            hint = it.get("date_hint") or ""
            m = re.search(r"([A-Za-z]{3}) (\d{1,2})", hint)
            if m:
                mon, day = m.groups(); date_s = f"{season_year}-{MONTHS[mon]:02d}-{int(day):02d}"
        status = "scheduled"
        result = it.get("result")
        if result:
            status = "final"
        # Determine H/A/N
        han = "N"
        if it.get("home_away"):
            han = it["home_away"]
        elif "Lincoln" in loc or "Bob Devaney" in loc:
            han = "H"
        elif "/" in loc and "Lincoln" not in loc:
            han = "A"

        # Arena + city parsing
        arena = city = None
        mloc = re.search(r"(.+?)\s*/\s*(.+)$", loc)
        if mloc:
            city = mloc.group(1).strip()
            arena = mloc.group(2).strip()

        arena_key = slug(ARENA_OVERRIDES.get(opponent, {}).get("arena") or arena or "unknown")

        nu_rank = it.get("nu_rank")
        opp_rank = it.get("opp_rank")

        res_str = None
        css = None
        if result:
            res_str = f"{result['outcome']} {result['sets']}"
            css = "win" if result["outcome"] == "W" else "loss"

        title = opponent
        if opp_rank:
            title = f"#{opp_rank} {title}"

        norm.append({
            "date": date_s,
            "time_local": it.get("time_local"),
            "home_away": han,
            "nu_rank": nu_rank,
            "opponent": opponent,
            "opp_rank": opp_rank,
            "title": title,
            "arena": arena,
            "city": city,
            "arena_key": arena_key,
            "tv": [],
            "status": status,
            "result": res_str,
            "result_css": css,
            "notes": None,
        })
    def sort_key(x):
        d = x.get("date") or "9999-12-31"
        t = x.get("time_local") or "23:59 PM"
        return (d, t)
    norm.sort(key=sort_key)
    return norm

def main():
    data = json.loads(RAW.read_text("utf-8")) if RAW.exists() else {"items": []}
    items = data.get("items", [])
    normalized = normalize_items(items)
    OUT.write_text(json.dumps({"items": normalized}, indent=2), encoding="utf-8")
    print(f"wrote {OUT}")

if __name__ == "__main__":
    main()
