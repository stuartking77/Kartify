# Kartify

A kart setup sheet for iPhone, built from the original Excel workbook.
It's a web app (PWA) hosted on GitHub Pages. Add it to your home screen and it runs
full screen and works offline at the track.

## What it does (Setup tab)

- **Events**: one per race meeting or test day (track, date, class).
- **Sessions**: each event starts with 7 blank, numbered session tabs (add more with **+**). Name a
  session (e.g. "Test 1") and only the next tab defaults to "Test 2" until you type over it.
- **Lap time and ref time** at the top of each session.
- **Setup**: only the adjustable Front/Rear cells from the spreadsheet (greyed-out cells are left out).
  Camber is a number plus POS/NEG, toe a number plus IN/OUT, steering yoke LONG (= hard) / SHORT (= soft),
  stub pos 1–5, wheelbase S/M/L, 3rd IN/OUT (rear), front bar OUT/NYLON/STEEL, pinion 10–14. Caster is entered as top (−4…+4) and bottom (FWD/BACK) positions and the degrees are calculated.
- **Changes record**: each session shows what changed from the previous one. The *Changes* view
  lists the whole event in order, and the *Grid* view shows every session side by side with
  changed cells highlighted.
- **Automatic carry-over**: opening the session after one with a setup fills in that setup, so you
  only change what's different. It doesn't count as used until you edit something in it.
- **Save / load setups**: save a session's setup by name and load it into any session later.
  "Copy setup from …" copies the previous session; "New event from this setup" starts the next event.
- **Reference pop-ups**: tap Caster, Stub pos or Brake pedal (marked ⓘ) for the caster table, stub position diagram and brake position. Tap a value in the pop-up to select it.
- **Backup**: data lives on the phone; export and import a JSON backup from the Events screen.

## Publishing to GitHub Pages

Currently served from the `claude/tender-cannon-a36wih` branch (**Settings → Pages → Deploy from a branch**),
at https://stuartking77.github.io/Kartify/.

If you later move to a `main` branch, set **Source: GitHub Actions** and the workflow in
`.github/workflows/pages.yml` deploys on every push to `main`.

## Installing on iPhone

Open the site in **Safari**, tap **Share → Add to Home Screen**.

## Developing

No build step. Serve the folder and open it:

```bash
python3 -m http.server 8000
```

When you change app files, bump `VERSION` in `sw.js` so installed copies update.
