#!/usr/bin/env python3
import json
import csv
import re
import html
from collections import defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / 'data'


def strip_markup(value):
    """Remove HTML tags and entities."""
    if not value:
        return ''
    text = re.sub(r'<[^>]+>', '', value)
    return html.unescape(text).strip()


def kind(item):
    """Derive item kind from flags (priority order matters)."""
    if item.get('is_consumable'):
        return 'consumable'
    if item.get('is_weapon'):
        return 'weapon'
    if item.get('is_shield'):
        return 'shield'
    if item.get('is_trinket') and item.get('is_armor'):
        return 'jewelry'
    if item.get('is_trinket'):
        return 'trinket'
    if item.get('is_armor'):
        return 'armor'
    if item.get('is_material'):
        return 'material'
    if item.get('is_enchant'):
        return 'enchant'
    return 'unknown'


def format_number_range(min_val, max_val):
    """Format a min/max range, or just the value if they match."""
    if min_val == max_val:
        return str(int(max_val))
    return f'{int(min_val)}-{int(max_val)}'


def format_level(item):
    """Format item's own level requirement/max."""
    min_level = item.get('required_level')
    max_level = item.get('max_level')
    if min_level is None and max_level is None:
        return '-'
    if min_level is not None and max_level is not None:
        return format_number_range(min_level, max_level)
    return f'{int(min_level)}+' if min_level is not None else f'≤{int(max_level)}'


def format_weapon_stats(item):
    """Format weapon/shield stats."""
    parts = []
    if item.get('base_damage_max'):
        parts.append(f'Skada {format_number_range(item.get("base_damage_min", 0), item.get("base_damage_max", 0))}')
        if item.get('crit_damage'):
            parts.append(f'Krit {item.get("crit_damage")}')
    if item.get('absorption'):
        parts.append(f'Absorption {item.get("absorption")}')
    if item.get('max_crit_rate'):
        parts.append(f'Kritchans {format_number_range(item.get("min_crit_rate", 0), item.get("max_crit_rate", 0))}%')
    if item.get('durability'):
        parts.append(f'Hållbarhet {item.get("durability")}')
    if item.get('max_blocks_per_round'):
        parts.append(f'Block/runda {item.get("max_blocks_per_round")}')
    if item.get('is_two_handed'):
        parts.append('2H')
    elif item.get('can_dual_wield'):
        parts.append('Dual')
    if item.get('weight'):
        parts.append(f'Vikt {item.get("weight")}')
    if item.get('max_enchants'):
        parts.append(f'Ench {item.get("max_enchants")}')
    return ' · '.join(parts)


def format_armor_stats(item):
    """Format armor/trinket stats."""
    parts = []
    if item.get('base_block'):
        percent = f' ({item.get("percentage_block")}%)' if item.get('percentage_block') else ''
        parts.append(f'Block {item.get("base_block")}{percent}')
    if item.get('max_crit_rate'):
        parts.append(f'Kritchans {format_number_range(item.get("min_crit_rate", 0), item.get("max_crit_rate", 0))}%')
    if item.get('increased_hit_rate'):
        parts.append(f'Träffchans +{item.get("increased_hit_rate")}')
    if item.get('weight'):
        parts.append(f'Vikt {item.get("weight")}')
    if item.get('max_enchants'):
        parts.append(f'Ench {item.get("max_enchants")}')
    return ' · '.join(parts)


def format_consumable_stats(item):
    """Format consumable stats."""
    parts = []
    if item.get('restore_hp'):
        parts.append(f'Återställer {item.get("restore_hp")} HP')
    if item.get('damage'):
        parts.append(f'Skada {item.get("damage")}')
    if item.get('duration'):
        parts.append(f'Varaktighet {item.get("duration")}')
    if item.get('cooldown_display'):
        parts.append(f'Cooldown {item.get("cooldown_display")}')
    return ' · '.join(parts)


def format_stats(item):
    """Format item stats based on type."""
    if not item:
        return '-'
    if 'base_damage_min' in item:
        return format_weapon_stats(item) or '-'
    if 'base_block' in item:
        return format_armor_stats(item) or '-'
    if 'restore_hp' in item or 'damage' in item:
        return format_consumable_stats(item) or '-'
    return '-'


def format_effects(item):
    """Format item bonuses and effects."""
    if not item:
        return '-'
    parts = []
    if item.get('crit_rate'):
        parts.append(f'+{item.get("crit_rate")}% Perfekt träff')
    for bonus in (item.get('bonuses') or []):
        value = strip_markup(bonus.get('bonus_value_display', ''))
        name = strip_markup(bonus.get('bonusable_name', ''))
        name = re.sub(r'^vapenfärdigheten\s+', '', name, flags=re.IGNORECASE)
        if value and name:
            parts.append(f'{value} {name}')
    for modifier in (item.get('enchant_modifiers') or []):
        value = modifier.get('enchant_value_display', '')
        name = modifier.get('enchantable_name', '')
        if value and name:
            parts.append(f'{value} {name}')
    return ', '.join(parts) if parts else '-'


def format_requirements(item):
    """Format item requirements."""
    if not item or not item.get('requirements'):
        return '-'
    parts = []
    for req in item.get('requirements', []):
        text = req.get('requirement_text', '')
        if not text or re.search(r'\bgrad\b', text, re.IGNORECASE):
            continue
        matches = list(re.finditer(r'<strong>(.*?)<\/strong>', text))
        if len(matches) >= 2:
            value = strip_markup(matches[0].group(1))
            name = strip_markup(matches[1].group(1))
            if value and name:
                recommended = ' (rek)' if re.search(r'\bbör\b', text, re.IGNORECASE) else ''
                parts.append(f'{value} {name}{recommended}')
        else:
            parts.append(strip_markup(text))
    return ', '.join(parts) if parts else '-'


def load_and_index_items(filepath):
    """Load JSON and build canonical item index."""
    with open(filepath, 'r', encoding='utf-8') as f:
        items = json.load(f)
    canonical = {}
    for item in items:
        k = kind(item)
        iid = item.get('id')
        if iid is not None:
            canonical[(k, iid)] = item
    return items, canonical


def reconstruct_recipes(items):
    """Walk reverse index to reconstruct recipes."""
    recipes = defaultdict(lambda: {
        'professions': [],
        'coins': None,
        'time': None,
        'materials': [],
        'item_ingredients': []
    })

    for material in items:
        for req in (material.get('material_requirements') or []):
            itemable = req.get('itemable')
            if not itemable:
                continue

            recipe_kind = kind(itemable)
            recipe_id = itemable.get('id')
            if recipe_id is None:
                continue

            key = (recipe_kind, recipe_id)
            recipe = recipes[key]

            # Gather ingredient from containing material
            material_id = material.get('id')
            material_name = material.get('name', '')
            quantity = req.get('quantity', 1)
            recipe['materials'].append((material_id, material_name, quantity))

            # Capture recipe metadata from first populated itemable
            if not recipe['professions']:
                for prof_req in (itemable.get('profession_requirements') or []):
                    prof = prof_req.get('profession', {})
                    level = prof_req.get('level', 0)
                    recipe['professions'].append((prof.get('name', ''), level))

            if recipe['coins'] is None:
                recipe['coins'] = itemable.get('coins')
            if recipe['time'] is None:
                recipe['time'] = itemable.get('time')

            # Capture item requirements
            for item_req in (itemable.get('item_requirements') or []):
                item_id = item_req.get('itemable_id') or item_req.get('id')
                item_name = item_req.get('name', '')
                item_qty = item_req.get('quantity', 1)
                recipe['item_ingredients'].append((item_id, item_name, item_qty))

    # Dedupe by (id, name, quantity) to collapse alternate variants
    for rec in recipes.values():
        # Dedupe materials
        seen_mats = {}
        for mat_id, mat_name, qty in rec['materials']:
            key = (mat_id, mat_name, qty)
            seen_mats[key] = True
        rec['materials'] = sorted(seen_mats.keys(), key=lambda x: (x[0], x[1]))

        # Dedupe item ingredients
        seen_items = {}
        for item_id, item_name, qty in rec['item_ingredients']:
            key = (item_id, item_name, qty)
            seen_items[key] = True
        rec['item_ingredients'] = sorted(seen_items.keys(), key=lambda x: (x[0], x[1]))

    return recipes


def format_materials(recipe):
    """Format material ingredient list."""
    if not recipe or not recipe.get('materials'):
        return ''
    parts = []
    for mat_id, mat_name, qty in recipe['materials']:
        parts.append(f'{qty} x {mat_name}')
    return ', '.join(parts)


def format_item_ingredients(recipe):
    """Format full-item ingredient list."""
    if not recipe or not recipe.get('item_ingredients'):
        return ''
    parts = []
    for item_id, item_name, qty in recipe['item_ingredients']:
        parts.append(f'{qty} x {item_name}')
    return ', '.join(parts)


def format_professions(recipe):
    """Format profession requirements."""
    if not recipe or not recipe.get('professions'):
        return ''
    return ', '.join(f'{prof} {level}' for prof, level in recipe['professions'])


def build_csv_rows(items, canonical, recipes):
    """Build one row per item with all info merged."""
    rows = []
    for item in items:
        k = kind(item)
        iid = item.get('id')
        recipe = recipes.get((k, iid), {})

        row = {
            'Id': iid,
            'Typ': k,
            'Namn': item.get('name', ''),
            'Undertyp': (item.get('type_name', '') or '').capitalize(),
            'Nivå': format_level(item),
            'Säljvärde': item.get('sell_value', '') or '',
            'Stats': format_stats(item),
            'Krav': format_requirements(item),
            'Effekter': format_effects(item),
            'Yrke': format_professions(recipe),
            'Material': format_materials(recipe),
            'Föremål': format_item_ingredients(recipe),
            'Mynt': recipe.get('coins') if recipe.get('coins') is not None else '',
            'Tid': recipe.get('time') if recipe.get('time') is not None else '',
            'Handlare': ', '.join(m.get('name', '') for m in (item.get('merchants') or [])),
            'Loot': ', '.join(sorted(set(l.get('lootable', {}).get('name', '') for l in (item.get('loots') or []) if l.get('lootable')))),
            'Kategorier': ', '.join(c.get('name', '') for c in (item.get('categories') or [])),
            'Beskrivning': strip_markup(item.get('description', ''))
        }
        rows.append(row)

    return rows


def write_csv(rows, filepath):
    """Write rows to CSV with UTF-8 BOM and semicolon delimiter."""
    if not rows:
        return

    fieldnames = [
        'Id', 'Typ', 'Namn', 'Undertyp', 'Nivå', 'Säljvärde', 'Stats', 'Krav',
        'Effekter', 'Yrke', 'Material', 'Föremål', 'Mynt', 'Tid', 'Handlare',
        'Loot', 'Kategorier', 'Beskrivning'
    ]

    with open(filepath, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        writer.writerows(rows)


def main():
    items, canonical = load_and_index_items(DATA_DIR / 'lanista_items_detailed.json')
    recipes = reconstruct_recipes(items)
    rows = build_csv_rows(items, canonical, recipes)
    output_path = DATA_DIR / 'lanista_items.csv'
    write_csv(rows, output_path)
    print(f'Wrote {len(rows)} rows to {output_path}')


if __name__ == '__main__':
    main()
