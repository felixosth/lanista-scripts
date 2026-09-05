# Lanista Item Browser

An interactive, Swedish-language browser for all 1 739 items in the uploaded list: search, filter, full item details, crafting chains and side-by-side comparison.

## What the data contains

- 1 739 entries totalling ~10 MB, with very different shapes:
  - 522 weapons, 770 armour pieces, 71 shields, 390 trinkets, 143 consumables, 130 enchantments, 103 materials
  - Crafting information is nested inside the entries: 1 056 craft nodes carry `coins`, `time`, `profession_requirements`, `material_requirements` (raw materials) **and** `item_requirements` (finished items consumed by the recipe, e.g. "Svart drakring" needs "Gul drakring"). Recipes can nest several levels deep, and the preparation step reads every requirement list it finds rather than assuming only materials.
- Every item has an image URL, a Swedish description, level/popularity requirements, stat bonuses and requirement texts; weapons add damage, crit, durability, weight and enchant slots.

## Data preparation (one-time build step)

The 10 MB file is too heavy to load in the page as one blob, so a script converts it into two layers stored in the project:

- A light index (~a few hundred KB) with only what the list view needs: id, name, image, category, type, level, key stats, craftable flag.
- Per-item detail files, loaded only when an item is opened.
- A derived crafting graph covering every requirement kind: raw materials, required finished items, profession + level, coin cost and craft time — plus the reverse links ("this material/item is used in these recipes"). Unknown or future requirement fields are carried through instead of dropped, so nothing in the file is lost.

## Screens

1. **Item list (start page)**
   - Search field (name, matching as you type) plus filters: category (vapen, rustning, sköld, smycke, förbrukningsvara, förtrollning, material), item slot/type, level range, two-handed/one-handed, soulbound, craftable only, merchant availability.
   - Sorting: name, level, damage, block, sell value, weight.
   - Card grid with image, name, slot and the two or three most relevant numbers; a compact table mode for scanning many rows.
   - Filters and search live in the address bar, so any view can be shared or bookmarked.
   - Virtualised list so 1 700+ cards stay smooth.

2. **Item detail**
   - Header with image, name, slot, level requirement and rarity/category tags.
   - Stat panel adapted to the item type (damage/crit/durability for weapons, block for shields, bonuses for armour and trinkets, effects for consumables and enchantments).
   - Requirements and bonuses rendered as readable lists (the source text contains simple markup, cleaned before display).
   - Crafting section: required materials *and* required finished items, each with image and quantity, plus profession and level, coins and time — with one-click navigation into any material, item or sub-recipe.
   - "Used in" section for materials, "Sold by" for merchant items, "Dropped from" when loot data exists.
   - Add-to-comparison button.

3. **Crafting view**
   - The recipe as an expandable tree, so a multi-step chain shows every base material.
   - Rolled-up totals down the whole chain: every raw material, every intermediate item that must be crafted or bought, total coins and total craft time.

4. **Comparison**
   - Pick 2–4 items of the same kind; a table shows their stats aligned with best value highlighted.

## Look and feel

Clean and refined rather than heavy fantasy: light, generous layout with a restrained parchment/ink palette, one warm accent for highlights, a display serif for names and a clear sans for data. Item images sit on soft neutral cards. Everything is defined as reusable design tokens so the tone stays consistent, with keyboard-friendly search and accessible contrast.

## Technical notes

- TanStack Start routes: `/` (list), `/item/$id`, `/item/$id/craft`, `/compare`.
- Index loaded via a route loader + TanStack Query; details fetched per item and cached.
- Filter/search/sort state in URL search params with validation.
- Swedish interface labels throughout; item text kept verbatim.
- Per-route page titles and descriptions for sharing/search.
- No backend needed — the data is static. If you later want saved builds or favourites across devices, that would need Lovable Cloud.
