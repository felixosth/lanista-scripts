// ==UserScript==
// @name        Lanista scripts
// @namespace   Violentmonkey Scripts
// @icon        data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAC5UlEQVQ4T6WTS0gbYRSFz6+jySAaEQtqFiJEKaLQLEpwo5L6AmEkEnxU69KpRsTQwtStGylpjRvdWSxoJTF2obhQLAhiEIoU20TbWhVrlYQ2JkYZdZhxyvwS6QO66VnNhXO/ew78Q/CfIjdfv6i7u5snhPhGRkYi2tzb2/uAYZjloaGhg4QnIQro6up6mJmZOT04OEgXeJ7/pijKgSzLHePj49sOh2OJZVkjIaTT5XKtaEBZlpdHR0cPKKCnp+eQZdmvADpcLte20+l85Ha7n1/fAP6ceZ5fkmU5T1EUngL6+voeDw8PP0sYnE6n0+12u/8x3wApQBCEJ4IgBJKTiTUaPbkjSZI5Ho8nhcNhPcMwik6nk0tLS3clSfrM6nRvPdPT2TzPCxQQiUTqRFF8LUkSOzY2hlAohJKSEuTl5WJhYZFezM/PR1lZGXw+HwoKCtDU1ISsrKxVVVU7SfT4+PurqalsQgiMRiNmZ2eRmpqK5uZm+P1+XF1doaioEBsb73F0dISqqntgmBQoioyamtpPZH9/X1xcXGQ1c05ODurr6xEOhxCLneDi4gIamGVZGAwZyMgwUOje3h7MZjNsNluUbG5uigDYQOADtre/wGQyYWdnB7Is0/gJaaDCQhO2tj7SShaLRUt3DYjH42xaWho1SpIEvV6Ps7MzXF5e0gpapfT0dJyfn9M0mrQDDMNcAzweD1tXVwdVVelySkoKwuEwgsEgNRcXF9N6Gkw7oKWZm5uD3W6PkmAwKHq9XrayshLr6+sUUltbC6/XC1HU2oEmaGlpwcrKCk1WXl6O+fl5tLa2RkkgEHjp8/k6KioqKOD09BQcx2FycpIuJ9TY2EgBiqLAarXSBO3t7W+IqqpEEIT7HMc51tbWLNoDamho+Atgs9mwurpKu1dXVx/OzMy8aGtre/rb39jf339Lp9Pd5Tju9sTERG5SUpJBVVUGgGi323/4/f7dWCz2bmBgIEAIUbWdn0Q7ZfawRhyhAAAAAElFTkSuQmCC
// @version     1.6.3
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

	function summarizeRound(round, currentName) {
		// A crit is rendered as an icon (no text content) next to the damage figure, so it's
		// invisible to innerText/regex - track which .battle-text element each character of
		// the joined `text` string came from (and whether that element contains a crit icon)
		// so a damage match's position can be traced back to it. The icon class is inferred
		// from this repo's captured battle API JSON (fa-stars), not confirmed against the
		// live DOM (this script has never called that API) - if crit rate reads 0% on a
		// battle that clearly had crits, inspect a known-crit round's live DOM and adjust it.
		const battleTextNodes = Array.from(round.querySelectorAll('.battle-text'));
		const nodeSpans = [];
		let text = '';
		battleTextNodes.forEach((element, index) => {
			const nodeText = element.innerText.replace(/\s+/g, ' ').trim();
			const start = text.length;
			text += nodeText;
			nodeSpans.push({ start, end: text.length, hasCrit: !!element.querySelector('.fa-stars, [class*="fa-star"]') });
			if (index < battleTextNodes.length - 1) text += ' ';
		});
		const isCritAt = (offset) => {
			const span = nodeSpans.find((span) => offset >= span.start && offset < span.end)
				|| nodeSpans.slice().reverse().find((span) => span.end <= offset);
			return span ? span.hasCrit : false;
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
			const hasAttackerTarget = mentionedNames.length > 1 && firstName !== lastName;
			// A "glancing" dodge/parry/block still deals reduced damage described in the same
			// sentence (the game models these as distinct from a full evasion - see
			// round_stats.glancing_dodges etc in the example battle JSON in this repo). The
			// damage-regex loop below is the source of truth for anything that actually dealt
			// damage, so skip these defensive-outcome counters when the sentence also carries
			// a damage figure - otherwise the same exchange gets counted as both a landed hit
			// and a full evasion, inflating attacksAgainst/attacksMade past 100%.
			const hasDamageFigure = /skad(?:ar|as)(?: sig)?[^.()]{0,100}\(\d+\s*\)/i.test(sentence);
			if (!hasDamageFigure) {
				if (/misslyckas[^.]*undvik/i.test(sentence)) {
					incrementStat(stats, firstName, 'misses');
					if (hasAttackerTarget) incrementStat(stats, firstName, 'attacksMade');
				} else if (/undvik/i.test(sentence)) {
					incrementStat(stats, lastName, 'dodges');
					if (hasAttackerTarget) {
						incrementStat(stats, firstName, 'attacksMade');
						incrementStat(stats, firstName, 'evadedByDodge');
						incrementStat(stats, lastName, 'attacksAgainst');
					}
				}
				if (/lyckas parera|parera med/i.test(sentence)) {
					incrementStat(stats, lastName, 'parries');
					if (hasAttackerTarget) {
						incrementStat(stats, firstName, 'attacksMade');
						incrementStat(stats, firstName, 'evadedByParry');
						incrementStat(stats, lastName, 'attacksAgainst');
					}
				}
				if (!/misslyckas/i.test(sentence) && /blockera|absorberas/i.test(sentence)) {
					incrementStat(stats, lastName, 'blocks');
					if (hasAttackerTarget) {
						incrementStat(stats, firstName, 'attacksMade');
						incrementStat(stats, firstName, 'evadedByBlock');
						incrementStat(stats, lastName, 'attacksAgainst');
					}
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
			stats.get(target).damageTaken += damage;
			stats.get(target).attacksAgainst++;
			stats.get(target).hitsTaken++;
			if (attacker && attacker !== target) {
				stats.get(attacker).damageDone += damage;
				stats.get(attacker).maxDamageDone = Math.max(stats.get(attacker).maxDamageDone, damage);
				stats.get(attacker).attacksMade++;
				stats.get(attacker).hitsLanded++;
				if (isCritAt(match.index + match[0].length - 1)) stats.get(attacker).crits++;
			}
		}

		return names.map((name) => ({ name, side: sideByName.get(name), isSelf: name === currentName, ...stats.get(name) }));
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
		line3.textContent = ` Försvar: träffades ${formatPercent(participant.hitsTaken, participant.attacksAgainst)} (${participant.hitsTaken}/${participant.attacksAgainst}), undvek ${formatPercent(participant.dodges, participant.attacksAgainst)}, parerade ${formatPercent(participant.parries, participant.attacksAgainst)}, blockerade ${formatPercent(participant.blocks, participant.attacksAgainst)}`;

		panel.appendChild(nameElement);
		panel.appendChild(line1);
		panel.appendChild(line2);
		panel.appendChild(line3);
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

	function renderBattleTotals(host, beforeNode, totals, battleTeamDamage, battleTeamSize) {
		const entries = Array.from(totals, ([name, stats]) => ({ name, ...stats }));
		const signature = JSON.stringify(entries);
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
				teamSize: battleTeamSize.get(participant.side) || 1
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
		rounds.forEach(({ container }) => {
			const participants = summarizeRound(container, currentName);
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
			const battleEntries = Array.from(totals.values());
			const battleTeamDamage = sumBySide(battleEntries, 'damageDone');
			const battleTeamSize = countBySide(battleEntries);
			const firstCard = rounds[0].container.parentElement;
			renderBattleTotals(firstCard.parentElement, firstCard, totals, battleTeamDamage, battleTeamSize);
		}
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
