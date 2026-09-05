// ==UserScript==
// @name        Lanista scripts
// @namespace   Violentmonkey Scripts
// @icon        data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAC5UlEQVQ4T6WTS0gbYRSFz6+jySAaEQtqFiJEKaLQLEpwo5L6AmEkEnxU69KpRsTQwtStGylpjRvdWSxoJTF2obhQLAhiEIoU20TbWhVrlYQ2JkYZdZhxyvwS6QO66VnNhXO/ew78Q/CfIjdfv6i7u5snhPhGRkYi2tzb2/uAYZjloaGhg4QnIQro6up6mJmZOT04OEgXeJ7/pijKgSzLHePj49sOh2OJZVkjIaTT5XKtaEBZlpdHR0cPKKCnp+eQZdmvADpcLte20+l85Ha7n1/fAP6ceZ5fkmU5T1EUngL6+voeDw8PP0sYnE6n0+12u/8x3wApQBCEJ4IgBJKTiTUaPbkjSZI5Ho8nhcNhPcMwik6nk0tLS3clSfrM6nRvPdPT2TzPCxQQiUTqRFF8LUkSOzY2hlAohJKSEuTl5WJhYZFezM/PR1lZGXw+HwoKCtDU1ISsrKxVVVU7SfT4+PurqalsQgiMRiNmZ2eRmpqK5uZm+P1+XF1doaioEBsb73F0dISqqntgmBQoioyamtpPZH9/X1xcXGQ1c05ODurr6xEOhxCLneDi4gIamGVZGAwZyMgwUOje3h7MZjNsNluUbG5uigDYQOADtre/wGQyYWdnB7Is0/gJaaDCQhO2tj7SShaLRUt3DYjH42xaWho1SpIEvV6Ps7MzXF5e0gpapfT0dJyfn9M0mrQDDMNcAzweD1tXVwdVVelySkoKwuEwgsEgNRcXF9N6Gkw7oKWZm5uD3W6PkmAwKHq9XrayshLr6+sUUltbC6/XC1HU2oEmaGlpwcrKCk1WXl6O+fl5tLa2RkkgEHjp8/k6KioqKOD09BQcx2FycpIuJ9TY2EgBiqLAarXSBO3t7W+IqqpEEIT7HMc51tbWLNoDamho+Atgs9mwurpKu1dXVx/OzMy8aGtre/rb39jf339Lp9Pd5Tju9sTERG5SUpJBVVUGgGi323/4/f7dWCz2bmBgIEAIUbWdn0Q7ZfawRhyhAAAAAElFTkSuQmCC
// @version     1.9.3
//
// @match       https://lanista.se/game/*
// @grant       none
//
// @downloadURL https://github.com/felixosth/lanista-scripts/raw/refs/heads/main/lanista_crafts.user.js
// @updateURL   https://github.com/felixosth/lanista-scripts/raw/refs/heads/main/lanista_crafts.user.js
//
// @author      -
// @description Adds material and effect columns to the craft table.
// ==/UserScript==

(function () {
	'use strict';

	const itemCache = new Map();
	// Different item categories don't follow one shared pluralization convention on the
	// server (e.g. weapons/shields live at the singular /api/items/weapon/{id}, while
	// consumables live at the plural /api/items/consumables/{id}) - and other professions
	// (armor, trinkets, materials) may follow either. Rather than hardcoding guesses that
	// silently break the effects column for a profession we haven't seen yet, try each
	// candidate segment in turn and remember whichever one actually works per category.
	const resolvedEndpoints = new Map();
	let craftsPromise;
	let currentAvatarPromise;
	let scanTimer;

	// Jewelry-type slots (neck, finger, back, amulet, bracelet, ...) are flagged both is_armor
	// and is_trinket at once, and it isn't knowable up front which of those two words (if
	// either) the server actually uses for its endpoint segment - so keep them as a distinct
	// signature rather than collapsing to just one of the two flags, and let endpointCandidates
	// try both.
	function itemCategory(craft) {
		if (craft.is_consumable) return 'consumable';
		if (craft.is_weapon_or_shield) return 'weapon';
		if (craft.is_trinket && craft.is_armor) return 'trinket+armor';
		if (craft.is_trinket) return 'trinket';
		if (craft.is_armor) return 'armor';
		return 'material';
	}

	function endpointCandidates(category) {
		if (resolvedEndpoints.has(category)) return [resolvedEndpoints.get(category)];
		if (category === 'consumable') return ['consumables', 'consumable'];
		if (category === 'trinket+armor') return ['trinket', 'trinkets', 'armor', 'armors'];
		return [category, `${category}s`];
	}

	function formatMaterials(craft) {
		// item_requirements is the same idea as material_requirements (a quantity to hand
		// over) but for recipes that consume a full crafted item instead of a raw material -
		// the requirement object spreads that item's own fields (including "name") directly
		// onto it rather than nesting them under a "material" key.
		const materials = (craft.material_requirements || [])
			.map((requirement) => `${requirement.quantity} x ${requirement.material.name}`);
		const items = (craft.item_requirements || [])
			.map((requirement) => `${requirement.quantity} x ${requirement.name}`);
		return [...materials, ...items].join(', ') || '-';
	}

	function stripMarkup(value) {
		const element = document.createElement('div');
		element.innerHTML = value || '';
		return element.textContent.trim();
	}

	function formatEffects(item) {
		if (!item) return '-';
		const parts = [];
		// crit_rate is a flat "chans till en perfekt träff" bonus baked directly onto the item
		// record itself, not into bonuses[] - and it's a different stat from the min/max_crit_rate
		// range the Stats column already reads for Kritchans - so without this an item's perfect-hit
		// chance modifier (shown in the site's own "Modifikationer" panel) would silently vanish here.
		if (item.crit_rate) parts.push(`+${item.crit_rate}% Perfekt träff`);
		parts.push(...(item.bonuses || []).map((bonus) => {
			const value = stripMarkup(bonus.bonus_value_display);
			const name = stripMarkup(bonus.bonusable_name).replace(/^vapenfärdigheten\s+/i, '');
			return [value, name].filter(Boolean).join(' ');
		}));
		return parts.filter(Boolean).join(', ') || '-';
	}

	// craft.type_name is the recipe's own subtype (e.g. "sword", "shield", "chain") and comes
	// straight from /api/crafts, so this needs no extra item fetch and works for any profession
	// that happens to set it - recipes without a meaningful subtype (e.g. alchemy) simply omit it.
	function formatType(craft) {
		if (!craft.type_name) return '-';
		return craft.type_name.charAt(0).toUpperCase() + craft.type_name.slice(1);
	}

	function formatLevel(craft) {
		const { required_level: min, max_level: max } = craft;
		if (min == null && max == null) return '-';
		if (min != null && max != null) return formatNumberRange(min, max);
		return min != null ? `${min}+` : `≤${max}`;
	}

	// The full item detail's "requirements" array covers both hard requirements ("Kräver att du
	// har minst 90 i egenskapen Styrka") and soft/recommended ones ("Du bör ha minst 20 i
	// vapenfärdigheten Sköldar") for whatever stat or weapon skill applies. requirement_text is a
	// full sentence, which reads fine one at a time but gets unreadably long once several stack
	// up in one cell - pull out just the two <strong> pieces (the value and the stat/skill name)
	// instead, the same "value + name" shape formatEffects already uses. Level requirements are
	// skipped here since those are already covered by the Nivå column.
	function formatRequirements(item) {
		return (item?.requirements || [])
			.filter((requirement) => !/grad/i.test(requirement.requirement_text || ''))
			.map((requirement) => {
				const text = requirement.requirement_text || '';
				const [value, name] = Array.from(text.matchAll(/<strong>(.*?)<\/strong>/g), (match) => stripMarkup(match[1]));
				if (!value || !name) return stripMarkup(text);
				const recommended = /\bbör\b/i.test(text);
				return `${value} ${name}${recommended ? ' (rek)' : ''}`;
			})
			.filter(Boolean)
			.join(', ') || '-';
	}

	function formatNumberRange(min, max) {
		return min === max ? `${max}` : `${min}-${max}`;
	}

	// Weapons and shields share one item shape (base_damage_*, durability, absorption, ...) -
	// a shield just has base_damage_max 0 and absorption/max_blocks_per_round instead of
	// damage, so the same formatter naturally reduces to "the shield stats" for those.
	function formatWeaponStats(item) {
		const parts = [];
		if (item.base_damage_max) {
			parts.push(`Skada ${formatNumberRange(item.base_damage_min, item.base_damage_max)}`);
			if (item.crit_damage) parts.push(`Krit ${item.crit_damage}`);
		}
		if (item.absorption) parts.push(`Absorption ${item.absorption}`);
		if (item.max_crit_rate) parts.push(`Kritchans ${formatNumberRange(item.min_crit_rate, item.max_crit_rate)}%`);
		if (item.durability) parts.push(`Hållbarhet ${item.durability}`);
		if (item.max_blocks_per_round) parts.push(`Block/runda ${item.max_blocks_per_round}`);
		if (item.is_two_handed) parts.push('2H');
		else if (item.can_dual_wield) parts.push('Dual');
		if (item.weight) parts.push(`Vikt ${item.weight}`);
		if (item.max_enchants) parts.push(`Ench ${item.max_enchants}`);
		return parts.join(' · ');
	}

	// Armor and trinkets share the other item shape (base_block, increased_hit_rate, ...)
	// instead of the weapon/shield shape above.
	function formatArmorStats(item) {
		const parts = [];
		if (item.base_block) {
			const percent = item.percentage_block ? ` (${item.percentage_block}%)` : '';
			parts.push(`Block ${item.base_block}${percent}`);
		}
		if (item.max_crit_rate) parts.push(`Kritchans ${formatNumberRange(item.min_crit_rate, item.max_crit_rate)}%`);
		if (item.increased_hit_rate) parts.push(`Träffchans +${item.increased_hit_rate}`);
		if (item.weight) parts.push(`Vikt ${item.weight}`);
		if (item.max_enchants) parts.push(`Ench ${item.max_enchants}`);
		return parts.join(' · ');
	}

	// The two gear shapes are told apart by which fields the item actually carries rather
	// than by the craft's is_* flags, so this keeps working for any future gear-like item
	// type without needing a new branch here.
	function formatStats(item) {
		if (!item) return '-';
		if ('base_damage_min' in item) return formatWeaponStats(item) || '-';
		if ('base_block' in item) return formatArmorStats(item) || '-';
		return '-';
	}

	async function fetchItem(category, id) {
		for (const endpoint of endpointCandidates(category)) {
			const response = await fetch(`/api/items/${endpoint}/${id}`).catch(() => null);
			if (response && response.ok) {
				resolvedEndpoints.set(category, endpoint);
				return response.json();
			}
		}
		return null;
	}

	async function getItem(craft) {
		if (!craft.id) return null;
		const category = itemCategory(craft);
		const cacheKey = `${category}/${craft.id}`;
		if (!itemCache.has(cacheKey)) itemCache.set(cacheKey, fetchItem(category, craft.id));
		return itemCache.get(cacheKey);
	}

	function findCraft(crafts, row) {
		const name = row.cells[0]?.innerText.trim();
		const profession = row.cells[1]?.innerText.trim();
		return crafts.find((entry) => {
			if (entry.name !== name) return false;
			const professions = (entry.profession_requirements || [])
				.map((requirement) => `${requirement.profession.name} ${requirement.level}`);
			return professions.includes(profession) || (!professions.length && profession === '-');
		});
	}

	// Guards against a slow fetch resolving after the table has already been re-sorted/
	// filtered and this exact <tr> reused for a different craft in the meantime - without
	// this, the fetch for the row's old craft would land its result into what is now a
	// different row.
	async function loadRecipe(craft, row, key, materialsCell, requirementsCell, statsCell, effectsCell) {
		materialsCell.textContent = formatMaterials(craft);
		const item = await getItem(craft);
		if (row.dataset.lanistaCraftsKey !== key) return;
		requirementsCell.textContent = formatRequirements(item);
		statsCell.textContent = formatStats(item);
		effectsCell.textContent = formatEffects(item);
	}

	async function getCrafts() {
		if (!craftsPromise) craftsPromise = fetch('/api/crafts').then((response) => response.ok ? response.json() : []);
		return craftsPromise;
	}

	const CRAFTS_COLUMNS = [
		{ key: 'type', label: 'Typ' },
		{ key: 'level', label: 'Nivå' },
		{ key: 'materials', label: 'Material' },
		{ key: 'requirements', label: 'Krav' },
		{ key: 'stats', label: 'Stats' },
		{ key: 'effects', label: 'Effekter' }
	];

	function ensureCell(row, key, index) {
		let cell = row.querySelector(`[data-lanista-crafts-cell="${key}"]`);
		if (!cell) {
			cell = document.createElement('td');
			cell.dataset.lanistaCraftsCell = key;
			cell.className = 'p-2 align-middle';
			row.insertBefore(cell, row.cells[index] || null);
		}
		return cell;
	}

	async function addColumns(table) {
		const header = table.tHead && table.tHead.rows[0];
		// Only guards against re-entering while a scan is already in flight for this table -
		// it must NOT persist once headers exist, or rows added later (e.g. the user raising
		// "Rader per sida" past the current page, which appends more <tr>s to this same
		// <table> without recreating <thead>) would never get their columns filled in.
		if (!header || table.dataset.lanistaCraftsScanning) return;
		table.dataset.lanistaCraftsScanning = 'true';
		try {
			const crafts = await getCrafts();

			// Yrken/Pris are hidden (not removed) so Vue keeps patching real DOM nodes it still
			// owns - splicing them out could desync its internal vnode/DOM index bookkeeping.
			// The resulting index/hidden-column layout is resolved once and cached on the table's
			// dataset because a hidden header's innerText reads as empty, so it can't be re-found
			// by label text on later scans.
			if (!header.querySelector('[data-lanista-crafts-column]')) {
				const findHeader = (label) => Array.from(header.cells)
					.find((cell) => cell.innerText.trim().toLowerCase() === label);
				const priceHeader = findHeader('pris');
				const yrkenHeader = findHeader('yrken');
				const insertAt = priceHeader ? priceHeader.cellIndex + 1 : header.cells.length;
				const hiddenIndexes = [priceHeader, yrkenHeader].filter(Boolean).map((cell) => cell.cellIndex);
				hiddenIndexes.forEach((index) => { header.cells[index].style.display = 'none'; });

				table.dataset.lanistaCraftsInsertAt = String(insertAt);
				table.dataset.lanistaCraftsHiddenIndexes = JSON.stringify(hiddenIndexes);

				CRAFTS_COLUMNS.forEach(({ label }, offset) => {
					const cell = document.createElement('th');
					cell.textContent = label;
					cell.dataset.lanistaCraftsColumn = 'true';
					cell.className = 'text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap';
					header.insertBefore(cell, header.cells[insertAt + offset] || null);
				});
			}

			const insertAt = Number(table.dataset.lanistaCraftsInsertAt);
			const hiddenIndexes = JSON.parse(table.dataset.lanistaCraftsHiddenIndexes || '[]');

			Array.from(table.tBodies).forEach((body) => {
				Array.from(body.rows).forEach((row) => {
					// Re-applied every scan (not just once) in case Vue's own re-render resets
					// the inline style it doesn't know we added.
					hiddenIndexes.forEach((index) => {
						if (row.cells[index]) row.cells[index].style.display = 'none';
					});

					const name = row.cells[0]?.innerText.trim();
					if (!name) return;
					// Sorting/filtering re-renders this table by patching each existing <tr>'s
					// native cell text in place rather than recreating rows, so a <tr> that
					// already carries our injected cells may now represent a completely
					// different craft. Re-derive an identity from the same name+profession text
					// findCraft() itself matches on, and only skip when that identity is
					// unchanged - otherwise refresh the existing cells instead of leaving them
					// showing the previous row's data.
					const profession = row.cells[1]?.innerText.trim() || '';
					const key = `${name}␟${profession}`;
					if (row.dataset.lanistaCraftsKey === key) return;
					row.dataset.lanistaCraftsKey = key;

					const craft = findCraft(crafts, row);

					const [typeCell, levelCell, materialsCell, requirementsCell, statsCell, effectsCell] =
						CRAFTS_COLUMNS.map(({ key: cellKey }, offset) => ensureCell(row, cellKey, insertAt + offset));

					typeCell.textContent = craft ? formatType(craft) : '-';
					levelCell.textContent = craft ? formatLevel(craft) : '-';
					materialsCell.textContent = craft ? '...' : '-';
					requirementsCell.textContent = craft ? '...' : '-';
					statsCell.textContent = craft ? '...' : '-';
					effectsCell.textContent = craft ? '...' : '-';
					if (craft) {
						loadRecipe(craft, row, key, materialsCell, requirementsCell, statsCell, effectsCell).catch(() => {
							if (row.dataset.lanistaCraftsKey !== key) return;
							requirementsCell.textContent = '-';
							statsCell.textContent = '-';
							effectsCell.textContent = '-';
						});
					}
				});
			});
		} finally {
			delete table.dataset.lanistaCraftsScanning;
		}
	}

	function csvValue(value) {
		return `"${value.replace(/"/g, '""')}"`;
	}

	function addExportButton(table) {
		const root = table.closest('.data-table-root') || table.parentElement?.parentElement?.parentElement;
		const footer = Array.from(root?.querySelectorAll('div') || [])
			.find((element) => element.innerText.trim().startsWith('Rader per sida'));
		if (!footer || footer.querySelector('[data-lanista-crafts-export]')) return;

		const button = document.createElement('button');
		button.type = 'button';
		button.textContent = 'Exportera csv';
		button.dataset.lanistaCraftsExport = 'true';
		button.className = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-background px-3 py-1 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground';
		button.addEventListener('click', () => {
			const headerRow = table.tHead?.rows[0];
			if (!headerRow) return;
			const columns = Array.from(headerRow.cells)
				.map((cell, index) => ({ index, label: cell.innerText.trim() }))
				.filter(({ label }) => label && label.toLowerCase() !== 'redo');
			const rows = [
				headerRow,
				...Array.from(table.tBodies).flatMap((body) => Array.from(body.rows))
			];
			const csv = rows.map((row) => columns
				.map(({ index }) => csvValue(row.cells[index]?.innerText.trim() || ''))
				.join(';')).join('\r\n');
			const link = document.createElement('a');
			link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
			link.download = `lanista-crafts-${new Date().toISOString().slice(0, 10)}.csv`;
			link.click();
			URL.revokeObjectURL(link.href);
		});

		footer.firstElementChild?.appendChild(button);
	}

	function scanCraftPage() {
		document.querySelectorAll('table').forEach((table) => {
			addColumns(table);
			addExportButton(table);
		});
	}

	function escapeRegExp(value) {
		return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	function incrementStat(stats, name, key) {
		if (stats.has(name)) stats.get(name)[key]++;
	}

	function createStatBucket(extra) {
		return {
			damageDone: 0,
			damageTaken: 0,
			maxDamageDone: 0,
			healingDone: 0,
			dodges: 0,
			parries: 0,
			blocks: 0,
			misses: 0,
			attacksMade: 0,
			attacksAgainst: 0,
			hitsLanded: 0,
			hitsTaken: 0,
			crits: 0,
			evadedByDodge: 0,
			evadedByParry: 0,
			evadedByBlock: 0,
			missesAgainst: 0,
			...extra
		};
	}

	function formatPercent(numerator, denominator) {
		if (!denominator) return '–';
		return `${Math.round((numerator / denominator) * 100)}%`;
	}

	function formatRatio(numerator, denominator, decimals = 1) {
		if (!denominator) return '–';
		return (numerator / denominator).toFixed(decimals);
	}

	function formatSigned(value) {
		return value > 0 ? `+${value}` : `${value}`;
	}

	function sumBySide(entries, key) {
		const sums = new Map();
		entries.forEach((entry) => sums.set(entry.side, (sums.get(entry.side) || 0) + entry[key]));
		return sums;
	}

	function countBySide(entries) {
		const counts = new Map();
		entries.forEach((entry) => counts.set(entry.side, (counts.get(entry.side) || 0) + 1));
		return counts;
	}

	// The server embeds literal "<p></p>" scene-break tags between the simultaneous 1v1
	// exchanges that make up one round in a team battle. HTML doesn't allow a <p> to contain
	// another <p>, so the browser auto-closes the round's real .battle-text paragraph at the
	// first embedded one - everything after it (most of a 3v3 round) ends up as plain,
	// unclassed sibling elements (p/green/red/br/strong/i) that querySelectorAll('.battle-text')
	// never sees. So instead of that selector, walk the round's direct children (not a deep
	// query, which would also reach into the elements excluded below) and take everything
	// that isn't the round heading, the viewer-only per-round stats card (which shares
	// vocabulary like "blockerade" that would false-match our regexes below), or our own
	// previously-injected summary panel (which MUST be excluded - a re-scan would otherwise
	// re-parse our own rendered output as if it were battle narrative).
	function isNarrativeNode(node) {
		if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim().length > 0;
		if (node.nodeType !== Node.ELEMENT_NODE) return false;
		if (node.matches('.font-semibold')) return false;
		if (node.matches('.relative.mt-2.flex.rounded')) return false;
		if (node.hasAttribute('data-lanista-battle-summaries')) return false;
		return true;
	}

	function summarizeRound(round, currentName) {
		// Build the round's full narrative text with the excluded nodes removed first, then
		// take a single .innerText call on what's left - this lets the browser's own
		// block/inline spacing rules produce correct text (e.g. "skadar sig lätt (30)" with
		// the digits tight against the parens, since the game wraps the digits in their own
		// <strong>). Joining each node's innerText by hand with a fixed separator (an earlier
		// version of this fix did that) inserts a stray space around every such <strong>,
		// turning "(30)" into "( 30 )" and silently breaking the damage regex below for every
		// hit in a round after the first.
		const clone = round.cloneNode(true);
		Array.from(clone.childNodes).forEach((node) => { if (!isNarrativeNode(node)) node.remove(); });
		const text = clone.innerText.replace(/\s+/g, ' ').trim();

		// A crit is rendered as an icon (no text content) next to the damage figure, so it's
		// invisible to innerText/regex. The digits themselves are always wrapped in their own
		// <strong>, so correlate each damage-regex match (in left-to-right order) with the
		// same-order <strong> element holding just a number, rather than trying to reconstruct
		// character offsets across many small sibling nodes. The icon class is inferred from
		// this repo's captured battle API JSON (fa-stars), not confirmed against the live DOM
		// (this script has never called that API) - if crit rate reads 0% on a battle that
		// clearly had crits, inspect a known-crit round's live DOM and adjust it.
		// Every real damage figure is preceded by an open paren ("...lätt ("); a block/parry
		// item's own absorption figure ("Svartsköld tar 6 i skada") is preceded by "tar "
		// instead and must be excluded here too, or it drifts this ordinal correlation out of
		// sync with the (correctly narrower) extraction regex below.
		const damageStrongNodes = Array.from(round.querySelectorAll('strong'))
			.filter((element) => /^\d+$/.test(element.textContent.trim()))
			.filter((element) => {
				const prev = element.previousSibling;
				return prev && prev.nodeType === Node.TEXT_NODE && /\(\s*$/.test(prev.textContent);
			});
		let damageMatchIndex = 0;
		const isNextDamageCrit = () => {
			const node = damageStrongNodes[damageMatchIndex++];
			return !!node && !!node.querySelector('.fa-stars, [class*="fa-star"]');
		};

		const sideByName = new Map();
		round.querySelectorAll('green, red').forEach((element) => {
			const name = element.innerText.trim();
			if (name && !sideByName.has(name)) {
				sideByName.set(name, element.tagName.toLowerCase() === 'green' ? 'ally' : 'enemy');
			}
		});
		const names = Array.from(sideByName.keys());
		const stats = new Map(names.map((name) => [name, createStatBucket()]));

		const sentences = text.split(/\.\s+/);
		// Which fighter's name a sentence happens to mention first is not a reliable "who
		// attacked first" signal - the game has many phrasing variants for the same event, and
		// some name the *defender* first as the grammatical subject (e.g. "Denslöe verkar
		// oförberedd och det tar inte lång tid för Rotvältare Brûshméc att dra nytta av
		// situationen" - Denslöe named first, but Rotvältare is confirmed the attacker against
		// the API JSON). What's reliable is the resolved attacker of the round's earliest
		// combat-outcome event (hit, dodge, parry, block, or miss), by text position - each
		// branch below that already resolves an attacker records it here alongside its
		// approximate offset, and after both passes the earliest one wins.
		const combatEvents = [];
		let sentenceCursor = 0;
		const sentenceOffsets = sentences.map((sentence) => {
			const start = text.indexOf(sentence, sentenceCursor);
			sentenceCursor = start + sentence.length;
			return start;
		});
		const namesIn = (sentence) => names
			.map((name) => ({ name, position: sentence.lastIndexOf(name) }))
			.filter(({ position }) => position >= 0)
			.sort((left, right) => left.position - right.position)
			.map(({ name }) => name);
		// NOTE: "X tar N i skada" (no parens) looks like a second damage phrasing but isn't -
		// it's the absorption/durability figure of the shield or weapon that just successfully
		// blocked/parried the attack (confirmed against the API JSON: it's the `damage` field
		// on shield_block/weapon_block events, e.g. block_item "Svartsköld", separate from
		// round_stats.damage_done), not damage exchanged between the two fighters. Matching it
		// here previously double-counted every blocked/parried hit as real damage on top of the
		// correct block/parry credit - see the parry-detection widening below for the actual
		// fix to the sentence this was originally meant to handle.
		const damageFigurePattern = /skad(?:ar|as)(?: sig)?[^.()]{0,100}\(\d+\s*\)/i;
		// Some outcome sentences ("Denslöe... lyckas Denslöe blockera attacken.") only re-name
		// the defender, not the attacker introduced a sentence or two earlier - mirrors the
		// damage loop's own widen fallback below. Approximates the original text's ordering by
		// concatenating sentences so far (exact offsets aren't needed, only relative order).
		const resolveAttacker = (target, uptoIndex) => {
			const seen = namesIn(sentences.slice(0, uptoIndex + 1).join(' ')).filter((name) => name !== target);
			return seen.length ? seen[seen.length - 1] : null;
		};
		sentences.forEach((sentence, index) => {
			const mentionedNames = namesIn(sentence);
			if (!mentionedNames.length) return;
			const firstName = mentionedNames[0];
			const lastName = mentionedNames[mentionedNames.length - 1];
			const hasAttackerTarget = mentionedNames.length > 1 && firstName !== lastName;
			const widenedAttacker = hasAttackerTarget ? firstName : resolveAttacker(lastName, index);
			// A "glancing" dodge/parry/block still deals reduced damage described in the same
			// sentence (the game models these as distinct from a full evasion - see
			// round_stats.glancing_dodges etc in the example battle JSON in this repo). And a
			// *failed* dodge/parry attempt ("X försöker undvika men misslyckas", "X klarar inte
			// att undvika", ...) reads exactly like a successful one to a plain "undvik"/"parera"
			// match, but is always followed shortly by the resulting hit's damage figure in a
			// *later* sentence - verified against every such instance (11+) in a real recorded
			// battle. Rather than enumerate every failure phrasing (there may be more we haven't
			// seen), treat "a damage figure shows up in this sentence or either of the next two"
			// as the general signal that this was actually a hit, and skip these
			// defensive-outcome counters - otherwise the same exchange gets counted as both a
			// landed hit and a full evasion, inflating attacksAgainst/attacksMade past 100%.
			const resolvesToHitShortly = [sentence, sentences[index + 1], sentences[index + 2]]
				.some((candidate) => candidate && damageFigurePattern.test(candidate));
			// Enchant/consumable flavor text like "Slunga gör att Dvärgen Windstars Undvika
			// anfall minskar med 5" names the "Undvika anfall" (Dodge) *stat* being debuffed -
			// not an actual dodge happening - but still matches /undvik/i. "minskar med N" is
			// this template's distinguishing phrase (a stat decreasing by N), so use it to
			// exclude these lines from all three defensive-outcome counters.
			const isStatDebuffFlavor = /minskar med \d+/i.test(sentence);
			// "lyckas [Name] skickligt parera ..." puts the subject/adverb between "lyckas" and
			// "parera" (unlike blockera, which needs no "lyckas" prefix at all to be unambiguous
			// on its own) - \blyckas\b is a real word-boundary match so it doesn't fire inside
			// "misslyckas" (no \w/\W boundary between the "s" and "l" there).
			const hasSuccessfulParry = /\blyckas\b[^.]*\bparera\b/i.test(sentence) || /parera med/i.test(sentence);
			const hasSuccessfulBlock = /blockera|absorberas/i.test(sentence);
			if (!resolvesToHitShortly && !isStatDebuffFlavor) {
				// A sentence like "X försöker undvika attacken men misslyckas, dock lyckas X
				// parera ..." fails the dodge and succeeds the parry in the same breath - without
				// this guard it would double-credit one exchange as both outcomes.
				if (/undvik/i.test(sentence) && !hasSuccessfulParry && !hasSuccessfulBlock) {
					incrementStat(stats, lastName, 'dodges');
					if (widenedAttacker) {
						incrementStat(stats, widenedAttacker, 'attacksMade');
						incrementStat(stats, widenedAttacker, 'evadedByDodge');
						incrementStat(stats, lastName, 'attacksAgainst');
						combatEvents.push({ offset: sentenceOffsets[index], attacker: widenedAttacker });
					}
				}
				if (hasSuccessfulParry) {
					incrementStat(stats, lastName, 'parries');
					if (widenedAttacker) {
						incrementStat(stats, widenedAttacker, 'attacksMade');
						incrementStat(stats, widenedAttacker, 'evadedByParry');
						incrementStat(stats, lastName, 'attacksAgainst');
						combatEvents.push({ offset: sentenceOffsets[index], attacker: widenedAttacker });
					}
				}
				if (hasSuccessfulBlock) {
					incrementStat(stats, lastName, 'blocks');
					if (widenedAttacker) {
						incrementStat(stats, widenedAttacker, 'attacksMade');
						incrementStat(stats, widenedAttacker, 'evadedByBlock');
						incrementStat(stats, lastName, 'attacksAgainst');
						combatEvents.push({ offset: sentenceOffsets[index], attacker: widenedAttacker });
					}
				}
			}
			// A genuine clean miss ("X ramlar fram som en senil sengångare, fumlar med Y och
			// missar Z" / "X fumlar runt med Y och missar totalt attacken mot Z") uses entirely
			// different vocabulary from the dodge/parry phrasings above - no "undvik" at all -
			// and is never followed by a damage figure, so it doesn't need those guards.
			// Verified against a real recorded battle: matches the JSON's
			// battle.miss.miss_text_N key exactly, and the resulting counts line up with that
			// battle's exact end-of-battle "missade N attacker" ground truth for both fighters.
			if (/fumlar/i.test(sentence)) {
				incrementStat(stats, firstName, 'misses');
				if (widenedAttacker) {
					incrementStat(stats, widenedAttacker, 'attacksMade');
					incrementStat(stats, lastName, 'missesAgainst');
					incrementStat(stats, lastName, 'attacksAgainst');
					combatEvents.push({ offset: sentenceOffsets[index], attacker: widenedAttacker });
				}
			}
			const healIndex = sentence.indexOf('helas med');
			if (healIndex >= 0) {
				const heal = parseInt(sentence.slice(healIndex + 'helas med'.length), 10);
				if (!Number.isNaN(heal)) stats.get(lastName).healingDone += heal;
			}
		});

		for (const match of text.matchAll(/skad(?:ar|as)(?: sig)?[^.()]{0,100}\((\d+)\s*\)/gi)) {
			const sentenceStart = text.lastIndexOf('.', match.index) + 1;
			let mentionedNames = namesIn(text.slice(sentenceStart, match.index + match[0].length));
			// "X skadar sig (n)" only names the victim - it's how the game phrases "X takes
			// damage" - and the attacker is often introduced a sentence or more earlier in
			// the same exchange (sometimes with a name-less clause like an armor absorb in
			// between). When the immediate clause doesn't have both names, widen the search
			// to the whole round so far and take the two most recently mentioned distinct
			// names instead of assuming attacker/target share a sentence.
			let widened = false;
			if (mentionedNames.length < 2) {
				mentionedNames = namesIn(text.slice(0, match.index + match[0].length));
				widened = true;
			}
			if (mentionedNames.length < 1) continue;
			const target = mentionedNames[mentionedNames.length - 1];
			const attacker = mentionedNames.length > 1
				? (widened ? mentionedNames[mentionedNames.length - 2] : mentionedNames[0])
				: null;
			const damage = Number(match[1]);
			// Must run once per match, in order, regardless of whether the match ends up
			// attributed below - it keeps damageMatchIndex aligned with damageStrongNodes,
			// which is built once for the whole round independent of per-match attribution.
			const isCrit = isNextDamageCrit();
			stats.get(target).damageTaken += damage;
			stats.get(target).attacksAgainst++;
			stats.get(target).hitsTaken++;
			if (attacker && attacker !== target) {
				stats.get(attacker).damageDone += damage;
				stats.get(attacker).maxDamageDone = Math.max(stats.get(attacker).maxDamageDone, damage);
				stats.get(attacker).attacksMade++;
				stats.get(attacker).hitsLanded++;
				if (isCrit) stats.get(attacker).crits++;
				combatEvents.push({ offset: match.index, attacker });
			}
		}

		combatEvents.sort((left, right) => left.offset - right.offset);
		const firstAttacker = combatEvents.length ? combatEvents[0].attacker : null;

		return {
			participants: names.map((name) => ({ name, side: sideByName.get(name), isSelf: name === currentName, ...stats.get(name) })),
			firstAttacker
		};
	}

	// The site colors names via real <green>/<red> tags, but the color rule is Vue
	// scoped CSS tied to that component's internal data-v-* hash - it only takes effect
	// inside an element carrying that exact attribute, which isn't something we can
	// reliably reproduce (invented Tailwind classes like "text-green-700" fare no
	// better: this page's CSS is purged down to only the utility classes its own
	// templates use, so a class name we made up can silently match nothing). Instead we
	// sample the real computed color off a live tag already on the page and apply it as
	// an inline style, which works regardless of where our own elements live in the DOM.
	function sideColors() {
		const sample = (tag) => {
			const element = document.querySelector(tag);
			return element ? getComputedStyle(element).color : '';
		};
		return { ally: sample('green'), enemy: sample('red') };
	}

	// The end-of-battle block starts with a "Lag N går segrande ur striden!" heading,
	// which (unlike the per-player reward flavor text right after it, which seems to
	// vary by performance rather than strictly by win/loss) looks like a fixed,
	// non-varying template. Rather than trying to match reward-sentence wording, we use
	// it to find which side's name is mentioned first in that block - the site groups
	// winners' reward lines before losers' - and treat that as the winning side.
	function detectWinningSide() {
		const heading = Array.from(document.querySelectorAll('p.font-semibold'))
			.find((element) => /går segrande ur striden/i.test(element.innerText));
		if (!heading) return null;
		const firstTag = heading.parentElement.querySelector('green, red');
		if (!firstTag) return null;
		return firstTag.tagName.toLowerCase() === 'green' ? 'ally' : 'enemy';
	}

	// Once a battle finishes, the site renders one <span class="font-light summary"> per
	// participant with a fixed-template sentence giving exact, server-computed totals -
	// verified character-for-character against a real recorded battle's ground-truth API
	// data. This is far more reliable than summing our own regex-parsed per-round guesses,
	// so scanBattlePage() uses it to override the totals card when available. It gives no
	// equivalent for attacksMade/hitsLanded/evadedBy*/healingDone (the game doesn't expose
	// "why did *my* attacks fail" anywhere), so those still come from narrative parsing.
	function parseFinalStatsSummary(names) {
		const pattern = /delade ut (\d+) i skada \(totalt (\d+)[^)]*\), hade en högsta skada på (\d+), tog emot (\d+) skada, blev attackerad (\d+) gånger, undvek (\d+) attacker \(varav \d+ partiella\), parerade (\d+) attacker, blockerade (\d+) attacker \(varav \d+ partiella\), missade (\d+) attacker \(varav \d+ partiella\) och fick in (\d+) perfekta träffar/i;
		const result = new Map();
		document.querySelectorAll('span.font-light.summary').forEach((span) => {
			const nameTag = span.querySelector('green, red');
			if (!nameTag) return;
			const name = nameTag.innerText.trim();
			if (!names.includes(name)) return;
			const match = pattern.exec(span.innerText.replace(/\s+/g, ' ').trim());
			if (!match) return;
			const [, damageDone, , maxDamageDone, damageTaken, attacksAgainst, dodges, parries, blocks, missesAgainst, crits] = match.map(Number);
			result.set(name, { damageDone, maxDamageDone, damageTaken, attacksAgainst, dodges, parries, blocks, missesAgainst, crits });
		});
		return result;
	}

	function buildParticipantPanel(participant, context, colors) {
		const panel = document.createElement('div');
		panel.className = 'rounded border border-border/60 bg-muted/35 px-2 py-1 text-xs';

		const nameElement = document.createElement('div');
		nameElement.className = 'font-semibold';
		const color = colors[participant.side];
		if (color) nameElement.style.color = color;
		nameElement.textContent = (participant.isWinner ? '🏆 ' : '') + participant.name + (participant.isSelf ? ' (Du)' : '');

		const net = participant.damageDone - participant.damageTaken;
		const avgDamage = formatRatio(participant.damageDone, participant.hitsLanded);
		const shareSuffix = context.teamSize > 1 && context.teamDamage > 0
			? `, ${formatPercent(participant.damageDone, context.teamDamage)} av lagets skada`
			: '';

		const line1 = document.createElement('div');
		line1.className = 'text-muted-foreground';
		line1.textContent = ` -${participant.damageTaken} KP (${context.totalDamageTaken} totalt), gjorde ${participant.damageDone} (snitt ${avgDamage}/träff, max ${participant.maxDamageDone}${shareSuffix}), netto ${formatSigned(net)}, läkte ${participant.healingDone}`;

		// Line 2 ("Anfall") and line 3 ("Försvar") deliberately use different denominators
		// (own attacksMade vs. attacksAgainst) and are labeled accordingly - mixing them in
		// one unlabeled line reads as "these are all the same rate", which they aren't: line
		// 2 explains why *this participant's own attacks* failed to land (own fumble vs. the
		// opponent blocking/parrying/dodging them), line 3 is the mirror for incoming attacks.
		const line2 = document.createElement('div');
		line2.className = 'text-muted-foreground';
		line2.textContent = ` Anfall: träffade ${formatPercent(participant.hitsLanded, participant.attacksMade)} (${participant.hitsLanded}/${participant.attacksMade}), fumlade ${formatPercent(participant.misses, participant.attacksMade)}, blockerades ${formatPercent(participant.evadedByBlock, participant.attacksMade)}, parerades ${formatPercent(participant.evadedByParry, participant.attacksMade)}, undveks ${formatPercent(participant.evadedByDodge, participant.attacksMade)}, kritisk ${formatPercent(participant.crits, participant.hitsLanded)} (${participant.crits} st)`;

		const line3 = document.createElement('div');
		line3.className = 'text-muted-foreground';
		line3.textContent = ` Försvar: träffades ${formatPercent(participant.hitsTaken, participant.attacksAgainst)} (${participant.hitsTaken}/${participant.attacksAgainst}), attacker missade ${formatPercent(participant.missesAgainst, participant.attacksAgainst)}, undvek ${formatPercent(participant.dodges, participant.attacksAgainst)}, parerade ${formatPercent(participant.parries, participant.attacksAgainst)}, blockerade ${formatPercent(participant.blocks, participant.attacksAgainst)}`;

		panel.appendChild(nameElement);
		panel.appendChild(line1);
		panel.appendChild(line2);
		panel.appendChild(line3);

		// Only set (battle totals card, viewer's own row, duel only - see scanBattlePage).
		if (context.attackedFirst) {
			const line4 = document.createElement('div');
			line4.className = 'text-muted-foreground';
			line4.textContent = ` Anföll först i ${context.attackedFirst.count} av ${context.attackedFirst.total} ronder`;
			panel.appendChild(line4);
		}
		return panel;
	}

	function renderParticipantSummaries(round, participants, totals, roundTeamDamage, roundTeamSize) {
		const signature = JSON.stringify(participants);
		let container = round.querySelector(':scope > [data-lanista-battle-summaries]');
		if (container && container.dataset.lanistaBattleSignature === signature) return;

		if (!container) {
			container = document.createElement('div');
			container.dataset.lanistaBattleSummaries = 'true';
			container.className = 'mt-2 space-y-1';
			round.appendChild(container);
		} else {
			container.innerHTML = '';
		}
		container.dataset.lanistaBattleSignature = signature;

		const colors = sideColors();
		participants.forEach((participant) => {
			const totalDamageTaken = totals.get(participant.name)?.damageTaken || 0;
			const context = {
				totalDamageTaken,
				teamDamage: roundTeamDamage.get(participant.side) || 0,
				teamSize: roundTeamSize.get(participant.side) || 1
			};
			container.appendChild(buildParticipantPanel(participant, context, colors));
		});
	}

	function renderBattleTotals(host, beforeNode, totals, battleTeamDamage, battleTeamSize, attackedFirst) {
		const entries = Array.from(totals, ([name, stats]) => ({ name, ...stats }));
		const signature = JSON.stringify({ entries, attackedFirst });
		let card = host.querySelector(':scope > [data-lanista-battle-totals]');
		const inPlace = card && card.nextSibling === beforeNode;
		if (card && card.dataset.lanistaBattleSignature === signature && inPlace) return;

		// Rendered as its own card (matching the round cards' own classes) and inserted
		// as a sibling in the rounds list, rather than nested inside round 1's card -
		// that lets the list's own spacing/padding rules apply to it like any other round
		// instead of us guessing at margins.
		if (!card) {
			card = document.createElement('div');
			card.dataset.lanistaBattleTotals = 'true';
			card.className = 'bg-card text-card-foreground flex flex-col gap-0 rounded border py-2 shadow-xl surface-card border-border/70';
		} else {
			card.innerHTML = '';
		}
		card.dataset.lanistaBattleSignature = signature;

		const body = document.createElement('div');
		body.className = 'px-2 md:px-4 space-y-1';
		const heading = document.createElement('p');
		heading.className = 'mb-1 font-semibold';
		heading.textContent = 'Totalt för striden';
		body.appendChild(heading);
		const colors = sideColors();
		entries.forEach((participant) => {
			const context = {
				totalDamageTaken: participant.damageTaken,
				teamDamage: battleTeamDamage.get(participant.side) || 0,
				teamSize: battleTeamSize.get(participant.side) || 1,
				attackedFirst: (attackedFirst && participant.isSelf) ? attackedFirst : null
			};
			body.appendChild(buildParticipantPanel(participant, context, colors));
		});
		card.appendChild(body);

		if (!inPlace) host.insertBefore(card, beforeNode);
	}

	async function scanBattlePage() {
		if (!currentAvatarPromise) {
			currentAvatarPromise = fetch('/api/avatars/me')
				.then((response) => response.ok ? response.json() : null)
				.then((avatar) => avatar?.name || avatar?.avatar?.name || '')
				.catch(() => '');
		}
		const currentName = await currentAvatarPromise;

		// Live battles stream rounds in one at a time, so we always recompute every
		// round from the current DOM state (in round-number order) rather than trusting
		// a per-round "already summarized" flag - otherwise a round that was only
		// partially rendered when first seen would get its stats locked in forever, and
		// the running total would reset to just that round's damage instead of staying
		// cumulative. Rendering is still skipped per-round when nothing changed, so this
		// settles down instead of looping once every round is stable.
		const rounds = Array.from(document.querySelectorAll('p.font-semibold'))
			.map((heading) => {
				const match = heading.innerText.trim().match(/^Runda (\d+)$/);
				return match ? { number: Number(match[1]), container: heading.parentElement } : null;
			})
			.filter(Boolean)
			.sort((left, right) => left.number - right.number);

		const totals = new Map();
		let roundsCounted = 0;
		let selfAttackedFirstRounds = 0;
		rounds.forEach(({ container }) => {
			const { participants, firstAttacker } = summarizeRound(container, currentName);
			// firstAttacker is the resolved attacker of the round's earliest combat-outcome
			// event (see summarizeRound) - only meaningful for a 1v1 duel; a team-battle round
			// narrates several simultaneous pairings at once, so this is tallied unconditionally
			// but only surfaced when isDuel (below) says it's safe to interpret.
			if (participants.length) {
				roundsCounted++;
				if (firstAttacker === currentName) selfAttackedFirstRounds++;
			}
			participants.forEach((participant) => {
				const entry = totals.get(participant.name) || createStatBucket({ side: participant.side, isSelf: participant.isSelf });
				entry.damageDone += participant.damageDone;
				entry.damageTaken += participant.damageTaken;
				entry.maxDamageDone = Math.max(entry.maxDamageDone, participant.maxDamageDone);
				entry.healingDone += participant.healingDone;
				entry.dodges += participant.dodges;
				entry.parries += participant.parries;
				entry.blocks += participant.blocks;
				entry.misses += participant.misses;
				entry.attacksMade += participant.attacksMade;
				entry.attacksAgainst += participant.attacksAgainst;
				entry.hitsLanded += participant.hitsLanded;
				entry.hitsTaken += participant.hitsTaken;
				entry.crits += participant.crits;
				entry.evadedByDodge += participant.evadedByDodge;
				entry.evadedByParry += participant.evadedByParry;
				entry.evadedByBlock += participant.evadedByBlock;
				entry.missesAgainst += participant.missesAgainst;
				totals.set(participant.name, entry);
			});
			if (participants.length) {
				const roundTeamDamage = sumBySide(participants, 'damageDone');
				const roundTeamSize = countBySide(participants);
				renderParticipantSummaries(container, participants, totals, roundTeamDamage, roundTeamSize);
			}
		});

		if (rounds.length) {
			const winningSide = detectWinningSide();
			if (winningSide) {
				totals.forEach((entry) => { entry.isWinner = entry.side === winningSide; });
			}
			const exactStats = parseFinalStatsSummary(Array.from(totals.keys()));
			exactStats.forEach((exact, name) => {
				const entry = totals.get(name);
				if (!entry) return;
				Object.assign(entry, exact);
				entry.hitsTaken = exact.attacksAgainst - exact.dodges - exact.parries - exact.blocks - exact.missesAgainst;
			});
			const battleEntries = Array.from(totals.values());
			const battleTeamDamage = sumBySide(battleEntries, 'damageDone');
			const battleTeamSize = countBySide(battleEntries);
			// "Attacked first" only means something with exactly two fighters in the whole
			// battle - a team battle has no single "who went first this round" to attribute.
			const isDuel = totals.size === 2;
			const attackedFirst = isDuel ? { count: selfAttackedFirstRounds, total: roundsCounted } : null;
			const firstCard = rounds[0].container.parentElement;
			renderBattleTotals(firstCard.parentElement, firstCard, totals, battleTeamDamage, battleTeamSize, attackedFirst);
		}
	}

	const RECENT_BATTLES_COUNT = 5;
	const API_CALL_DELAY_MS = 500;
	const WIN_RATE_CATEGORIES = [
		{ key: 'CHANCE', label: 'Slumpdueller' },
		{ key: 'CHALLENGE', label: 'Utmaningar' },
		{ key: 'TEAM', label: 'Lagspel' },
		{ key: 'TOURNAMENT', label: 'Turneringar' }
	];

	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	// The eye icon everywhere on the site (member lists, battle team headers, ...) is a
	// standalone hover-tooltip component with no click behavior of its own (confirmed live:
	// hovering it fires GET /api/avatars/{id}/gear/preview and shows race+weapons in a
	// v-popper tooltip) - it's always the element immediately before the avatar's own <a
	// href="/game/avatar/{id}">. Once our own button is inserted right after that wrapper, the
	// wrapper's nextElementSibling becomes our button instead of the link on subsequent scans,
	// so this also accepts our own button as proof the wrapper was already correctly resolved -
	// otherwise a rescan would climb past it looking for the (no longer adjacent) link and could
	// latch onto an unrelated ancestor's sibling instead.
	function findEyeIconWrapper(icon) {
		let element = icon;
		while (element && element.parentElement) {
			const next = element.nextElementSibling;
			if (next && next.matches) {
				if (next.matches('a[href^="/game/avatar/"]')) return element;
				if (next.dataset && next.dataset.lanistaStatsButton) return element;
			}
			element = element.parentElement;
		}
		return null;
	}

	function avatarIdFromHref(href) {
		const match = /\/game\/avatar\/(\d+)/.exec(href || '');
		return match ? match[1] : null;
	}

	// Mirrors the <green>/<red> wrapping the site's own battle text uses for the two sides
	// (see summarizeRound above) - battle.stats.stats_text_1's own "name" arg uses the same
	// convention, so this needs to match the plain fighter name from the participants list.
	function stripSideTags(value) {
		return (value || '').replace(/<\/?(?:green|red)>/g, '').trim();
	}

	// Pure narration/flavor categories - a round's opening scene-setter, a "getting ready" line
	// before the round's second beat, a racial proc, an item breaking, a round divider, or the
	// battle's closing winner/loser/stats block - never the round's actual first action, even
	// when (like "start") they happen to carry a player_one of their own.
	const NON_COMBAT_ROUND_CATEGORIES = new Set(['start', 'line_break', 'slow', 'racials', 'item_broken', 'second', 'break', 'winner', 'loser', 'stats']);

	// Only meaningful for a 1v1 (a team battle round narrates several simultaneous pairings at
	// once, so there's no single "who went first"). round.text preserves chronological order and
	// - confirmed live across several categories (attack_with_armor_block*, ranged*, weapon_block,
	// dodge, miss, ...) - "player_one" is always the attacker in a genuine combat-resolution
	// event, so the round's first non-flavor entry names who acted first. A ranged/thrown weapon
	// can resolve before the round's own "start" line (confirmed live: seen as round.text[0],
	// ahead of "start"), so this scans for the first qualifying entry rather than trusting
	// round.text[0] or the "start" entry specifically. Same fighter went first in every round of
	// both real battles this was checked against, but a status effect (see the "slow" category)
	// could plausibly flip initiative mid-battle, so this is computed per round rather than
	// assumed constant for the whole battle.
	function computeAttackedFirst(battle, fighterName) {
		if ((battle.participants || []).length !== 2) return null;
		let total = 0;
		let count = 0;
		(battle.rounds || []).forEach((round) => {
			const firstCombatEntry = (round.text || []).find((entry) => {
				const category = entry.key.split('.')[1];
				return !NON_COMBAT_ROUND_CATEGORIES.has(category) && entry.args && entry.args.player_one;
			});
			if (!firstCombatEntry) return;
			total++;
			if (stripSideTags(firstCombatEntry.args.player_one) === fighterName) count++;
		});
		return total ? { count, total } : null;
	}

	// /api/battles/{id}'s per-round "participant_data" (used by scanBattlePage above) is scoped
	// to whichever avatar is currently logged in, not to whoever's battle list it was reached
	// through - confirmed live by fetching a battle the logged-in avatar wasn't part of at all,
	// where participant_data was simply absent from every round. The one place the same response
	// gives exact, server-computed totals for an arbitrary participant is the
	// "battle.stats.stats_text_1" text entry the game emits once per fighter in the battle's
	// final round - present for duels, team battles and monster hunts alike (confirmed against
	// one live example of each), and unlike round_stats it isn't tied to the viewer's session.
	function findOwnBattleStats(battle, avatarId) {
		const participant = (battle.participants || []).find((entry) => entry.unique_id === `avatar_${avatarId}`);
		if (!participant) return null;
		const statsArgs = [];
		(battle.rounds || []).forEach((round) => (round.text || []).forEach((entry) => {
			if (entry.key === 'battle.stats.stats_text_1') statsArgs.push(entry.args);
		}));
		const own = statsArgs.find((args) => stripSideTags(args.name) === participant.fighter.name);
		if (!own) return null;
		const enemyNames = new Set((battle.participants || [])
			.filter((entry) => entry.team !== participant.team)
			.map((entry) => entry.fighter.name));

		// battle.stats has no "attacks made"/"hits landed" field for this avatar's own offense -
		// attacks_against/dodges/blocks/misses on its own entry are defensive (incoming attacks
		// against this avatar; confirmed live: critical_hits can exceed attacks_against - dodges -
		// blocks - misses for the same entry, which would be impossible if critical_hits also
		// counted incoming crits rather than the avatar's own landed ones). The closest available
		// proxy for a crit-rate denominator is how many of the enemy side's incoming attacks
		// actually landed, summed from the enemy participants' own stats entries - exact for a 1v1
		// (the large majority of recent matches: duels, ranked duels, chance duels), but in a team
		// battle or multi-avatar monster hunt it's the whole team's landed hits rather than just
		// this avatar's, so the resulting crit rate reads low for anyone who didn't land every hit
		// themselves.
		const hitsLandedByOwnSide = statsArgs
			.filter((args) => enemyNames.has(stripSideTags(args.name)))
			.reduce((total, args) => total + Math.max(0, args.attacks_against - args.dodges - args.blocks - args.misses), 0);

		return {
			id: battle.id,
			createdAt: battle.created_at,
			typeDisplay: battle.type_display,
			won: participant.won,
			fighterName: participant.fighter.name,
			opponents: Array.from(enemyNames),
			damageDone: own.damage_done,
			maxDamageDone: own.max_damage_done,
			damageTaken: own.damage_taken,
			criticalHits: own.critical_hits,
			hitsLandedByOwnSide,
			attacksAgainst: own.attacks_against,
			dodges: own.dodges,
			blocks: own.blocks,
			misses: own.misses,
			attackedFirst: computeAttackedFirst(battle, participant.fighter.name)
		};
	}

	// Battles the avatar hasn't finished yet (or ones too old/odd-shaped to carry a
	// battle.stats entry) are simply skipped rather than surfaced as errors - a partial result
	// from N of the requested battles is more useful than failing the whole popup over one.
	// Also pulls /api/avatars/{id}/statistics for the avatar's all-time win rates by battle
	// type - a separate, cheap call folded into the same throttled chain (still 500ms between
	// every request) rather than fired in parallel with the per-battle fetches below.
	async function fetchAvatarBattleData(avatarId, onProgress) {
		const listResponse = await fetch(`/api/avatars/${avatarId}/battles`);
		if (!listResponse.ok) throw new Error('battles list request failed');
		const listData = await listResponse.json();
		const battleIds = (listData.data || []).slice(0, RECENT_BATTLES_COUNT).map((battle) => battle.id);

		await sleep(API_CALL_DELAY_MS);
		const winRatesResponse = await fetch(`/api/avatars/${avatarId}/statistics`).catch(() => null);
		const winRates = winRatesResponse && winRatesResponse.ok ? await winRatesResponse.json().catch(() => null) : null;

		const battles = [];
		for (let index = 0; index < battleIds.length; index++) {
			await sleep(API_CALL_DELAY_MS);
			onProgress(index + 1, battleIds.length);
			const response = await fetch(`/api/battles/${battleIds[index]}`).catch(() => null);
			if (!response || !response.ok) continue;
			const battle = await response.json().catch(() => null);
			const stats = battle && findOwnBattleStats(battle, avatarId);
			if (stats) battles.push(stats);
		}
		return { battles, winRates };
	}

	function aggregateBattleStats(battles) {
		const sum = (key) => battles.reduce((total, battle) => total + battle[key], 0);
		const decided = battles.filter((battle) => battle.won === true || battle.won === false);
		const wins = decided.filter((battle) => battle.won === true).length;
		return {
			count: battles.length,
			maxDamageDone: Math.max(...battles.map((battle) => battle.maxDamageDone)),
			totalDamageDone: sum('damageDone'),
			totalDamageTaken: sum('damageTaken'),
			totalCriticalHits: sum('criticalHits'),
			totalHitsLandedByOwnSide: sum('hitsLandedByOwnSide'),
			totalAttacksAgainst: sum('attacksAgainst'),
			totalDodges: sum('dodges'),
			totalBlocks: sum('blocks'),
			avgDamageDone: sum('damageDone') / battles.length,
			wins,
			decided: decided.length
		};
	}

	function formatBattleDate(iso) {
		if (!iso) return '-';
		const date = new Date(iso);
		if (Number.isNaN(date.getTime())) return '-';
		return `${date.toLocaleDateString('sv-SE')} ${date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`;
	}

	function closeStatsPopup(backdrop) {
		backdrop.remove();
		document.removeEventListener('keydown', backdrop.lanistaKeyHandler);
	}

	function openStatsPopup(avatarId, fallbackName) {
		const backdrop = document.createElement('div');
		backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';

		const modal = document.createElement('div');
		modal.className = 'bg-card text-card-foreground rounded border shadow-xl border-border/70';
		modal.style.cssText = 'max-width:440px;width:100%;max-height:80vh;overflow-y:auto;position:relative;';
		backdrop.appendChild(modal);

		const closeButton = document.createElement('button');
		closeButton.type = 'button';
		closeButton.textContent = '✕';
		closeButton.style.cssText = 'position:absolute;top:8px;right:8px;cursor:pointer;background:none;border:none;font-size:14px;line-height:1;padding:4px;';
		closeButton.addEventListener('click', () => closeStatsPopup(backdrop));
		modal.appendChild(closeButton);

		const body = document.createElement('div');
		body.className = 'px-2 md:px-4 py-2 space-y-1';
		modal.appendChild(body);

		const heading = document.createElement('p');
		heading.className = 'mb-1 font-semibold';
		heading.textContent = fallbackName ? `${fallbackName} - senaste matcherna` : 'Senaste matcherna';
		body.appendChild(heading);

		const status = document.createElement('div');
		status.className = 'text-muted-foreground text-xs';
		status.textContent = 'Hämtar matcher...';
		body.appendChild(status);

		backdrop.lanistaKeyHandler = (event) => {
			if (event.key === 'Escape') closeStatsPopup(backdrop);
		};
		document.addEventListener('keydown', backdrop.lanistaKeyHandler);
		backdrop.addEventListener('click', (event) => {
			if (event.target === backdrop) closeStatsPopup(backdrop);
		});

		document.body.appendChild(backdrop);

		fetchAvatarBattleData(avatarId, (done, total) => {
			status.textContent = `Hämtar match ${done} av ${total}...`;
		}).then(({ battles, winRates }) => {
			if (!backdrop.isConnected) return;
			if (battles.length) heading.textContent = `${battles[0].fighterName} - senaste ${battles.length} matcherna`;
			renderStatsResults(body, status, battles, winRates);
		}).catch(() => {
			if (!backdrop.isConnected) return;
			status.textContent = 'Kunde inte hämta matchdata.';
		});
	}

	function renderStatsResults(body, status, battles, winRates) {
		if (!battles.length) {
			status.textContent = 'Ingen matchdata hittades.';
			return;
		}
		status.remove();

		const summary = aggregateBattleStats(battles);
		const summaryLines = document.createElement('div');
		summaryLines.className = 'text-muted-foreground text-xs space-y-0.5';
		[
			`Högsta skada i en attack: ${summary.maxDamageDone}`,
			`Snittskada per match: ${summary.avgDamageDone.toFixed(1)}`,
			`Undveks: ${formatPercent(summary.totalDodges, summary.totalAttacksAgainst)} (${summary.totalDodges}/${summary.totalAttacksAgainst})`,
			`Blockerade: ${formatPercent(summary.totalBlocks, summary.totalAttacksAgainst)} (${summary.totalBlocks}/${summary.totalAttacksAgainst})`,
			`Kritiska träffar: ${formatPercent(summary.totalCriticalHits, summary.totalHitsLandedByOwnSide)} (${summary.totalCriticalHits}/${summary.totalHitsLandedByOwnSide})`,
			summary.decided ? `Vinstprocent: ${formatPercent(summary.wins, summary.decided)} (${summary.wins}/${summary.decided})` : null,
			// Less interesting on their own (a duel with 2 rounds vs. 10 rounds makes these hard to
			// compare match to match) - kept last so the rate-based stats above get read first.
			`Total skada utdelad: ${summary.totalDamageDone}`,
			`Total skada mottagen: ${summary.totalDamageTaken}`
		].filter(Boolean).forEach((text, index) => {
			if (index > 0) summaryLines.appendChild(document.createElement('br'));
			summaryLines.appendChild(document.createTextNode(text));
		});
		body.appendChild(summaryLines);

		const winRateLines = WIN_RATE_CATEGORIES
			.map(({ key, label }) => {
				const entry = winRates && winRates[key];
				if (!entry) return null;
				return `${label}: ${formatPercent(entry.wins, entry.total)} (${entry.wins}/${entry.total})`;
			})
			.filter(Boolean);
		if (winRateLines.length) {
			body.appendChild(document.createElement('hr'));
			const winRateBlock = document.createElement('div');
			winRateBlock.className = 'text-muted-foreground text-xs space-y-0.5';
			winRateLines.forEach((text, index) => {
				if (index > 0) winRateBlock.appendChild(document.createElement('br'));
				winRateBlock.appendChild(document.createTextNode(text));
			});
			body.appendChild(winRateBlock);
		}

		const listHeading = document.createElement('p');
		listHeading.className = 'mt-2 mb-1 font-semibold';
		listHeading.textContent = 'Matcher';
		body.appendChild(listHeading);

		const list = document.createElement('div');
		list.className = 'space-y-1';
		battles.forEach((battle) => {
			const row = document.createElement('a');
			row.href = `/game/arena/battles/${battle.id}`;
			row.target = '_blank';
			row.rel = 'noopener';
			row.className = 'block rounded border border-border/60 bg-muted/35 px-2 py-1 text-xs hover:underline';
			const result = battle.won === true ? 'Vinst' : battle.won === false ? 'Förlust' : '-';
			const vs = battle.opponents.length ? ` mot ${battle.opponents.join(', ')}` : '';
			const attackedFirst = battle.attackedFirst
				? ` · Anföll först ${battle.attackedFirst.count}/${battle.attackedFirst.total} ronder`
				: '';
			row.textContent = `${formatBattleDate(battle.createdAt)} · ${battle.typeDisplay}${vs} · ${result} · Skada ${battle.damageDone} (max ${battle.maxDamageDone}), mottog ${battle.damageTaken}${attackedFirst}`;
			list.appendChild(row);
		});
		body.appendChild(list);
	}

	function createStatsTriggerButton(avatarId, avatarName) {
		const button = document.createElement('span');
		button.textContent = '📊';
		button.title = 'Senaste matcher';
		button.dataset.lanistaStatsButton = 'true';
		button.style.cssText = 'display:inline-block;margin-right:4px;cursor:pointer;';
		button.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (button.dataset.lanistaStatsLoading) return;
			button.dataset.lanistaStatsLoading = 'true';
			button.style.opacity = '0.5';
			openStatsPopup(avatarId, avatarName);
			setTimeout(() => {
				delete button.dataset.lanistaStatsLoading;
				button.style.opacity = '';
			}, API_CALL_DELAY_MS);
		});
		return button;
	}

	// Runs unconditionally on every page (not gated to a specific path like the other
	// features below) since the eye-icon + avatar-link pattern this hooks into shows up all
	// over the site - guild member lists, battle team headers, arena rankings, etc.
	function scanAvatarInspectButtons() {
		document.querySelectorAll('i.fa-eye').forEach((icon) => {
			const wrapper = findEyeIconWrapper(icon);
			if (!wrapper) return;
			const next = wrapper.nextElementSibling;
			if (!next || (next.dataset && next.dataset.lanistaStatsButton)) return;
			const avatarId = avatarIdFromHref(next.getAttribute('href'));
			if (!avatarId) return;
			const avatarName = next.textContent.trim().replace(/\s*\([^)]*\)\s*$/, '');
			wrapper.parentNode.insertBefore(createStatsTriggerButton(avatarId, avatarName), next);
		});
	}

	const pageFeatures = [
		{
			paths: ['/game/market/craft/available'],
			run: scanCraftPage
		},
		{
			paths: ['/game/arena/battles/'],
			run: scanBattlePage
		}
	];

	function runPageFeatures() {
		scanAvatarInspectButtons();
		pageFeatures
			.filter((feature) => feature.paths.some((path) => location.pathname.startsWith(path)))
			.forEach((feature) => feature.run());
	}

	function scheduleFeatureScan() {
		clearTimeout(scanTimer);
		scanTimer = setTimeout(runPageFeatures, 100);
	}

	new MutationObserver(scheduleFeatureScan).observe(document.body, { childList: true, subtree: true });
	scheduleFeatureScan();
})();
