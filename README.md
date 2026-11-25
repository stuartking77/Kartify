# Kartify

A kart setup sheet for iPhone, built from the original Excel workbook.
It's a web app (PWA) hosted on GitHub Pages. Add it to your home screen and it runs
full screen and works offline at the track.

## What it does (Setup tab)

- **Events**: one per race meeting or test day (track, date, class).
- **Sessions**: each event starts with 7 blank, numbered session tabs (add more with **+**). Name a
  session (e.g. "Test 1") and only the next tab defaults to "Test 2" until you type over it.
- **Session info** at the top of each session: tyre (carries forward), a short comment, lap time and ref time. All show in the Grid.
- **Setup**: only the adjustable Front/Rear cells from the spreadsheet (greyed-out cells are left out).
  Camber is a number plus POS/NEG, toe a number plus IN/OUT, steering yoke LONG (= hard) / SHORT (= soft),
  stub pos 1–5, wheelbase S/M/L, 3rd IN/OUT (rear), front bar OUT/NYLON/STEEL, pinion 10–14, ride height LOW/STD/HIGH. Caster is entered as top (−4…+4) and bottom (FWD/BACK) positions and the degrees are calculated.
- **Changes**: each session shows what changed from the previous one, and the *Grid* view shows every
  session side by side with changed cells highlighted.
- **Only enter what changes**: each session stores just the values you change. Blank boxes carry the
  value from the closest earlier session (left blank on screen). *Save setup* saves the full setup in force at
  that session, pulling every carried value through.
- **Tyre pressures**: tap *Target hot pressure* in a session to open its pressure page. One tab per tyre run
  that session (+ Tyre to add more), four corners (Front L/R, Rear L/R): Rim T (green), Cold set (blue), Hot pressure (red, what they came in at) and
  a front/rear New target in (Corr uses New target, or the Setup's target when blank; the Setup target is shown too); Ref @ ref temp, Rise coeff, Corr delta and Corr cold out.
  PSI per °C, ref temperature and the generic ref rise are set once per event (••• → Pressure settings).
  *Copy cold set* / *Copy corr cold* sends them (with rim temps and New target) to any session (into that tyre if it's already there, else a new tyre), or keeps them in the
  clipboard where *Paste* puts those pressures and their rim temps into another tyre or session.
  Tap *Cold set ›* (or *Adjust pressures & rim temp*) for a pop-up: set a new rim temp for all tyres or each tyre
  with or without temp compensation (psi per °C), nudge front and/or rear by 0.1 psi, preview, apply.
  Adjusted boxes get an amber dot; *Revert adjustment* puts them back. Hot pressure boxes are red.
- **Fuel**: Fuel start / end (dipstick mm, shown in litres) sit above Save setup; tap either for the
  fuel page: used, used/min, fuel needed for the next session, weight delta and fuel for weight,
  uplift, and the dipstick mm to fill to, plus a mm ↔ litres converter. The tank table (dipstick
  mm = litres) is edited at the bottom of the fuel page and shared by all events; min weight,
  margin and fuel density are per event in ••• → Fuel settings.
- **Voice notes**: *Dictate* on a session's Notes types what you say, where the browser supports speech
  recognition; the iPhone keyboard's mic key works in any box anyway.
- **Save / load setups**: save a session's setup by name and load it into any session later.
  "New event from this setup" starts the next event.
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
