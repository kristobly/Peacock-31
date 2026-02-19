import { cardLabel } from './src/cards.js';
import { startGame, drawFromStock, drawFromDiscard, discardCard, getTopDiscard, knock, hammer, scoreRound, applyRoundResults, startNextRound, checkInstant31 } from './src/game.js';
import { scoreHand, cardValue } from './src/rules.js';
import { pickTargetSuit, chooseDiscardIndex } from './src/ai.js';

// DOM elements - game controls
const playerCountSelect = document.getElementById('player-count');
const startGameBtn = document.getElementById('start-game-btn');
const drawStockBtn = document.getElementById('draw-stock-btn');
const drawDiscardBtn = document.getElementById('draw-discard-btn');
const knockBtn = document.getElementById('knock-btn');
const hammerBtn = document.getElementById('hammer-btn');
const nextRoundBtn = document.getElementById('next-round-btn');

// DOM elements - game display
const currentPlayerEl = document.getElementById('current-player');
const playerHandEl = document.getElementById('player-hand');
const playerScoreEl = document.getElementById('player-score');
const playerQuartersEl = document.getElementById('player-quarters');
const playerInfoEl = document.getElementById('player-info');
const discardTopEl = document.getElementById('discard-top');
const stockCountEl = document.getElementById('stock-count');
const stockDisplayEl = document.getElementById('stock-display');
const otherPlayersEl = document.getElementById('other-players');
const playerZoneEl = document.getElementById('player-zone');
const ghostCardEl = document.getElementById('ghost-card');
const knockRingEl = document.getElementById('knock-ring');
const actionLabelEl = document.getElementById('action-label');
const lastActionStripEl = document.getElementById('last-action-strip');

// DOM elements - celebration banner
const instant31BannerEl = document.getElementById('instant31-banner');
let instant31BannerTimeout = null;

// DOM elements - match over overlay
const matchOverlayEl = document.getElementById('match-over-overlay');
const matchWinnerTextEl = document.getElementById('match-winner-text');
const matchPlayerTableEl = document.getElementById('match-player-table');
const matchRecapEl = document.getElementById('match-recap');
const playAgainBtn = document.getElementById('play-again-btn');
const changeSettingsBtn = document.getElementById('change-settings-btn');

// Game state
let gameState = null;
let isAutoPlaying = false;
const AI_DELAY_BONUS_MS = 1000;

// Match-level stats (reset on each new match)
function initMatchStats() {
    return { roundsPlayed: 0, hammersUsed: 0, instant31Count: 0, lastRoundLosers: [] };
}
let matchStats = initMatchStats();

// Set DEBUG = true to log AI temperament and decision math to the console.
const DEBUG = false;

// AI base thresholds (adjusted by temperament at runtime)
const GAMBLE_SCORE_THRESHOLD = 25;   // "strong" hand — might skip small discard cards
const GAMBLE_CARD_MAX_VALUE = 3;     // only gamble past cards worth ≤ this

function isRedSuit(suit) {
    return suit === '♥' || suit === '♦';
}

function cardFaceHtml(card) {
    return `<span class="card-corner top-left">${card.rank}<br>${card.suit}</span>` +
           `<span class="card-center-pip">${card.suit}</span>` +
           `<span class="card-corner bottom-right">${card.rank}<br>${card.suit}</span>`;
}

function setLastAction(text) {
    lastActionStripEl.textContent = text ? `Last: ${text}` : '';
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function showInstant31Banner(winnerIndex) {
    if (instant31BannerTimeout) {
        clearTimeout(instant31BannerTimeout);
        instant31BannerTimeout = null;
    }
    instant31BannerEl.textContent = `Player ${winnerIndex + 1} hit 31!`;
    instant31BannerEl.classList.remove('hidden');
    instant31BannerTimeout = setTimeout(() => {
        instant31BannerEl.classList.add('hidden');
        instant31BannerTimeout = null;
    }, 1500);
}

function hideInstant31Banner() {
    if (instant31BannerTimeout) {
        clearTimeout(instant31BannerTimeout);
        instant31BannerTimeout = null;
    }
    instant31BannerEl.classList.add('hidden');
}

// Animation state
let animationInProgress = false;
let actionLabelTimeout = null;

// Returns the DOM element representing the player's zone on the table.
// Player 0 → #player-zone; others → .opponent-area[data-player-index]
function getPlayerAreaEl(playerIndex) {
    if (playerIndex === 0) return playerZoneEl;
    return otherPlayersEl.querySelector(`[data-player-index="${playerIndex}"]`);
}

// Fly a ghost card from fromEl to toEl, showing a card back or a card face.
// isBack: true → Michigan blue back; false → card face (requires card).
async function animateCardMove(fromEl, toEl, { isBack, card = null }) {
    if (!fromEl || !toEl) return;
    if (animationInProgress) {
        // Skip rather than overlap; tiny pause so callers don't race
        await sleep(50);
        return;
    }
    animationInProgress = true;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    // Set visual content
    ghostCardEl.className = isBack
        ? 'card-back'
        : ('card-face' + (card && isRedSuit(card.suit) ? ' red-suit' : ''));
    ghostCardEl.innerHTML = (!isBack && card) ? cardFaceHtml(card) : '';

    // Snap to start (no transition), invisible
    ghostCardEl.style.transition = 'none';
    ghostCardEl.style.transform = `translate(${fromRect.left}px, ${fromRect.top}px)`;
    ghostCardEl.style.opacity = '0';

    // Force reflow so the snap takes effect before we start the transition
    ghostCardEl.offsetHeight;

    // Fly to destination with fade-in
    ghostCardEl.style.transition = 'transform 0.28s ease, opacity 0.12s ease';
    ghostCardEl.style.opacity = '1';
    ghostCardEl.style.transform = `translate(${toRect.left}px, ${toRect.top}px)`;

    await sleep(300); // slightly longer than 280ms transition

    // Quick fade-out at the destination
    ghostCardEl.style.transition = 'opacity 0.1s ease';
    ghostCardEl.style.opacity = '0';
    await sleep(110);

    animationInProgress = false;
}

// Show a brief action label near the given player's zone for ~800 ms.
function showAction(playerIndex, text) {
    const playerEl = getPlayerAreaEl(playerIndex);
    if (!playerEl) return;

    if (actionLabelTimeout) {
        clearTimeout(actionLabelTimeout);
        actionLabelTimeout = null;
    }

    const rect = playerEl.getBoundingClientRect();
    actionLabelEl.textContent = text;
    actionLabelEl.style.left = `${rect.left + rect.width / 2}px`;
    actionLabelEl.style.transform = 'translateX(-50%)';
    // Player 1 is at the bottom — label above; opponents are at top — label below
    actionLabelEl.style.top = playerIndex === 0
        ? `${rect.top - 34}px`
        : `${rect.bottom + 8}px`;

    actionLabelEl.classList.add('visible');
    actionLabelTimeout = setTimeout(() => {
        actionLabelEl.classList.remove('visible');
        actionLabelTimeout = null;
    }, 800);
}

/**
 * Decide if an AI should use The Hammer before anyone draws.
 * Base threshold drops as more players are at the table (higher chance of someone losing).
 * Aggression lowers the threshold; conservatism raises it.
 * Small bounded noise prevents identical behaviour every game.
 */
function decideHammer(score, playersRemaining, aggression) {
    const baseThreshold = 28 - playersRemaining * 1.6;
    const adjustedThreshold = baseThreshold - aggression * 2.5;
    const noise = (Math.random() - 0.5) * 4; // ±2 pts
    const result = score >= adjustedThreshold + noise;
    if (DEBUG) {
        console.log(`[HAMMER] score=${score} players=${playersRemaining} agg=${aggression} ` +
            `thresh=${adjustedThreshold.toFixed(1)} noise=${noise.toFixed(1)} → ${result ? 'YES' : 'no'}`);
    }
    return result;
}

/**
 * Decide if an AI should knock.
 * Base threshold scales with player count; urgency reduces it as turns pass;
 * aggression shifts it down (knock sooner); conservatism shifts it up.
 */
function decideKnock(score, playersRemaining, roundTurnCount, aggression) {
    const baseThreshold = 23 + playersRemaining * 1.0;
    const urgencyReduction = Math.min(roundTurnCount * 0.4, 4); // caps at −4
    const aggressionAdjust = aggression * 1.5;
    const adjustedThreshold = baseThreshold - urgencyReduction - aggressionAdjust;
    const noise = (Math.random() - 0.5) * 5; // ±2.5 pts
    const result = score >= adjustedThreshold + noise;
    if (DEBUG) {
        console.log(`[KNOCK] score=${score} players=${playersRemaining} turns=${roundTurnCount} ` +
            `agg=${aggression} thresh=${adjustedThreshold.toFixed(1)} noise=${noise.toFixed(1)} → ${result ? 'YES' : 'no'}`);
    }
    return result;
}

/**
 * Show a brief amber ring pulse around the given player's area (fires once).
 * Does NOT need to be awaited — the ring animation runs in the background.
 */
async function showKnockPulse(playerIndex) {
    const playerEl = getPlayerAreaEl(playerIndex);
    if (!playerEl || !knockRingEl) return;
    const rect = playerEl.getBoundingClientRect();
    knockRingEl.style.top    = `${rect.top    - 5}px`;
    knockRingEl.style.left   = `${rect.left   - 5}px`;
    knockRingEl.style.width  = `${rect.width  + 10}px`;
    knockRingEl.style.height = `${rect.height + 10}px`;
    // Force-restart animation by toggling the class
    knockRingEl.classList.remove('pulsing');
    knockRingEl.offsetHeight; // reflow
    knockRingEl.classList.add('pulsing');
    await sleep(1150); // 2 × 520ms + margin
    knockRingEl.classList.remove('pulsing');
}

function showMatchOverOverlay() {
    const isTie = gameState.winnerIndex === null;

    // Winner / tie headline
    matchWinnerTextEl.textContent = isTie
        ? `It's a tie — everyone is out!`
        : `Winner: Player ${gameState.winnerIndex + 1}`;

    // Player table
    let tableHtml = '<thead><tr><th>Player</th><th>Quarters</th><th>Status</th></tr></thead><tbody>';
    for (let i = 0; i < gameState.players.length; i++) {
        const p = gameState.players[i];
        const isWinner = !isTie && i === gameState.winnerIndex;
        const rowClass = isWinner ? 'match-winner-row' : 'match-out-row';
        const status = isWinner ? '🏆 WINNER' : 'OUT';
        let quartersHtml = '';
        if (isWinner) {
            for (let c = 0; c < p.quarters; c++) quartersHtml += '<span class="chip chip-sm"></span>';
            quartersHtml += ` <span style="font-size:0.85rem;">${p.quarters}</span>`;
        } else {
            quartersHtml = '0';
        }
        tableHtml += `<tr class="${rowClass}"><td>Player ${i + 1}</td><td>${quartersHtml}</td><td>${status}</td></tr>`;
    }
    tableHtml += '</tbody>';
    matchPlayerTableEl.innerHTML = tableHtml;

    // Recap bullets
    const lastLoserText = matchStats.lastRoundLosers.length > 0
        ? matchStats.lastRoundLosers.join(', ') + ` lost a quarter in the final round`
        : 'No losers in the final round';

    let recapHtml = '<ul>';
    recapHtml += `<li>Rounds played: <strong>${matchStats.roundsPlayed}</strong></li>`;
    recapHtml += `<li>${lastLoserText}</li>`;
    if (matchStats.hammersUsed > 0) {
        recapHtml += `<li>The Hammer used: <strong>${matchStats.hammersUsed}</strong> time${matchStats.hammersUsed !== 1 ? 's' : ''}</li>`;
    }
    if (matchStats.instant31Count > 0) {
        recapHtml += `<li>Instant 31: <strong>${matchStats.instant31Count}</strong> time${matchStats.instant31Count !== 1 ? 's' : ''}</li>`;
    }
    recapHtml += '</ul>';
    matchRecapEl.innerHTML = recapHtml;

    matchOverlayEl.classList.remove('hidden');
}

function hideMatchOverOverlay() {
    matchOverlayEl.classList.add('hidden');
}

function render() {
    if (!gameState) {
        playerZoneEl.classList.remove('active-turn');
        playerZoneEl.classList.remove('round-loser');
        playerZoneEl.classList.remove('has-knocked');
        const staleKnockBadge = playerInfoEl.querySelector('.p1-knock-badge');
        if (staleKnockBadge) staleKnockBadge.remove();
        currentPlayerEl.textContent = '—';
        playerHandEl.innerHTML = '';
        playerScoreEl.textContent = '—';
        playerQuartersEl.textContent = '';
        discardTopEl.textContent = '—';
        discardTopEl.className = 'card-face pile-card';
        stockCountEl.textContent = '—';
        stockDisplayEl.style.opacity = '0.35';
        otherPlayersEl.innerHTML = '';
        drawStockBtn.disabled = true;
        drawDiscardBtn.disabled = true;
        knockBtn.disabled = true;
        hammerBtn.disabled = true;
        nextRoundBtn.disabled = true;
        stockDisplayEl.classList.remove('pile-clickable');
        discardTopEl.classList.remove('pile-clickable');
        startGameBtn.textContent = 'Start Game';
        return;
    }

    // Compute round-end scores once — used in opponent reveal and round summary
    const roundEndData = gameState.roundOver ? scoreRound(gameState) : null;

    startGameBtn.textContent = 'Restart';

    // Current player display (with knock countdown when applicable)
    let turnText = `Player ${gameState.currentPlayerIndex + 1}`;
    if (gameState.gameOver) {
        turnText += ' — Game Over';
    } else if (gameState.roundOver) {
        turnText += ' — Round Over';
    } else if (gameState.knocked) {
        const t = gameState.finalTurnsRemaining;
        turnText += ` (Knocked — ${t} turn${t !== 1 ? 's' : ''} left)`;
    }
    currentPlayerEl.textContent = turnText;

    // Player 1's quarters as chip icons + text
    const p1 = gameState.players[0];
    if (p1.out) {
        playerQuartersEl.textContent = '[OUT]';
    } else {
        const q = p1.quarters;
        let chipsHtml = '';
        for (let c = 0; c < q; c++) chipsHtml += '<span class="chip"></span>';
        playerQuartersEl.innerHTML = chipsHtml + ` <span style="color:#ddd;font-size:0.95rem;">${q} quarter${q !== 1 ? 's' : ''}</span>`;
    }

    // Player 1's hand as clickable card buttons
    const hand = gameState.players[0].hand;
    playerHandEl.innerHTML = '';
    hand.forEach((card, index) => {
        const btn = document.createElement('button');
        btn.innerHTML = cardFaceHtml(card);
        btn.className = 'card-btn' + (isRedSuit(card.suit) ? ' red-suit' : '');

        // Only clickable when it's Player 1's turn and phase is needDiscard and round not over
        const canDiscard = !isAutoPlaying && gameState.currentPlayerIndex === 0 && gameState.phase === 'needDiscard' && !gameState.roundOver;
        btn.disabled = !canDiscard;

        btn.addEventListener('click', async () => {
            if (isAutoPlaying || animationInProgress) return;
            isAutoPlaying = true;
            const discarded = hand[index];
            const anim = animateCardMove(btn, discardTopEl, { isBack: false, card: discarded });
            showAction(0, `Discarded ${cardLabel(discarded)}`);
            const success = discardCard(gameState, index);
            await anim;
            if (success) {
                setLastAction(`Player 1 discarded ${cardLabel(discarded)}`);
                render();
                await runOtherPlayersTurns();
            } else {
                isAutoPlaying = false;
                render();
            }
        });

        playerHandEl.appendChild(btn);
    });

    // Player 1's score
    playerScoreEl.textContent = scoreHand(hand);

    // Discard pile top — real card face
    const topDiscard = getTopDiscard(gameState);
    if (topDiscard) {
        discardTopEl.className = 'card-face pile-card' + (isRedSuit(topDiscard.suit) ? ' red-suit' : '');
        discardTopEl.innerHTML = cardFaceHtml(topDiscard);
    } else {
        discardTopEl.className = 'card-face pile-card';
        discardTopEl.textContent = '—';
    }

    // Stock pile
    stockCountEl.textContent = gameState.stock.length;
    stockDisplayEl.style.opacity = gameState.stock.length > 0 ? '1' : '0.25';

    // Other players: show face-down card backs + quarters
    otherPlayersEl.innerHTML = '';
    for (let i = 1; i < gameState.players.length; i++) {
        const player = gameState.players[i];
        const isLoser = roundEndData && roundEndData.losers.includes(i);
        const isKnocker = gameState.knocked && gameState.knockerIndex === i;
        const area = document.createElement('div');
        area.className = 'opponent-area' +
            (player.out ? ' out' : '') +
            (i === gameState.currentPlayerIndex && !gameState.roundOver ? ' active-turn' : '') +
            (isLoser ? ' round-loser' : '') +
            (isKnocker ? ' has-knocked' : '');
        area.dataset.playerIndex = i;

        // Knock badge (positioned inside the area, top-left corner)
        if (isKnocker) {
            const knockBadge = document.createElement('div');
            knockBadge.className = 'knock-badge';
            knockBadge.textContent = '✊';
            area.appendChild(knockBadge);
        }

        const name = document.createElement('div');
        name.className = 'opponent-name';
        name.textContent = `Player ${i + 1}`;
        area.appendChild(name);

        if (!player.out) {
            const cards = document.createElement('div');
            cards.className = 'opponent-cards';
            if (gameState.roundOver && player.hand.length > 0) {
                // Round over: reveal face-up cards
                player.hand.forEach(card => {
                    const cardEl = document.createElement('div');
                    cardEl.className = 'card-face-sm' + (isRedSuit(card.suit) ? ' red-suit' : '');
                    cardEl.innerHTML = cardFaceHtml(card);
                    cards.appendChild(cardEl);
                });
            } else {
                // Normal play: face-down backs
                for (let c = 0; c < player.hand.length; c++) {
                    const back = document.createElement('div');
                    back.className = 'card-back-sm';
                    cards.appendChild(back);
                }
            }
            area.appendChild(cards);

            if (roundEndData) {
                const scoreEl = document.createElement('div');
                scoreEl.className = 'opponent-round-score';
                scoreEl.textContent = `Score: ${roundEndData.scores[i]}`;
                area.appendChild(scoreEl);
            }

            const qtrs = document.createElement('div');
            qtrs.className = 'opponent-quarters';
            let chipsHtml = '';
            for (let c = 0; c < player.quarters; c++) chipsHtml += '<span class="chip chip-sm"></span>';
            qtrs.innerHTML = chipsHtml;
            area.appendChild(qtrs);
        } else {
            const out = document.createElement('div');
            out.className = 'opponent-quarters';
            out.textContent = 'OUT';
            area.appendChild(out);
        }

        otherPlayersEl.appendChild(area);
    }

    // Turn highlight — player zone
    playerZoneEl.classList.toggle('active-turn', gameState.currentPlayerIndex === 0 && !gameState.roundOver);

    // Round loser indicator — player 1
    const p1IsLoser = roundEndData && roundEndData.losers.includes(0);
    playerZoneEl.classList.toggle('round-loser', !!p1IsLoser);

    // Knock indicator — player 1
    const p1IsKnocker = gameState.knocked && gameState.knockerIndex === 0;
    playerZoneEl.classList.toggle('has-knocked', p1IsKnocker);
    const existingP1KnockBadge = playerInfoEl.querySelector('.p1-knock-badge');
    if (p1IsKnocker && !existingP1KnockBadge) {
        const badge = document.createElement('span');
        badge.className = 'knock-badge p1-knock-badge';
        badge.textContent = '✊ KNOCK';
        playerInfoEl.appendChild(badge);
    } else if (!p1IsKnocker && existingP1KnockBadge) {
        existingP1KnockBadge.remove();
    }

    // Enable/disable buttons based on state
    const isPlayer1Turn = gameState.currentPlayerIndex === 0;
    const isDrawPhase = gameState.phase === 'needDraw';
    const isRoundOver = gameState.roundOver;
    const isGameOver = gameState.gameOver;

    drawStockBtn.disabled = isAutoPlaying || isGameOver || !(isPlayer1Turn && isDrawPhase && gameState.stock.length > 0 && !isRoundOver);
    drawDiscardBtn.disabled = isAutoPlaying || isGameOver || !(isPlayer1Turn && isDrawPhase && gameState.discard.length > 0 && !isRoundOver);
    knockBtn.disabled = isAutoPlaying || isGameOver || !(isPlayer1Turn && isDrawPhase && !gameState.knocked && !isRoundOver);
    hammerBtn.disabled = isAutoPlaying || isGameOver || !(isPlayer1Turn && isDrawPhase && gameState.hammerAvailable && !isRoundOver);
    nextRoundBtn.disabled = isAutoPlaying || isGameOver || !isRoundOver;

    stockDisplayEl.classList.toggle('pile-clickable', !drawStockBtn.disabled);
    discardTopEl.classList.toggle('pile-clickable', !drawDiscardBtn.disabled);

}

async function runOtherPlayersTurns() {
    if (!gameState || gameState.roundOver || gameState.gameOver) {
        isAutoPlaying = false;
        render();
        return;
    }

    isAutoPlaying = true;
    render();

    const player1Out = gameState.players[0].out;

    while ((player1Out || gameState.currentPlayerIndex !== 0) && !gameState.roundOver) {
        const pi = gameState.currentPlayerIndex;
        const hand = gameState.players[pi].hand;
        const aggression = gameState.ai[pi].aggression;
        const playersRemaining = gameState.players.filter(p => !p.out).length;

        await sleep(300 + AI_DELAY_BONUS_MS);

        // --- Hammer decision (only eligible if this AI is the starting player) ---
        if (gameState.hammerAvailable && pi === gameState.startingPlayerIndex) {
            const score = scoreHand(hand);
            if (decideHammer(score, playersRemaining, aggression)) {
                hammer(gameState);
                setLastAction(`Player ${pi + 1} hammered`);
                showAction(pi, 'Hammered!');
                render();
                break;
            }
        }

        // --- Knock decision (before drawing) ---
        const preDrawScore = scoreHand(hand);
        if (!gameState.knocked && decideKnock(preDrawScore, playersRemaining, gameState.roundTurnCount, aggression)) {
            knock(gameState);
            showKnockPulse(pi); // fire-and-forget; amber ring flashes in background
            setLastAction(`Player ${pi + 1} knocked`);
            showAction(pi, 'Knocked');
            render();
            if (gameState.roundOver) break;
            await sleep(500 + AI_DELAY_BONUS_MS);
            continue;   // knocking ends this player's turn
        }

        // --- Draw decision ---
        const targetSuit = pickTargetSuit(hand, cardValue);
        if (DEBUG) console.log(`Player ${pi + 1} targets ${targetSuit}`);

        const topCard = getTopDiscard(gameState);
        let drewDiscard = false;
        const opponentDrawEl = getPlayerAreaEl(pi);

        if (topCard && topCard.suit === targetSuit) {
            const currentTargetTotal = hand
                .filter(c => c.suit === targetSuit)
                .reduce((sum, c) => sum + cardValue(c), 0);
            const discardHelps = currentTargetTotal + cardValue(topCard) > currentTargetTotal;

            if (discardHelps) {
                // Gamble: temperament shifts the threshold — aggressive AIs gamble more often
                const adjustedGambleThreshold = GAMBLE_SCORE_THRESHOLD - aggression * 2;
                const shouldGamble = preDrawScore >= adjustedGambleThreshold
                    && cardValue(topCard) <= GAMBLE_CARD_MAX_VALUE;

                if (shouldGamble) {
                    if (DEBUG) console.log(`Player ${pi + 1} gambles — skips ${cardLabel(topCard)}`);
                } else {
                    if (drawFromDiscard(gameState)) {
                        drewDiscard = true;
                        const drawAnim = animateCardMove(discardTopEl, opponentDrawEl, { isBack: false, card: topCard });
                        showAction(pi, `Drew discard ${cardLabel(topCard)}`);
                        await drawAnim;
                    }
                }
            }
        }

        if (!drewDiscard) {
            if (!drawFromStock(gameState)) {
                console.log('Stock empty during AI turn');
                break;
            }
            const drawAnim = animateCardMove(stockDisplayEl, opponentDrawEl, { isBack: true });
            showAction(pi, 'Drew stock');
            await drawAnim;
        }

        if (drewDiscard) {
            setLastAction(`Player ${pi + 1} drew discard ${cardLabel(topCard)}`);
        } else {
            setLastAction(`Player ${pi + 1} drew stock`);
        }
        if (gameState.roundOver && gameState.roundResultType === 'instant31') {
            showInstant31Banner(gameState.instant31WinnerIndex);
        }
        render();
        if (gameState.roundOver) break;

        await sleep(400 + AI_DELAY_BONUS_MS);

        // --- Discard decision ---
        const discardIndex = chooseDiscardIndex(hand, cardValue);
        const discardedCard = hand[discardIndex];
        // Re-query opponent area after render() — previous reference may be stale
        const opponentDiscardEl = getPlayerAreaEl(pi);
        const discardAnim = animateCardMove(opponentDiscardEl, discardTopEl, { isBack: false, card: discardedCard });
        showAction(pi, `Discarded ${cardLabel(discardedCard)}`);
        discardCard(gameState, discardIndex);
        await discardAnim;

        setLastAction(`Player ${pi + 1} discarded ${cardLabel(discardedCard)}`);
        render();
        if (gameState.roundOver) break;

        await sleep(500 + AI_DELAY_BONUS_MS);
    }

    isAutoPlaying = false;
    render();
}

function logAITemperaments() {
    if (!DEBUG) return;
    console.log('[DEBUG] AI temperaments for this match:');
    const labels = ['very conservative', 'conservative', 'average', 'aggressive', 'very aggressive'];
    for (let i = 1; i < gameState.numPlayers; i++) {
        const agg = gameState.ai[i].aggression;
        console.log(`  Player ${i + 1}: aggression=${agg} (${labels[agg + 2]})`);
    }
}

// Single start/restart handler — always starts a fresh game
startGameBtn.addEventListener('click', () => {
    const numPlayers = parseInt(playerCountSelect.value, 10);
    gameState = startGame(numPlayers);
    matchStats = initMatchStats();
    isAutoPlaying = false;
    hideMatchOverOverlay();
    hideInstant31Banner();
    setLastAction('');
    logAITemperaments();
    if (checkInstant31(gameState)) {
        showInstant31Banner(gameState.instant31WinnerIndex);
    }
    render();
});

drawStockBtn.addEventListener('click', async () => {
    if (isAutoPlaying || animationInProgress) return;
    isAutoPlaying = true;
    const anim = animateCardMove(stockDisplayEl, playerHandEl, { isBack: true });
    showAction(0, 'Drew stock');
    const success = drawFromStock(gameState);
    await anim;
    isAutoPlaying = false;
    if (success) {
        setLastAction('Player 1 drew stock');
        if (gameState.roundOver && gameState.roundResultType === 'instant31') {
            showInstant31Banner(gameState.instant31WinnerIndex);
        }
        render();
        if (gameState.roundOver) return;
    }
});

drawDiscardBtn.addEventListener('click', async () => {
    if (isAutoPlaying || animationInProgress) return;
    isAutoPlaying = true;
    const topCard = getTopDiscard(gameState);
    const anim = animateCardMove(discardTopEl, playerHandEl, { isBack: false, card: topCard });
    showAction(0, `Drew discard ${cardLabel(topCard)}`);
    const success = drawFromDiscard(gameState);
    await anim;
    isAutoPlaying = false;
    if (success) {
        setLastAction(`Player 1 drew discard ${cardLabel(topCard)}`);
        if (gameState.roundOver && gameState.roundResultType === 'instant31') {
            showInstant31Banner(gameState.instant31WinnerIndex);
        }
        render();
        if (gameState.roundOver) return;
    }
});

stockDisplayEl.addEventListener('click', () => {
    if (!drawStockBtn.disabled) drawStockBtn.click();
});

discardTopEl.addEventListener('click', () => {
    if (!drawDiscardBtn.disabled) drawDiscardBtn.click();
});

knockBtn.addEventListener('click', async () => {
    if (knock(gameState)) {
        setLastAction('Player 1 knocked');
        showKnockPulse(0); // fire-and-forget amber ring pulse
        render();
        await runOtherPlayersTurns();
    }
});

hammerBtn.addEventListener('click', () => {
    if (hammer(gameState)) {
        setLastAction('Player 1 hammered');
        render();
    }
});

nextRoundBtn.addEventListener('click', async () => {
    // Score and track stats before applying results
    const { losers } = scoreRound(gameState);
    matchStats.roundsPlayed++;
    matchStats.lastRoundLosers = losers.map(i => `Player ${i + 1}`);
    if (gameState.roundResultType === 'hammer') matchStats.hammersUsed++;
    if (gameState.roundResultType === 'instant31') matchStats.instant31Count++;

    applyRoundResults(gameState, losers);
    if (gameState.gameOver) {
        showMatchOverOverlay();
        render();
        return;
    }
    startNextRound(gameState);
    hideInstant31Banner();
    setLastAction('');
    console.log('Starting next round');
    if (checkInstant31(gameState)) {
        showInstant31Banner(gameState.instant31WinnerIndex);
        render();
        return;
    }
    render();
    await runOtherPlayersTurns();
});

// Play Again: fresh match with the same player count
playAgainBtn.addEventListener('click', async () => {
    const numPlayers = parseInt(playerCountSelect.value, 10);
    gameState = startGame(numPlayers);
    matchStats = initMatchStats();
    isAutoPlaying = false;
    hideMatchOverOverlay();
    hideInstant31Banner();
    setLastAction('');
    logAITemperaments();
    if (checkInstant31(gameState)) {
        showInstant31Banner(gameState.instant31WinnerIndex);
        render();
        return;
    }
    render();
    await runOtherPlayersTurns();
});

// Change Settings: return to pre-game state without starting
changeSettingsBtn.addEventListener('click', () => {
    gameState = null;
    matchStats = initMatchStats();
    isAutoPlaying = false;
    hideMatchOverOverlay();
    setLastAction('');
    render();
});

// Initial render
render();

// === Tutorial / Coach Marks ===
const TUTORIAL_LS_KEY = 'peacock31_tutorialSeen';

const TUTORIAL_STEPS = [
    {
        selector: '#player-zone',
        text: 'Your 3 cards appear here. After drawing, click one to discard it. Collect same-suit cards as close to 31 as possible — Ace counts 11!',
    },
    {
        selector: '#stock-display',
        text: 'Click the stock pile on your turn to draw a mystery face-down card. Good for switching suits.',
    },
    {
        selector: '#discard-top',
        text: 'The discard pile shows the top card. Grab it if it helps your hand — but everyone can see what you took!',
    },
    {
        selector: '#player-info',
        text: 'Your quarters (lives) and current score appear here. You start with 4 quarters. The round\'s lowest scorer pays 1. Lose them all and you\'re out!',
    },
    {
        selector: '#status-bar',
        text: 'Shows whose turn it is and recent moves. Use Knock (near your hand) when confident — everyone gets one final draw. Hit exactly 31 to win the round instantly!',
    },
];

const tutorialOverlayEl = document.getElementById('tutorial-overlay');
const tutorialSpotlightEl = document.getElementById('tutorial-spotlight');
const tutorialBubbleEl = document.getElementById('tutorial-bubble');
const tutorialTextEl = document.getElementById('tutorial-text');
const tutorialCounterEl = document.getElementById('tutorial-counter');
const tutorialBackBtn = document.getElementById('tutorial-back-btn');
const tutorialNextBtn = document.getElementById('tutorial-next-btn');
const tutorialSkipBtn = document.getElementById('tutorial-skip-btn');
const helpBtn = document.getElementById('help-btn');

let tutorialCurrentStep = 0;

function positionTutorialBubble(targetRect) {
    const PAD = 18;
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const bubbleW = Math.min(300, vpW - 24);

    // Try placing below target
    let left = targetRect.left + targetRect.width / 2 - bubbleW / 2;
    let top = targetRect.bottom + PAD;

    // Clamp horizontal within viewport
    left = Math.max(12, Math.min(left, vpW - bubbleW - 12));

    // Estimate bubble height (can't read actual height before paint; use approx)
    const estBubbleH = 130;

    // If bubble goes below viewport, try above target
    if (top + estBubbleH > vpH - 12) {
        top = targetRect.top - PAD - estBubbleH;
    }

    // If still off the top, center vertically in viewport
    if (top < 12) {
        top = Math.max(12, vpH / 2 - estBubbleH / 2);
    }

    tutorialBubbleEl.style.left = `${left}px`;
    tutorialBubbleEl.style.top = `${top}px`;
    tutorialBubbleEl.style.width = `${bubbleW}px`;
}

function showTutorialStep(requestedIndex) {
    // Determine direction so we can skip invalid steps the right way
    const direction = requestedIndex >= tutorialCurrentStep ? 1 : -1;
    let i = requestedIndex;

    while (i >= 0 && i < TUTORIAL_STEPS.length) {
        const el = document.querySelector(TUTORIAL_STEPS[i].selector);
        if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 || rect.height > 0) break; // valid step
        }
        i += direction;
    }

    // Exhausted steps going forward → close tutorial
    if (i >= TUTORIAL_STEPS.length) {
        closeTutorial();
        return;
    }

    // Exhausted steps going backward → stay at 0
    if (i < 0) i = 0;

    tutorialCurrentStep = i;
    const step = TUTORIAL_STEPS[i];
    const el = document.querySelector(step.selector);
    const rect = el.getBoundingClientRect();

    // Position spotlight with padding
    const SP = 8;
    tutorialSpotlightEl.style.top = `${rect.top - SP}px`;
    tutorialSpotlightEl.style.left = `${rect.left - SP}px`;
    tutorialSpotlightEl.style.width = `${rect.width + SP * 2}px`;
    tutorialSpotlightEl.style.height = `${rect.height + SP * 2}px`;

    // Update bubble content
    tutorialTextEl.textContent = step.text;
    tutorialCounterEl.textContent = `${i + 1} / ${TUTORIAL_STEPS.length}`;
    tutorialBackBtn.style.visibility = i === 0 ? 'hidden' : 'visible';
    tutorialNextBtn.textContent = i === TUTORIAL_STEPS.length - 1 ? 'Done' : 'Next';

    positionTutorialBubble(rect);
}

function openTutorial() {
    tutorialCurrentStep = 0;
    tutorialOverlayEl.classList.remove('hidden');
    tutorialSpotlightEl.classList.remove('hidden');
    tutorialBubbleEl.classList.remove('hidden');
    showTutorialStep(0);
}

function closeTutorial() {
    tutorialOverlayEl.classList.add('hidden');
    tutorialSpotlightEl.classList.add('hidden');
    tutorialBubbleEl.classList.add('hidden');
    localStorage.setItem(TUTORIAL_LS_KEY, '1');
}

tutorialNextBtn.addEventListener('click', () => {
    if (tutorialCurrentStep >= TUTORIAL_STEPS.length - 1) {
        closeTutorial();
    } else {
        showTutorialStep(tutorialCurrentStep + 1);
    }
});

tutorialBackBtn.addEventListener('click', () => {
    if (tutorialCurrentStep > 0) showTutorialStep(tutorialCurrentStep - 1);
});

tutorialSkipBtn.addEventListener('click', closeTutorial);

helpBtn.addEventListener('click', openTutorial);

// Reposition on window resize
window.addEventListener('resize', () => {
    if (!tutorialOverlayEl.classList.contains('hidden')) {
        showTutorialStep(tutorialCurrentStep);
    }
});

// First-run: auto-show tutorial on initial load
if (!localStorage.getItem(TUTORIAL_LS_KEY)) {
    openTutorial();
}
