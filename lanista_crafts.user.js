// ==UserScript==
// @name        Lanista scripts
// @namespace   Violentmonkey Scripts
// @icon        data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAC5UlEQVQ4T6WTS0gbYRSFz6+jySAaEQtqFiJEKaLQLEpwo5L6AmEkEnxU69KpRsTQwtStGylpjRvdWSxoJTF2obhQLAhiEIoU20TbWhVrlYQ2JkYZdZhxyvwS6QO66VnNhXO/ew78Q/CfIjdfv6i7u5snhPhGRkYi2tzb2/uAYZjloaGhg4QnIQro6up6mJmZOT04OEgXeJ7/pijKgSzLHePj49sOh2OJZVkjIaTT5XKtaEBZlpdHR0cPKKCnp+eQZdmvADpcLte20+l85Ha7n1/fAP6ceZ5fkmU5T1EUngL6+voeDw8PP0sYnE6n0+12u/8x3wApQBCEJ4IgBJKTiTUaPbkjSZI5Ho8nhcNhPcMwik6nk0tLS3clSfrM6nRvPdPT2TzPCxQQiUTqRFF8LUkSOzY2hlAohJKSEuTl5WJhYZFezM/PR1lZGXw+HwoKCtDU1ISsrKxVVVU7SfT4+PurqalsQgiMRiNmZ2eRmpqK5uZm+P1+XF1doaioEBsb73F0dISqqntgmBQoioyamtpPZH9/X1xcXGQ1c05ODurr6xEOhxCLneDi4gIamGVZGAwZyMgwUOje3h7MZjNsNluUbG5uigDYQOADtre/wGQyYWdnB7Is0/gJaaDCQhO2tj7SShaLRUt3DYjH42xaWho1SpIEvV6Ps7MzXF5e0gpapfT0dJyfn9M0mrQDDMNcAzweD1tXVwdVVelySkoKwuEwgsEgNRcXF9N6Gkw7oKWZm5uD3W6PkmAwKHq9XrayshLr6+sUUltbC6/XC1HU2oEmaGlpwcrKCk1WXl6O+fl5tLa2RkkgEHjp8/k6KioqKOD09BQcx2FycpIuJ9TY2EgBiqLAarXSBO3t7W+IqqpEEIT7HMc51tbWLNoDamho+Atgs9mwurpKu1dXVx/OzMy8aGtre/rb39jf339Lp9Pd5Tju9sTERG5SUpJBVVUGgGi323/4/f7dWCz2bmBgIEAIUbWdn0Q7ZfawRhyhAAAAAElFTkSuQmCC
// @version     1.4.0
//
// @match       https://lanista.se/game/*
// @grant       none
//
// @author      -
// @description Adds material and effect columns to the craft table.
// ==/UserScript==

(function () {
	'use strict';

	const itemCache = new Map();
	let craftsPromise;
	let currentAvatarPromise;
	let scanTimer;

	function itemEndpoint(craft) {
		if (craft.is_consumable) return 'consumables';
		if (craft.is_weapon) return 'weapons';
		if (craft.is_armor) return 'armors';
		if (craft.is_trinket) return 'trinkets';
		return 'materials';
	}

	function formatMaterials(craft) {
		return (craft.material_requirements || [])
			.map((requirement) => `${requirement.quantity} x ${requirement.material.name}`)
			.join(', ') || '-';
	}

	function stripMarkup(value) {
		const element = document.createElement('div');
		element.innerHTML = value || '';
		return element.textContent.trim();
	}

	function formatEffects(item) {
		return (item?.bonuses || [])
			.map((bonus) => {
				const value = stripMarkup(bonus.bonus_value_display);
				const name = stripMarkup(bonus.bonusable_name).replace(/^vapenfärdigheten\s+/i, '');
				return [value, name].filter(Boolean).join(' ');
			})
			.filter(Boolean)
			.join(', ') || '-';
	}

	async function getItem(craft) {
		if (!craft.id) return null;
		const endpoint = `/api/items/${itemEndpoint(craft)}/${craft.id}`;
		if (!itemCache.has(endpoint)) {
			itemCache.set(endpoint, fetch(endpoint).then((response) => response.ok ? response.json() : null));
		}
		return itemCache.get(endpoint);
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

	async function loadRecipe(craft, materialsCell, effectsCell) {
		materialsCell.textContent = formatMaterials(craft);
		const item = await getItem(craft);
		effectsCell.textContent = formatEffects(item);
	}

	async function getCrafts() {
		if (!craftsPromise) craftsPromise = fetch('/api/crafts').then((response) => response.ok ? response.json() : []);
		return craftsPromise;
	}

	async function addColumns(table) {
		const header = table.tHead && table.tHead.rows[0];
		if (!header || header.querySelector('[data-lanista-crafts-column]') || table.dataset.lanistaCraftsLoading) return;
		table.dataset.lanistaCraftsLoading = 'true';
		const crafts = await getCrafts();

		const headers = ['Material', 'Effekter'];
		const priceHeader = Array.from(header.cells).find((cell) => cell.innerText.trim().toLowerCase() === 'pris');
		const insertAt = priceHeader ? priceHeader.cellIndex + 1 : header.cells.length;

		headers.forEach((label, offset) => {
			const cell = document.createElement('th');
			cell.textContent = label;
			cell.dataset.lanistaCraftsColumn = 'true';
			cell.className = 'text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap';
			header.insertBefore(cell, header.cells[insertAt + offset] || null);
		});

		Array.from(table.tBodies).forEach((body) => {
			Array.from(body.rows).forEach((row) => {
				if (row.querySelector('[data-lanista-crafts-row]')) return;
				const name = row.cells[0]?.innerText.trim();
				if (!name) return;
				const craft = findCraft(crafts, row);

				const materialsCell = document.createElement('td');
				const effectsCell = document.createElement('td');
				[materialsCell, effectsCell].forEach((cell) => {
					cell.dataset.lanistaCraftsRow = 'true';
					cell.textContent = craft ? '...' : '-';
					cell.className = 'p-2 align-middle';
				});

				row.insertBefore(materialsCell, row.cells[insertAt] || null);
				row.insertBefore(effectsCell, row.cells[insertAt + 1] || null);
				if (craft) {
					loadRecipe(craft, materialsCell, effectsCell).catch(() => {
						effectsCell.textContent = '-';
					});
				}
			});
		});
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

	function summarizeRound(round, currentName) {
		const text = Array.from(round.querySelectorAll('.battle-text'))
			.map((element) => element.innerText.replace(/\s+/g, ' ').trim())
			.join(' ');
		const names = Array.from(round.querySelectorAll('green, red'))
			.map((element) => element.innerText.trim())
			.filter(Boolean)
			.filter((name, index, all) => all.indexOf(name) === index);
		const stats = new Map(names.map((name) => [name, {
			damageDone: 0,
			damageTaken: 0,
			maxDamageDone: 0,
			dodges: 0,
			parries: 0,
			blocks: 0,
			misses: 0
		}]));

		const sentences = text.split(/\.\s+/);
		const namesIn = (sentence) => names
			.map((name) => ({ name, position: sentence.lastIndexOf(name) }))
			.filter(({ position }) => position >= 0)
			.sort((left, right) => left.position - right.position)
			.map(({ name }) => name);
		sentences.forEach((sentence) => {
			const mentionedNames = namesIn(sentence);
			if (!mentionedNames.length) return;
			const firstName = mentionedNames[0];
			const lastName = mentionedNames[mentionedNames.length - 1];
			if (/misslyckas[^.]*undvik/i.test(sentence)) incrementStat(stats, firstName, 'misses');
			else if (/undvik/i.test(sentence)) incrementStat(stats, lastName, 'dodges');
			if (/lyckas parera|parera med/i.test(sentence)) incrementStat(stats, lastName, 'parries');
			if (!/misslyckas/i.test(sentence) && /blockera|absorberas/i.test(sentence)) incrementStat(stats, lastName, 'blocks');
		});

		for (const match of text.matchAll(/skad(?:ar|as)(?: sig)?[^.()]{0,100}\((\d+)\s*\)/gi)) {
			const sentenceStart = text.lastIndexOf('.', match.index) + 1;
			const sentence = text.slice(sentenceStart, match.index + match[0].length);
			const mentionedNames = namesIn(sentence);
			if (mentionedNames.length < 1) continue;
			const target = mentionedNames[mentionedNames.length - 1];
			const attacker = mentionedNames.length > 1 ? mentionedNames[0] : null;
			const damage = Number(match[1]);
			stats.get(target).damageTaken += damage;
			if (attacker && attacker !== target) {
				stats.get(attacker).damageDone += damage;
				stats.get(attacker).maxDamageDone = Math.max(stats.get(attacker).maxDamageDone, damage);
			}
		}

		return names.filter((name) => name !== currentName).map((name) => ({ name, ...stats.get(name) }));
	}

	function addParticipantSummaries(round, currentName, damageTakenTotals) {
		if (round.querySelector('[data-lanista-battle-summaries]')) return;
		const participants = summarizeRound(round, currentName);
		if (!participants.length) return;
		const container = document.createElement('div');
		container.dataset.lanistaBattleSummaries = 'true';
		container.className = 'mt-2 space-y-1';
		participants.forEach((participant) => {
			const totalDamageTaken = (damageTakenTotals.get(participant.name) || 0) + participant.damageTaken;
			damageTakenTotals.set(participant.name, totalDamageTaken);
			const panel = document.createElement('div');
			panel.className = 'rounded border border-border/60 bg-muted/35 px-2 py-1 text-xs';
			panel.innerHTML = '<span class="font-semibold"></span><span class="text-muted-foreground"></span>';
			const [nameElement, detailsElement] = panel.querySelectorAll('span');
			nameElement.textContent = participant.name;
			detailsElement.textContent = ` -${participant.damageTaken} KP (${totalDamageTaken} totalt), gjorde ${participant.damageDone}, max ${participant.maxDamageDone}, undvek ${participant.dodges}, parerade ${participant.parries}, blockerade ${participant.blocks}, missade ${participant.misses}`;
			container.appendChild(panel);
		});
		round.appendChild(container);
	}

	async function scanBattlePage() {
		if (!currentAvatarPromise) {
			currentAvatarPromise = fetch('/api/avatars/me')
				.then((response) => response.ok ? response.json() : null)
				.then((avatar) => avatar?.name || avatar?.avatar?.name || '')
				.catch(() => '');
		}
		const currentName = await currentAvatarPromise;
		const damageTakenTotals = new Map();
		document.querySelectorAll('p.font-semibold').forEach((heading) => {
			if (!/^Runda \d+$/.test(heading.innerText.trim())) return;
			addParticipantSummaries(heading.parentElement, currentName, damageTakenTotals);
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
