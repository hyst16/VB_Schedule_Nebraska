Husker Volleyball — Auto Schedule (Display App)

This is a single-page web app that shows Nebraska Volleyball’s next game (hero view) and a compact two-column schedule optimized for TV screens, lobbies, and poster players. It’s designed to be hosted on GitHub Pages (or any static host) and controlled entirely by URL parameters—no back end required.

Live app:
https://hyst16.github.io/VB_Schedule_Nebraska/

Best preset for your office TV (what works best):
?ultra=1&scale=0.90&gap=2
Full URL: https://hyst16.github.io/VB_Schedule_Nebraska/?ultra=1&scale=0.90&gap=2

What’s in the box?
.
├─ index.html               # Page shell (loads CSS/JS, defines views)
├─ assets/
│  ├─ styles.css            # All layout + visual styling
│  └─ app.js                # Fetch data, render hero + two-column schedule
├─ data/
│  ├─ vb_schedule_normalized.json   # Normalized schedule the app reads
│  └─ arena_manifest.json           # (Optional) arena keys -> background images
└─ images/
   └─ arenas/               # Background photos keyed by arena_key (optional)


The page only reads from data/vb_schedule_normalized.json (and optionally data/arena_manifest.json). Update those files to change what’s displayed.

How it works (high level)

app.js loads JSON from /data/vb_schedule_normalized.json (and arena_manifest.json if present).

It finds the next upcoming game for the hero and renders all games into a fixed two-column schedule.

It applies your URL parameters (dense/ultra compactness, scaling, column width, gaps, etc.) so the layout looks perfect on different screens (laptop vs TV).

If an arena_key matches an image in images/arenas/, that image is used as the hero background.

Data format (expected fields)

A normalized schedule array under items, e.g.:

{
  "items": [
    {
      "date": "2025-08-22",
      "time_local": "8:00 PM CDT",
      "home_away": "H",
      "nu_rank": 1,
      "opponent": "Pittsburgh",
      "opp_rank": 3,
      "title": "Pittsburgh",
      "arena": "Pinnacle Bank Arena",
      "city": "Lincoln, Neb.",
      "arena_key": "pinnacle-bank-arena",
      "nu_logo": "https://...png",
      "opp_logo": "https://...svg",
      "tv_logo": "https://...png",
      "tv": ["FOX"],
      "status": "final",
      "result": "W 3-1",
      "result_css": "W",
      "notes": null,
      "links": [{ "title": "Watch", "href": "..." }]
    }
  ]
}


Notes

Keep opponent/team names clean (no #3 in the text). Rankings show as tiny white dots on the bottom-right of the corresponding logos.

tv_logo is preferred for the TV chip; if missing, the first string in tv is shown.

URL parameters

Stack these in any order, e.g. ?view=all&ultra=1&scale=0.9&gap=2.

View & rotation

view=next — lock to the hero “Next Game” view

view=all — lock to the compact schedule view

rot=15 — auto-rotate every N seconds between next/all (if view not locked)

Compactness (vertical space)

dense=1 — tighter rows (about 25–30% shorter)

ultra=1 — even tighter than dense (another ~15–20% vertical savings)
If both are present, ultra wins.

Sizing & fit

scale=0.95 — scales the whole schedule content (fine-tune to fit TV)

colw=700 — force each column width (px). More width = longer names fit

gap=5 — gap between the two columns (px). Default is gap=5

The app can also support a 16:9 “stage” mode (fit=16x9) if your index.html includes that wrapper. Your current preset doesn’t need it.

Debugging

debug=1 — shows a tiny HUD with the active settings (bottom-right)

Recommended presets

Office TV (your best):
?ultra=1&scale=0.90&gap=2
Full: https://hyst16.github.io/VB_Schedule_Nebraska/?ultra=1&scale=0.90&gap=2

Laptop quick check (wider columns):
?view=all&dense=1&colw=700&gap=8

Hero only (lobby splash):
?view=next

Troubleshooting

Opponent names get cut off:
Increase colw (e.g., colw=720) and/or decrease gap. If you still need room, reduce scale slightly (e.g., 0.96, 0.94).

Rows run off the bottom on the TV:
Turn on ultra=1 (or dense=1) and nudge scale down in tiny steps. Using gap=2 also helps.

No arena background in hero:
Ensure arena_key in the JSON matches a file name in images/arenas/ (e.g., pinnacle-bank-arena.jpg).

TV logo pill missing:
If tv_logo is absent or fails to load, the pill shows the first tv string instead (e.g., “FOX”).

Updating the data

This app is static and reads from files in /data. To update:

Replace data/vb_schedule_normalized.json with your latest normalized schedule (same schema).

(Optional) Update data/arena_manifest.json and images/arenas/ if you add new arena backdrops.

Commit & push to main—GitHub Pages updates automatically.

If you maintain a Python scraper/normalizer in another repo, have that pipeline write the updated files here.

Dev tips

Open locally with a simple static server (e.g., VS Code Live Server) or use GitHub Pages.

Most TV fit issues are solved by a combo of:
ultra=1, a small scale tweak, a sensible colw, and a small gap.

License

Do whatever you need for your display use case. If you improve the layout or add a new knob, PRs welcome!
