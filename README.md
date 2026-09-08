# Lanista Scripts

Tools for the browser game [Lanista](https://lanista.se): a userscript that enriches the game's own pages, and a standalone item browser hosted on GitHub Pages.

## Lanista Scripts (userscript)

`lanista_crafts.user.js` is a [Violentmonkey](https://violentmonkey.github.io/)/Tampermonkey userscript that runs on `https://lanista.se/game/*`. It adds:

- **Material and effect columns** on the craft table, so you can see what a recipe needs and what the crafted item does without opening it.
- **Battle summaries** - per-round and end-of-battle totals (damage, healing, misses) injected directly into battle pages, plus a stats popup for a fighter with a "Visa fler" (load more) button.

### Install

1. Install [Violentmonkey](https://violentmonkey.github.io/) (or Tampermonkey) in your browser.
2. Open `lanista_crafts.user.js` [directly from GitHub](https://github.com/felixosth/lanista-scripts/raw/refs/heads/main/lanista_crafts.user.js) and confirm the install prompt.
3. The script auto-updates from that same URL (see `@downloadURL`/`@updateURL` in the file header).

## Item Browser

An interactive browser for browsing and comparing all items in the game. Features real-time search, filtering, sorting, and side-by-side item comparison. Lives in `docs/` so it can be served straight from GitHub Pages.

### Features

- 🔍 **Real-time Search** - Search items by name as you type
- 🏷️ **Advanced Filtering** - Filter by type, level range, and other properties
- 📊 **Multiple Views** - Switch between grid and table views
- 📈 **Sorting** - Sort by name, level, sell value, and more
- ⚖️ **Item Comparison** - Compare 2-4 items side-by-side with stat highlighting
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile
- 🗂️ **Pagination** - Smooth navigation through 1,700+ items

### Quick Start

#### Local Development

1. Clone or download this repository
2. Open `docs/index.html` in your web browser
3. The browser will load `docs/lanista_items_detailed.json` automatically

No build process or server required - it's pure static HTML/CSS/JavaScript.

#### Deploy to GitHub Pages

1. Push this repository to GitHub
2. Go to repository **Settings** → **Pages**
3. Select **Deploy from a branch**
4. Choose `main` branch and `/docs` folder
5. Your site will be live at `https://yourusername.github.io/lanista-scripts/`

### Usage

#### Searching
Type in the search box to filter items by name - updates in real-time.

#### Filtering
- **Typ** - Filter by item category (weapons, armor, shields, trinkets, materials, etc.)
- **Min/Max nivå** - Restrict by level requirements
- **Sortering** - Change how items are ordered

#### Viewing Items
- **Rutnät** - Card grid view, great for browsing
- **Tabell** - Compact table view for comparing many items at once

#### Comparing Items
1. Click items to select up to 4 items
2. Click **Jämför** to see stats side-by-side
3. Best values are highlighted in each stat column
4. Click **Tillbaka** to return to browsing

### Browser Support

Works in all modern browsers:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

### Data

`docs/lanista_items_detailed.json` contains:
- 522 weapons
- 770 armor pieces
- 71 shields
- 390 trinkets
- 143 consumables
- 130 enchantments
- 103 materials

Each item includes stats, requirements, crafting info, and merchant availability. The JSON file (~8 MB) is loaded once on page load and cached by the browser.

### Performance

- **Grid view:** Handles ~1,700 items smoothly with pagination (24 per page)
- **Search:** Instant filtering on all items
- **Comparison:** Optimized rendering for 2-4 items

### Language

Interface is in Swedish. Item text is kept verbatim from the game data.

Built with vanilla HTML/CSS/JavaScript - no dependencies, no build step.

## Repository Layout

- `lanista_crafts.user.js` - the userscript (must stay at the repo root - `@downloadURL`/`@updateURL` point here)
- `docs/` - the item browser, deployed via GitHub Pages (`index.html`, its own copy of `lanista_items_detailed.json`, `.nojekyll`)
- `data/` - source item data (`lanista_items_detailed.json`), the generated `lanista_items.csv`, and `examples/` with captured battle-API JSON used as ground truth while building the battle-summary feature
- `scripts/lanista_items_to_csv.py` - converts `data/lanista_items_detailed.json` into `data/lanista_items.csv` (run with `python3 scripts/lanista_items_to_csv.py` from the repo root)
- `notes/` - design notes from building the item browser
