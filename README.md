# Kartify

A kart setup sheet for iPhone, built from the original Excel workbook.
It's a web app (PWA) hosted on GitHub Pages. Add it to your home screen and it runs
full screen and works offline at the track.

## What it does (Setup tab)

- **Events**: one per race meeting or test day (track, date, class).
- **Sessions**: Test 1, Test 2, Test 3, Qualifying, Heat 1, Heat 2, Final.
- **Setup**: Front/Rear values for hot pressure, camber, caster, toe, steering yoke, stub pos,
  width, wheelbase, seat height, weight distribution, ride height, jet, pinion, sprocket, 3rd,
  front bar, brake pedal, brake cylinder, 3 × other, plus lap time, ref time, notes and a wets flag.
- **Changes record**: each session shows what changed from the previous one. The *Changes* view
  lists the whole event in order, and the *Grid* view shows every session side by side
  (like the spreadsheet) with changed cells highlighted.
- **Copy from previous session**, and **New event from this setup**, so you only enter what changed.
- **Reference**: caster calculator (16.5° + 3° if BACK + offset), stub position diagram, sign conventions.
- **Backup**: data lives on the phone; export and import a JSON backup from the Events screen.

## Publishing to GitHub Pages

1. Merge to `main`.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` deploys on every push to `main`.
   The site appears at `https://<user>.github.io/<repo>/`.

## Installing on iPhone

Open the site in **Safari**, tap **Share → Add to Home Screen**.

## Developing

No build step. Serve the folder and open it:

```bash
python3 -m http.server 8000
```

When you change app files, bump `VERSION` in `sw.js` so installed copies update.
