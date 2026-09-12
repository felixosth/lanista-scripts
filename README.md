# Lanista Item Browser

An interactive browser for browsing and comparing items in the Lanista game. Features real-time search, filtering, sorting, and side-by-side item comparison.

## Features

- 🔍 **Real-time Search** - Search items by name as you type
- 🏷️ **Advanced Filtering** - Filter by type, level range, and other properties
- 📊 **Multiple Views** - Switch between grid and table views
- 📈 **Sorting** - Sort by name, level, sell value, and more
- ⚖️ **Item Comparison** - Compare 2-4 items side-by-side with stat highlighting
- 🧮 **Build Simulator** - Pick a race, level and life stage, enter your character's actual stat points, equip gear, and see the resulting totals
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile
- 🗂️ **Pagination** - Smooth navigation through 1,700+ items

## Quick Start

### Local Development

1. Clone or download this repository
2. Start a local server (opening `index.html` directly via `file://` doesn't work - browsers block the `fetch()` call that loads `lanista_items_detailed.json`):
   ```powershell
   .\serve-docs.ps1
   ```
   This serves `docs/` at `http://localhost:8080/` and opens it in your browser. Use `-Port` to pick a different port or `-NoBrowser` to skip auto-opening.

No build process required otherwise - it's pure static HTML/CSS/JavaScript.

### Deploy to GitHub Pages

1. Push this repository to GitHub
2. Go to repository **Settings** → **Pages**
3. Select **Deploy from a branch**
4. Choose `main` branch and `/docs` folder
5. Your site will be live at `https://yourusername.github.io/lanista-scripts/`

## Files

- `docs/index.html` - Main application (all CSS and JavaScript embedded)
- `docs/lanista_items_detailed.json` - Item data (1,739 items with full stats and crafting info)
- `docs/lanista_races.json` - Race data for the build simulator (stat/weapon-skill modifiers, abilities, aging), transcribed from wiki.lanista.se
- `serve-docs.ps1` - Local dev server for the `docs/` folder above
- `README.md` - This file

## Usage

### Searching
Type in the search box to filter items by name - updates in real-time.

### Filtering
- **Typ** - Filter by item category (weapons, armor, shields, trinkets, materials, etc.)
- **Min/Max nivå** - Restrict by level requirements
- **Sortering** - Change how items are ordered

### Viewing Items
- **Rutnät** - Card grid view, great for browsing
- **Tabell** - Compact table view for comparing many items at once

### Comparing Items
1. Click items to select up to 4 items
2. Click **Jämför** to see stats side-by-side
3. Best values are highlighted in each stat column
4. Click **Tillbaka** to return to browsing

### Build Simulator
Click **Bygg-simulator** in the header to open it.

1. Pick a race, level and life stage (Ung/Vuxen/Medelålders/Gammal/Uråldrig - options vary per race).
2. Enter the stat points and weapon skills you've actually put on your character - the game doesn't publish a level → points formula, so this replicates your real character instead of calculating it.
3. Click a slot to equip an item in it; a two-handed weapon blocks the shield slot automatically.
4. The results panel shows each stat as base → race % → age % → equipment bonus → total, race/age modifiers coming from `lanista_races.json` and equipment bonuses from each item's own data.
5. Slots flag unmet item requirements (level, stat, weapon skill, race) - soft "bör ha" recommendations are shown as info, hard "Kräver" requirements as warnings.
6. **Spara bygge** saves the current build to your browser's local storage so you can load or delete it later; builds aren't shared between devices or browsers.

Bashälsa (HP) is capped at 5.5× your effective Styrka - the one exact formula the game's own wiki documents. Hit chance, dodge, critical-hit chance, damage-potential taper and the "total fysik/smidighet" bonus system are intentionally undocumented by the game itself, so they're shown as reference text rather than a calculated number.

## Browser Support

Works in all modern browsers:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Data

The `lanista_items_detailed.json` file contains:
- 522 weapons
- 770 armor pieces
- 71 shields
- 390 trinkets
- 143 consumables
- 130 enchantments
- 103 materials

Each item includes stats, requirements, crafting info, and merchant availability.

## Performance

- **Grid view:** Handles ~1,700 items smoothly with pagination (24 per page)
- **Search:** Instant filtering on all items
- **Comparison:** Optimized rendering for 2-4 items

The JSON file (~10 MB) is loaded once on page load and cached by the browser.

## Language

Interface is in Swedish. Item text is kept verbatim from the game data.

Built with vanilla HTML/CSS/JavaScript - no dependencies, no build step.
