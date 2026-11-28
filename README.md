# Kartify

A kart setup sheet for iPhone, built from the original Excel workbook.
It's a web app (PWA) hosted on GitHub Pages. Add it to your home screen and it runs
full screen and works offline at the track.

## What it does (Setup tab)

- **Events**: one per race meeting or test day (circuit, date, kart type, driver). The Events screen has
  a search box, Kart type / Circuit / Driver filters and a Recent list of the last 3 events opened.
- **Sessions**: each event starts with 7 blank, numbered session tabs (add more with **+**). Name a
  session (e.g. "Test 1") and only the next tab defaults to "Test 2" until you type over it.
- **Session info** at the top of each session: tyre (carries forward), a short comment, lap time and ref time. All show in the Grid.
- **Setup**: only the adjustable Front/Rear cells from the spreadsheet (greyed-out cells are left out).
  Camber is a number plus POS/NEG, toe a number plus IN/OUT, steering yoke SHORT (light) / LONG (heavy),
  stub pos 1–5, wheelbase S/M/L, 3rd IN/OUT (rear), front bar OUT/NYLON/STEEL, pinion 10–14, ride height LOW/STD/HIGH. Caster is entered as FWD/BACK then −4…+4 and the degrees are calculated.
- **Changes**: each session shows what changed from the previous one, and the *Grid* view shows every
  session side by side with changed cells highlighted.
- **Only enter what changes**: each session stores just the values you change. Blank boxes carry the
  value from the closest earlier session (left blank on screen). *Save setup* saves the full setup in force at
  that session, pulling every carried value through.
- **Tyre pressures**: tap *Target hot* in a session to open its pressure page. One tab per tyre run
  that session (+ Tyre to add more), four corners (Front L/R, Rear L/R): Rim T (green), Cold set (blue), Hot pressure (red, what they came in at) and
  a front/rear New target in (Corr uses New target, or the Setup's target when blank; the Setup target is shown too); Ref @ ref temp, Rise coeff, Corr delta and Corr cold out.
  PSI per °C, ref temperature and the ref rise (front 1.1, rear 1.15) are set once per event (••• → Pressure settings).
  *Copy cold set* / *Copy corr cold* sends them (with rim temps and New target) to any session (into that tyre if it's already there, else a new tyre), or keeps them in the
  clipboard where *Paste* puts those pressures and their rim temps into another tyre or session.
  Tap *Cold set ›* (or *Adjust pressures & rim temp*) for a pop-up: set a new rim temp for all tyres or each tyre
  with or without temp compensation (psi per °C), nudge front and/or rear by 0.1 psi, preview, apply.
  Adjusted boxes get an amber dot; *Revert adjustment* puts them back. Hot pressure boxes are red.
- **Fuel**: Fuel start / end (dipstick mm, shown in litres) sit above Save setup; tap either for the
  fuel page: used, used/min, fuel needed for the next session, weight delta and fuel for weight,
  uplift, and the dipstick mm to fill to, plus a mm ↔ litres converter. ••• → Fuel settings holds the
  tank table (dipstick mm = litres, shared by all events) and the per-event min weight, margin and
  fuel density.
- **Voice notes**: the 🎤 by Notes opens the box for the iPhone keyboard's dictation (mic key), which
  works in any box.
- **Save / load setups**: save a session's setup by name and load it into any session later.
  "New event from this setup" starts the next event.
- **Reference pop-ups**: tap Caster, Stub pos or Brake pedal (marked ⓘ) for the caster table, stub position diagram and brake position. Tap a value in the pop-up to select it.
- **Backup**: data lives on the phone; export and import a JSON backup from the Events screen.

## Publishing to GitHub Pages

The app is served from the `main` branch (**Settings → Pages → Deploy from a branch → main / (root)**)
at https://stuartking77.github.io/Kartify/. Every push to `main` republishes it.

## Installing on iPhone

Open the site in **Safari**, tap **Share → Add to Home Screen**.

## Developing

No build step. Serve the folder and open it:

```bash
python3 -m http.server 8000
```

When you change app files, bump `VERSION` in `sw.js` so installed copies update.
