# Nebraska Volleyball Schedule (static Pages + daily scrape)

This mirrors your football project, tailored for volleyball (more matches, tighter grid, rankings, arena helper JSON, and no buttons for display use).

## How it works
- **Scraper** hits the Huskers schedule page and parses server-rendered text. If that ever fails, it **falls back to the official PDF** linked on the page.
- **Normalizer** outputs `data/vb_schedule_normalized.json` for the UI.
- **Arena manifest** builds `data/arena_manifest.json` listing every arena background you’ll need (`docs/images/arenas/<slug>.jpg`) and includes the **opponent name next to the arena** (for your reference only; not in the filename).
- GitHub Actions copies JSON into `docs/data/` and commits changes.

## One-time setup
1. Create a repo named `VB_Schedule_Nebraska`.
2. Drop this folder tree in.
3. **Settings → Pages**: Deploy from **`/docs`** on `main`.
4. Run the workflow once: **Actions → Scrape & Build (Volleyball) → Run workflow**.

## Files you’ll likely touch
- `data/arena_overrides.json` – force a specific arena name → background slug.
- `docs/assets/styles.css` – tune column width, spacing, and pills (TV/team chips).
- `docs/assets/app.js` – rendering tweaks.

## Arena images
Add JPEGs to `docs/images/arenas/` using the slug from `data/arena_manifest.json`. Example:
```
docs/images/arenas/chi-health-center.jpg
```

## Notes / roadmap
- If you want to include **non-Nebraska matches** at home invitationals (e.g., *California vs Wright State*), we can extend the scraper to capture those blocks when they appear on Huskers.com.
- TV logos: you can keep text pills, or drop PNGs in `docs/images/networks/` and swap `mkChip()` to load an icon.
- Results already color as **green for wins** and **red for losses**.
