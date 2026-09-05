# Lanista Item Browser

An interactive browser for browsing and comparing items in the Lanista game. Features real-time search, filtering, sorting, and side-by-side item comparison.

## Features

- 🔍 **Real-time Search** - Search items by name as you type
- 🏷️ **Advanced Filtering** - Filter by type, level range, and other properties
- 📊 **Multiple Views** - Switch between grid and table views
- 📈 **Sorting** - Sort by name, level, sell value, and more
- ⚖️ **Item Comparison** - Compare 2-4 items side-by-side with stat highlighting
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile
- 🗂️ **Pagination** - Smooth navigation through 1,700+ items

## Quick Start

### Local Development

1. Clone or download this repository
2. Open `index.html` in your web browser
3. The browser will load `lanista_items_detailed.json` automatically

No build process or server required - it's pure static HTML/CSS/JavaScript.

### Deploy to GitHub Pages

1. Push this repository to GitHub
2. Go to repository **Settings** → **Pages**
3. Select **Deploy from a branch**
4. Choose `main` branch and `/root` folder
5. Your site will be live at `https://yourusername.github.io/lanista-scripts/`

## Files

- `index.html` - Main application (all CSS and JavaScript embedded)
- `lanista_items_detailed.json` - Item data (1,739 items with full stats and crafting info)
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
