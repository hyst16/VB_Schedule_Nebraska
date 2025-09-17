#!/usr/bin/env python3
import json, re, sys
from pathlib import Path
import requests
from bs4 import BeautifulSoup as BS
from datetime import datetime
from dateutil import tz

# If the site layout changes, we also have a PDF fallback.
SCHEDULE_URL = "https://huskers.com/sports/volleyball/schedule?type=home"
DATA_DIR = Path("data"); DATA_DIR.mkdir(parents=True, exist_ok=True)
RAW_OUT = DATA_DIR / "vb_raw.json"

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; VB_Schedule_Nebraska/1.0)"}

def slugify(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return re.sub(r"-+", "-", s).strip("-")

def extract_pdf_url(html: str) -> str | None:
    soup = BS(html, "lxml")
    for a in soup.find_all("a"):
        t = (a.get_text(" ") or "").strip().lower()
        if "schedule" in t and "pdf" in t:
            href = a.get("href")
            if href and href.endswith(".pdf"):
                return href
    return None

def fetch_html() -> str:
    r = requests.get(SCHEDULE_URL, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.text

# The page is server-rendered with content in the HTML (progressive enhancement).
# We parse the text blocks between headings; this is intentionally loose but robust
# to minor markup shifts.

def parse_server_rendered_text(html: str):
    text = BS(html, "lxml").get_text("\n")
    # Normalize whitespace
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines()]
    # Keep only relevant slice starting from "Schedule Events"
    try:
        i = lines.index("Schedule Events")
        lines = lines[i:]
    except ValueError:
        pass

    blocks = []
    buf = []
    for ln in lines:
        if re.match(r"^(Home|Away|Neutral)$", ln) and buf:
            blocks.append(buf)
            buf = [ln]
        else:
            buf.append(ln)
    if buf:
        blocks.append(buf)

    items = []
    for b in blocks:
        chunk = " ".join(b)
        # Examples found on page text
        #  Home Friday Sep 5 W Win 3-0 #1 vs. Wright State Lincoln, Neb. / Bob Devaney Sports Center
        #  Home Saturday Sep 20 8:00 PM CDT vs. Arizona Lincoln, Neb. / Bob Devaney Sports Center
        m = re.search(r"(Home|Away|Neutral).*?(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) ([A-Z][a-z]{2}) (\d{1,2})(?: (\d{1,2}:\d{2} [AP]M [A-Z]{2,3}))? .*?vs\. (.*?) (.+? / .+?)($| Watch| Listen| Live Stats| Sold Out| Box Score| Recap)", chunk)
        if not m:
            continue
        site, dow, mon, day, time_s, opponent, location, _ = m.groups()
        # Ranking prefixes like "#1" may precede vs. or opponent; capture them too
        nu_rank = None
        opp_rank = None
        mnu = re.search(r"(?:^| )#(\d{1,2})(?: |$)", chunk)
        if mnu:
            nu_rank = int(mnu.group(1))
        mopp = re.search(r"vs\. #(\d{1,2}) ", chunk)
        if mopp:
            opp_rank = int(mopp.group(1))
            opponent = re.sub(r"^#\d+ ", "", opponent).strip()

        # Result (if present)
        res = None
        mres = re.search(r" (W|L) Win? ?(\d-\d|\d–\d|\d\s*\u2013\s*\d)", chunk)
        if mres:
            res = {"outcome": "W" if mres.group(1)=="W" else "L", "sets": mres.group(2).replace("\u2013","-")}

        # Date (no year shown on page section – infer by season)
        now = datetime.now(tz=tz.gettz("America/Chicago"))
        month_map = {"Jan":1,"Feb":2,"Mar":3,"Apr":4,"May":5,"Jun":6,"Jul":7,"Aug":8,"Sep":9,"Oct":10,"Nov":11,"Dec":12}
        month = month_map[mon]
        year = now.year
        if month < 6:  # volleyball season spans fall; if early year months appear, they are next calendar year
            year = now.year
        date_iso = f"{year:04d}-{month:02d}-{int(day):02d}"

        items.append({
            "home_away": {"Home":"H","Away":"A","Neutral":"N"}[site],
            "date": date_iso,
            "time_local": time_s or None,
            "opponent": opponent,
            "location": location,
            "nu_rank": nu_rank,
            "opp_rank": opp_rank,
            "result": res,
        })
    return items

def try_pdf_fallback(html: str):
    pdf_url = extract_pdf_url(html)
    if not pdf_url:
        return []
    try:
        import io, pdfplumber
        bin_ = requests.get(pdf_url, headers=HEADERS, timeout=30).content
        with pdfplumber.open(io.BytesIO(bin_)) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        # Very rough parse – Normalize step will clean further.
        items = []
        for line in text.splitlines():
            line = line.strip()
            # Match lines like: Fri., Nov. 28 Penn State * Lincoln, Neb. (Bob Devaney Sports Center) BTN 5:30 p.m.
            m = re.search(r"^(Sun\.|Mon\.|Tue\.|Wed\.|Thu\.|Fri\.|Sat\.)\s*,?\s*([A-Za-z]{3,})\.?\s+(\d{1,2})\s+(.*)$", line)
            if not m:
                continue
            _, mon, day, rest = m.groups()
            # crude opponent extraction up to first city/state
            loc_idx = rest.find("(")
            opponent = rest[:loc_idx].strip().rstrip("*").strip() if loc_idx>0 else rest
            items.append({
                "date_hint": f"{mon} {day}",
                "opponent": opponent,
                "raw": rest,
            })
        return items
    except Exception:
        return []

def main():
    html = fetch_html()
    items = parse_server_rendered_text(html)
    if not items:
        items = try_pdf_fallback(html)
    out = {
        "source": SCHEDULE_URL,
        "scraped_at": datetime.utcnow().isoformat() + "Z",
        "items": items,
    }
    RAW_OUT.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"wrote {RAW_OUT}")

if __name__ == "__main__":
    main()
