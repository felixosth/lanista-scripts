// Fight animation module for the Lanista scripts userscript (lanista_crafts.user.js).
// Loaded via @require so this feature lives outside the main script file. Exposes a single
// window.LanistaFightAnimation object; the main script only needs to call maybeShowForBattle()
// from its page-feature router and drop renderSettingsToggle() into the battle-summary card.
(function () {
	'use strict';

	// Not "duel"/"1v1"-specific on purpose - team battles may get the same treatment later.
	const STORAGE_KEY = 'lanista-fight-animation-enabled';
	const shownBattleIds = new Set();

	function isEnabled() {
		const stored = localStorage.getItem(STORAGE_KEY);
		return stored === null ? true : stored === 'true';
	}

	function setEnabled(value) {
		localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
	}

	// Mirrors the existing excludeBotsCheckbox pattern in lanista_crafts.user.js's analyzer
	// modal (same label/checkbox shape, same muted-text utility classes) so it looks native
	// wherever the main script drops it in.
	function renderSettingsToggle() {
		const label = document.createElement('label');
		label.className = 'flex items-center gap-1.5 text-xs text-muted-foreground';
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.checked = isEnabled();
		checkbox.addEventListener('change', () => setEnabled(checkbox.checked));
		label.append(checkbox, document.createTextNode('Visa duellanimation'));
		return label;
	}

	async function fetchJson(url) {
		try {
			const response = await fetch(url);
			return response.ok ? await response.json() : null;
		} catch {
			return null;
		}
	}

	async function fetchPortraitUrl(avatarId) {
		const avatar = await fetchJson(`/api/avatars/${avatarId}`);
		return (avatar && avatar.asset && avatar.asset.url) || null;
	}

	function loadImage(url, crossOrigin) {
		return new Promise((resolve, reject) => {
			const img = new Image();
			if (crossOrigin) img.crossOrigin = crossOrigin;
			img.addEventListener('load', () => resolve(img), { once: true });
			img.addEventListener('error', () => reject(new Error(`failed to load ${url}`)), { once: true });
			img.src = url;
		});
	}

	// Flood-fills in from every image edge, turning any near-white, low-saturation pixel
	// connected to the border into (feathered) alpha - same technique as the reference
	// Untitled-1.html's removeWhiteBackground, so a plain white-background portrait photo reads
	// as a floating character instead of a white card sitting on the versus gradient. Throws if
	// the canvas is CORS-tainted (see tryRemoveWhiteBackground for the fallback).
	function removeWhiteBackground(img, { threshold = 215, colorTolerance = 40, feather = 35 } = {}) {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		canvas.width = img.naturalWidth;
		canvas.height = img.naturalHeight;
		ctx.drawImage(img, 0, 0);

		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const data = imageData.data;
		const width = canvas.width;
		const height = canvas.height;
		const visited = new Uint8Array(width * height);
		const queue = [];

		function isBackgroundPixel(x, y) {
			const index = (y * width + x) * 4;
			const r = data[index];
			const g = data[index + 1];
			const b = data[index + 2];
			const brightness = (r + g + b) / 3;
			const max = Math.max(r, g, b);
			const min = Math.min(r, g, b);
			return brightness >= threshold && max - min <= colorTolerance;
		}

		function enqueue(x, y) {
			if (x < 0 || y < 0 || x >= width || y >= height) return;
			const pixelIndex = y * width + x;
			if (visited[pixelIndex] || !isBackgroundPixel(x, y)) return;
			visited[pixelIndex] = 1;
			queue.push(pixelIndex);
		}

		for (let x = 0; x < width; x++) { enqueue(x, 0); enqueue(x, height - 1); }
		for (let y = 0; y < height; y++) { enqueue(0, y); enqueue(width - 1, y); }

		let cursor = 0;
		while (cursor < queue.length) {
			const pixelIndex = queue[cursor++];
			const x = pixelIndex % width;
			const y = Math.floor(pixelIndex / width);
			enqueue(x + 1, y);
			enqueue(x - 1, y);
			enqueue(x, y + 1);
			enqueue(x, y - 1);
		}

		const fullyTransparentAt = Math.min(255, threshold + feather);
		for (let pixelIndex = 0; pixelIndex < visited.length; pixelIndex++) {
			if (!visited[pixelIndex]) continue;
			const index = pixelIndex * 4;
			const brightness = (data[index] + data[index + 1] + data[index + 2]) / 3;
			if (brightness >= fullyTransparentAt) { data[index + 3] = 0; continue; }
			const range = Math.max(1, fullyTransparentAt - threshold);
			const amount = (brightness - threshold) / range;
			data[index + 3] = Math.max(0, Math.min(255, Math.round(255 * (1 - amount))));
		}

		ctx.putImageData(imageData, 0, 0);
		return canvas.toDataURL('image/png');
	}

	// Best-effort: reading pixels off a canvas requires the image to have loaded with CORS
	// (Access-Control-Allow-Origin) - the CDN serving portraits may or may not send that header.
	// Loads a separate crossOrigin='anonymous' probe rather than setting crossOrigin on the
	// portrait <img> itself, so a CDN that rejects CORS just leaves the original (opaque) image
	// showing instead of failing to load at all.
	async function tryRemoveWhiteBackground(url) {
		try {
			const probe = await loadImage(url, 'anonymous');
			return removeWhiteBackground(probe);
		} catch {
			return null;
		}
	}

	async function resolvePortrait(avatarId) {
		const rawUrl = await fetchPortraitUrl(avatarId);
		if (!rawUrl) return null;
		const transparent = await tryRemoveWhiteBackground(rawUrl);
		return transparent || rawUrl;
	}

	// ---- Modal markup, styles and animation ----

	function ensureStyles() {
		if (document.querySelector('style[data-lanista-fight-animation-style]')) return;
		const style = document.createElement('style');
		style.dataset.lanistaFightAnimationStyle = 'true';
		style.textContent = `
			.lfa-backdrop {
				position: fixed;
				inset: 0;
				z-index: 2147483000;
				background: rgba(0, 0, 0, .92);
				display: flex;
				align-items: center;
				justify-content: center;
				padding: 16px;
				opacity: 1;
			}
			.lfa-versus {
				position: relative;
				width: min(1100px, 100%);
				aspect-ratio: 16 / 9;
				overflow: hidden;
				background: #08090d;
				border-radius: 10px;
				isolation: isolate;
				box-shadow: 0 20px 60px rgba(0, 0, 0, .6);
			}
			.lfa-player {
				position: absolute;
				inset: 0;
				width: 58%;
				overflow: hidden;
			}
			.lfa-player-left {
				left: 0;
				background:
					radial-gradient(circle at 30% 40%, rgba(255, 90, 55, .38), transparent 42%),
					linear-gradient(115deg, #651713, #250708 67%, transparent 68%);
				clip-path: polygon(0 0, 100% 0, 82% 100%, 0 100%);
			}
			.lfa-player-right {
				left: auto;
				right: 0;
				background:
					radial-gradient(circle at 70% 40%, rgba(50, 130, 255, .42), transparent 42%),
					linear-gradient(245deg, #164779, #071426 67%, transparent 68%);
				clip-path: polygon(18% 0, 100% 0, 100% 100%, 0 100%);
			}
			.lfa-portrait {
				position: absolute;
				inset: 7%;
				width: 86%;
				height: 86%;
				object-fit: contain;
				object-position: center center;
				border-radius: 10px;
				filter: grayscale(1) contrast(1.12) brightness(1);
				opacity: 0;
				will-change: transform, opacity, filter;
			}
			.lfa-player-left .lfa-portrait { transform: translateX(-110%); }
			.lfa-player-right .lfa-portrait { transform: translateX(110%); }
			.lfa-player-name {
				position: absolute;
				z-index: 20;
				bottom: 6%;
				font-family: Arial, Helvetica, sans-serif;
				font-weight: 1000;
				font-style: italic;
				text-transform: uppercase;
				color: #fff;
				opacity: 0;
				white-space: nowrap;
				text-shadow: 0 4px 0 #000, 0 0 22px rgba(255, 255, 255, .25);
			}
			.lfa-name-left {
				left: 4%;
				font-size: clamp(20px, 3.6vw, 52px);
				transform: translateX(-60px);
			}
			.lfa-name-right {
				right: 4%;
				max-width: 46%;
				text-align: right;
				font-size: clamp(13px, 2.4vw, 36px);
				transform: translateX(60px);
			}
			.lfa-vs {
				position: absolute;
				z-index: 30;
				left: 50%;
				top: 47%;
				transform: translate(-50%, -50%) scale(3) rotate(-7deg);
				opacity: 0;
				font-family: Arial, Helvetica, sans-serif;
				font-size: clamp(70px, 13vw, 170px);
				line-height: 1;
				font-weight: 1000;
				font-style: italic;
				letter-spacing: -.12em;
				color: #eee;
				-webkit-text-stroke: 3px #111;
				text-shadow: -8px 5px 0 #94241e, 8px -5px 0 #276aaf, 0 0 30px rgba(255, 255, 255, .8);
			}
			.lfa-center-slash {
				position: absolute;
				z-index: 25;
				left: 50%;
				top: -10%;
				width: 5px;
				height: 120%;
				opacity: 0;
				background: linear-gradient(transparent, white 15%, white 85%, transparent);
				transform: translateX(-50%) rotate(18deg) scaleY(0);
				box-shadow: -11px 0 32px #ff3c2c, 11px 0 32px #338cff;
			}
			.lfa-finisher {
				position: absolute;
				z-index: 50;
				left: -20%;
				top: 50%;
				width: 140%;
				height: 13px;
				opacity: 0;
				background: linear-gradient(90deg, transparent, white 22%, white 70%, transparent);
				transform: rotate(-14deg) scaleX(.05);
				transform-origin: center;
				pointer-events: none;
				filter: drop-shadow(0 0 8px white) drop-shadow(0 0 30px currentColor);
			}
			.lfa-impact {
				position: absolute;
				z-index: 60;
				left: 50%;
				top: 50%;
				width: 10px;
				height: 10px;
				border-radius: 50%;
				background: #fff;
				opacity: 0;
				transform: translate(-50%, -50%) scale(.1);
				box-shadow: 0 0 30px #fff, 0 0 110px #fff;
			}
			.lfa-flash {
				position: absolute;
				inset: 0;
				z-index: 70;
				background: #fff;
				pointer-events: none;
				opacity: 0;
			}
			.lfa-winner {
				position: absolute;
				z-index: 80;
				top: 8%;
				opacity: 0;
				transform: scale(.6);
				font-family: Arial, Helvetica, sans-serif;
				text-transform: uppercase;
				text-shadow: 0 4px 8px #000, 0 0 24px #000;
			}
			.lfa-winner-left { left: 7%; }
			.lfa-winner-right { right: 7%; text-align: right; }
			.lfa-winner-label {
				display: block;
				font-size: clamp(11px, 1.6vw, 18px);
				font-weight: 1000;
				letter-spacing: .25em;
			}
			.lfa-winner-name {
				display: block;
				margin-top: 3px;
				font-size: clamp(24px, 4.6vw, 60px);
				font-weight: 1000;
				font-style: italic;
			}

			.lfa-versus.lfa-play .lfa-player-left .lfa-portrait { animation: lfa-player-left-in .55s cubic-bezier(.15, .9, .2, 1.1) forwards; }
			.lfa-versus.lfa-play .lfa-player-right .lfa-portrait { animation: lfa-player-right-in .55s cubic-bezier(.15, .9, .2, 1.1) forwards; }
			.lfa-versus.lfa-play .lfa-center-slash { animation: lfa-center-slash .25s ease .5s forwards; }
			.lfa-versus.lfa-play .lfa-vs { animation: lfa-vs-enter .3s cubic-bezier(.2, 1.5, .3, 1) .55s forwards; }
			.lfa-versus.lfa-play .lfa-name-left { animation: lfa-left-name-in .3s ease .8s forwards; }
			.lfa-versus.lfa-play .lfa-name-right { animation: lfa-right-name-in .3s ease .8s forwards; }

			.lfa-versus.lfa-finish .lfa-finisher { animation: lfa-finisher-slash .4s cubic-bezier(.1, .9, .2, 1) forwards; }
			.lfa-versus.lfa-finish .lfa-impact { animation: lfa-impact .4s ease .13s forwards; }
			.lfa-versus.lfa-finish .lfa-flash { animation: lfa-flash .25s ease .15s forwards; }
			.lfa-versus.lfa-finish .lfa-vs { animation: lfa-fade-vs .55s ease .15s forwards; }
			.lfa-versus.lfa-finish .lfa-center-slash { animation: lfa-fade-center-slash .55s ease .15s forwards; }

			.lfa-versus.lfa-left-wins .lfa-player-right .lfa-portrait { animation: lfa-defeated-right .7s ease .15s forwards; }
			.lfa-versus.lfa-left-wins .lfa-name-right { animation: lfa-defeated-text .5s ease .15s forwards; }
			.lfa-versus.lfa-left-wins .lfa-player-left .lfa-portrait { animation: lfa-winner-left .8s ease .15s forwards; }

			.lfa-versus.lfa-right-wins .lfa-player-left .lfa-portrait { animation: lfa-defeated-left .7s ease .15s forwards; }
			.lfa-versus.lfa-right-wins .lfa-name-left { animation: lfa-defeated-text .5s ease .15s forwards; }
			.lfa-versus.lfa-right-wins .lfa-player-right .lfa-portrait { animation: lfa-winner-right .8s ease .15s forwards; }

			.lfa-versus.lfa-show-winner .lfa-winner.lfa-active { animation: lfa-show-winner .5s cubic-bezier(.2, 1.5, .3, 1) forwards; }

			@keyframes lfa-player-left-in {
				0% { opacity: 0; transform: translateX(-110%); }
				75% { opacity: 1; transform: translateX(3%); }
				100% { opacity: 1; transform: translateX(0); }
			}
			@keyframes lfa-player-right-in {
				0% { opacity: 0; transform: translateX(110%); }
				75% { opacity: 1; transform: translateX(-3%); }
				100% { opacity: 1; transform: translateX(0); }
			}
			@keyframes lfa-center-slash { to { opacity: 1; transform: translateX(-50%) rotate(18deg) scaleY(1); } }
			@keyframes lfa-vs-enter {
				0% { opacity: 0; transform: translate(-50%, -50%) scale(3) rotate(-7deg); }
				70% { opacity: 1; transform: translate(-50%, -50%) scale(.85) rotate(-7deg); }
				100% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(-7deg); }
			}
			@keyframes lfa-left-name-in { 0% { opacity: 0; transform: translateX(-60px); } 100% { opacity: 1; transform: translateX(0); } }
			@keyframes lfa-right-name-in { 0% { opacity: 0; transform: translateX(60px); } 100% { opacity: 1; transform: translateX(0); } }
			@keyframes lfa-finisher-slash {
				/* The element itself (left:-20%, width:140%) is already centered on the versus
				   box, so this must end at translateX(0) to actually rest centered - translateX
				   percentages resolve against the element's own (140%-of-parent) width, so any
				   nonzero end value leaves it visibly off-center once the animation's forwards
				   fill holds that frame. */
				0% { opacity: 0; transform: translateX(-40%) rotate(-14deg) scaleX(.05); }
				15% { opacity: 1; }
				100% { opacity: 1; transform: translateX(0) rotate(-14deg) scaleX(1); }
			}
			@keyframes lfa-impact {
				0% { opacity: 0; transform: translate(-50%, -50%) scale(.1); }
				25% { opacity: 1; }
				100% { opacity: 0; transform: translate(-50%, -50%) scale(20); }
			}
			@keyframes lfa-flash { 0% { opacity: 0; } 30% { opacity: .9; } 100% { opacity: 0; } }
			@keyframes lfa-fade-vs {
				0% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(-7deg); }
				100% { opacity: .22; transform: translate(-50%, -50%) scale(.9) rotate(-7deg); }
			}
			@keyframes lfa-fade-center-slash {
				0% { opacity: 1; transform: translateX(-50%) rotate(18deg) scaleY(1); }
				100% { opacity: .22; transform: translateX(-50%) rotate(18deg) scaleY(1); }
			}
			@keyframes lfa-defeated-right {
				0% { opacity: 1; transform: translateX(0) translateY(0) rotate(0deg) scale(1); filter: grayscale(1) contrast(1.12) brightness(1); }
				100% { opacity: .42; transform: translateX(42px) translateY(16px) rotate(2deg) scale(.96); filter: grayscale(1) contrast(1.08) brightness(.58); }
			}
			@keyframes lfa-defeated-left {
				0% { opacity: 1; transform: translateX(0) translateY(0) rotate(0deg) scale(1); filter: grayscale(1) contrast(1.12) brightness(1); }
				100% { opacity: .42; transform: translateX(-42px) translateY(16px) rotate(-2deg) scale(.96); filter: grayscale(1) contrast(1.08) brightness(.58); }
			}
			@keyframes lfa-defeated-text { 0% { opacity: 1; } 100% { opacity: .4; } }
			@keyframes lfa-winner-left {
				0% { opacity: 1; transform: translateX(0) scale(1); filter: grayscale(1) contrast(1.12) brightness(1); }
				50% { opacity: 1; transform: translateX(18px) scale(1.055); filter: grayscale(.45) contrast(1.18) brightness(1.42); }
				100% { opacity: 1; transform: translateX(12px) scale(1.025); filter: grayscale(.25) contrast(1.15) brightness(1.12); }
			}
			@keyframes lfa-winner-right {
				0% { opacity: 1; transform: translateX(0) scale(1); filter: grayscale(1) contrast(1.12) brightness(1); }
				50% { opacity: 1; transform: translateX(-18px) scale(1.055); filter: grayscale(.45) contrast(1.18) brightness(1.42); }
				100% { opacity: 1; transform: translateX(-12px) scale(1.025); filter: grayscale(.25) contrast(1.15) brightness(1.12); }
			}
			@keyframes lfa-show-winner {
				0% { opacity: 0; transform: scale(.6) translateY(-15px); }
				70% { opacity: 1; transform: scale(1.06) translateY(0); }
				100% { opacity: 1; transform: scale(1) translateY(0); }
			}
		`;
		document.head.appendChild(style);
	}

	function buildSide(sideClass, nameClass, winnerSideClass, portraitId, fighter) {
		const player = document.createElement('div');
		player.className = `lfa-player ${sideClass}`;
		if (fighter.pictureUrl) {
			const img = document.createElement('img');
			img.className = 'lfa-portrait';
			img.id = portraitId;
			img.src = fighter.pictureUrl;
			img.alt = fighter.name;
			player.appendChild(img);
		}

		const name = document.createElement('div');
		name.className = `lfa-player-name ${nameClass}`;
		name.textContent = fighter.name;

		const winner = document.createElement('div');
		winner.className = `lfa-winner ${winnerSideClass}`;
		const label = document.createElement('span');
		label.className = 'lfa-winner-label';
		label.textContent = 'Winner';
		const nameSpan = document.createElement('span');
		nameSpan.className = 'lfa-winner-name';
		nameSpan.textContent = fighter.name;
		winner.append(label, nameSpan);

		return { player, name, winner };
	}

	// Builds the whole modal but does not attach or animate it - see playDuel.
	function buildModal(left, right) {
		const backdrop = document.createElement('div');
		backdrop.className = 'lfa-backdrop';

		const versus = document.createElement('div');
		versus.className = 'lfa-versus';
		backdrop.appendChild(versus);

		const leftSide = buildSide('lfa-player-left', 'lfa-name-left', 'lfa-winner-left', 'lfaLeftPortrait', left);
		const rightSide = buildSide('lfa-player-right', 'lfa-name-right', 'lfa-winner-right', 'lfaRightPortrait', right);
		versus.append(leftSide.player, rightSide.player, leftSide.name, rightSide.name);

		const centerSlash = document.createElement('div');
		centerSlash.className = 'lfa-center-slash';
		versus.appendChild(centerSlash);

		const vs = document.createElement('div');
		vs.className = 'lfa-vs';
		vs.textContent = 'VS';
		versus.appendChild(vs);

		const finisher = document.createElement('div');
		finisher.className = 'lfa-finisher';
		versus.appendChild(finisher);

		const impact = document.createElement('div');
		impact.className = 'lfa-impact';
		versus.appendChild(impact);

		versus.append(leftSide.winner, rightSide.winner);

		const flash = document.createElement('div');
		flash.className = 'lfa-flash';
		versus.appendChild(flash);

		return { backdrop, versus, finisher, leftWinner: leftSide.winner, rightWinner: rightSide.winner };
	}

	function playDuel({ left, right, winnerSide }) {
		ensureStyles();
		const { backdrop, versus, finisher, leftWinner, rightWinner } = buildModal(left, right);
		document.body.appendChild(backdrop);

		// Next frame, so the .lfa-play class addition is a real transition rather than the
		// element's very first paint (which would just show the end state with no animation).
		requestAnimationFrame(() => versus.classList.add('lfa-play'));

		setTimeout(() => {
			finisher.style.color = winnerSide === 'left' ? '#ff4d35' : '#4d9cff';
			versus.classList.add('lfa-finish', winnerSide === 'left' ? 'lfa-left-wins' : 'lfa-right-wins');
		}, 1050);

		setTimeout(() => {
			(winnerSide === 'left' ? leftWinner : rightWinner).classList.add('lfa-active');
			versus.classList.add('lfa-show-winner');
		}, 1900);

		setTimeout(() => {
			backdrop.style.transition = 'opacity 250ms ease';
			backdrop.style.opacity = '0';
			setTimeout(() => backdrop.remove(), 300);
		}, 3000);
	}

	// ---- Wiring a real battle into the animation above ----

	// Returns whether the animation actually played, so a caller (the main script's
	// checkBattleOutcomeFx) can skip its own outcome fx for the same battle instead of both
	// firing at once.
	async function maybeShowForBattle(battleId) {
		if (!battleId || !isEnabled() || shownBattleIds.has(battleId)) return false;
		// Marked up front, same reasoning as the main script's fxCheckedBattleIds - one attempt
		// per battle id per page view, so a later mutation-observer rescan doesn't refetch/replay.
		shownBattleIds.add(battleId);

		const battle = await fetchJson(`/api/battles/${battleId}`);
		if (!battle || battle.one_on_one !== true) return false;

		const participants = battle.participants || [];
		if (participants.length !== 2 || !participants[0].fighter || !participants[1].fighter) return false;

		const ownAvatar = await fetchJson('/api/avatars/me');
		const ownId = ownAvatar ? ownAvatar.id : null;

		let [leftParticipant, rightParticipant] = participants;
		if (ownId && rightParticipant.fighter.id === ownId) {
			[leftParticipant, rightParticipant] = [rightParticipant, leftParticipant];
		}

		const [leftPictureUrl, rightPictureUrl] = await Promise.all([
			resolvePortrait(leftParticipant.fighter.id),
			resolvePortrait(rightParticipant.fighter.id)
		]);

		playDuel({
			left: { name: leftParticipant.fighter.name, pictureUrl: leftPictureUrl },
			right: { name: rightParticipant.fighter.name, pictureUrl: rightPictureUrl },
			winnerSide: leftParticipant.won ? 'left' : 'right'
		});
		return true;
	}

	window.LanistaFightAnimation = {
		isEnabled,
		setEnabled,
		renderSettingsToggle,
		maybeShowForBattle
	};
})();
