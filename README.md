# 🎄 Adams and Tannaz julkalender

A small static website with 24 doors, one photo for each day from 1 to 24 December. The site's text is in Swedish. A door can't be opened before its date. Each door opens with a little animation and stays open when you come back.

## Add your photos

Replace `img/01.jpg` … `img/24.jpg` with your own photos and keep the same file names. Landscape and portrait photos both work. Photos straight from a phone are fine, but resizing them to about 2000 px on the longest side keeps the calendar quick, especially on phones.

Each photo has a short description that's shown under it when its door is opened. Write them in the `days` list in [js/config.js](js/config.js), replacing the placeholder text, or use `""` to show no text. To use different file names or formats (`.png`, `.webp`, …), change `image` in the same list:

```js
{ image: "img/05.jpg", description: "Skridskor på sjön" },
```

## Settings (`js/config.js`)

| Setting       | What it does |
| ------------- | ------------ |
| `title`       | Heading at the top of the page. |
| `year`        | Which December the calendar is for. Door N unlocks at midnight on N December. |
| `previewDate` | Test the calendar as if it were another day, e.g. `"2026-12-24"` or `"2026-11-30T23:59"`. A red banner shows while it's on. Set it back to `null` before you share the calendar. |
| `days`        | The photo and description for each door, in order from 1 to 24. |

## Run it

**Easiest:** double-click `index.html`. It opens in your browser without a server.

**To share it on your home network** (for example, so family can open it on their phones), run one of these from this folder:

```powershell
npx serve .              # Node.js; prints the address to open
py -m http.server 8000   # Python; then open http://<this computer's IP>:8000
```

## Good to know

- Doors unlock at midnight in the viewer's time zone, based on their device clock.
- Opened doors are remembered per browser in `localStorage`. To close them again, clear the site data.
- The lock only works inside the calendar. Anyone who opens the `img` folder or types a photo's address can see it early.
