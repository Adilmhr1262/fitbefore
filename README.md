# FitBefore — Will it fit?

A personal measurement notebook that checks whether furniture fits a space
before you buy it. Static site, no backend, no account. All data saves in the
browser's localStorage and starts completely empty.

## Tabs

- **Spaces** — named spaces (desk alcove, shelf opening) with width, depth, and
  optional height. Add, edit, delete, search.
- **Furniture** — furniture candidates with width, depth, optional height,
  product link, and notes. Add, edit, delete, search.
- **Fit Check** — pick a space and an item. Shows clearance or excess per
  dimension, a Fits / Fits — tight / Does not fit verdict, and a scaled
  top-down SVG diagram. Rotate swaps the furniture width and depth.

## Details

- Units: centimetres or inches, converted automatically (1 in = 2.54 cm).
  Dimensions are stored in centimetres.
- Clearance under 5 cm (about 2 in) is flagged tight, in amber.
- Height is compared only when both sides record one.
- Export/import: validated JSON backup (`{app: "fitbefore", version: 1, ...}`).
  Invalid files are rejected whole and saved data is unchanged. Import asks
  for confirmation because it replaces everything.
- Print: a print stylesheet produces a clean fit report without toasts or
  navigation.
- Privacy: no account, no backend, no analytics. The app makes no network
  requests of its own (system font stack, no web fonts), so measurements never
  leave the device unless you export a backup file.
- Accessibility: labelled controls, visible focus, keyboard-trapped dialogs
  with inert background, aria-live fit results, 44px minimum touch targets,
  reduced-motion respected.
- Offline: a service worker caches the app shell with scope-relative URLs, so
  it works under a subpath such as `/fitbefore/`.

## Limits (stated plainly)

FitBefore checks dimensions only. A fit here does not mean the item will pass
through doors, hallways, or stairwells, or that it can be assembled inside
the space. Check the delivery route separately.

## Run the tests

```sh
python3 -m http.server 8141 --directory .
node tests/fitbefore-test.js
```

The suite runs in headless Firefox via Playwright and checks empty start,
space/item CRUD, unit conversion, fit maths (including rotation, tight, and
excess cases), the diagram, export/import validation, dialogs, persistence,
print rules, and the 375px layout.
