import { cardLabel } from './src/cards.js';
import { startGame, drawFromStock, drawFromDiscard, discardCard, getTopDiscard, knock, hammer, scoreRound, applyRoundResults, startNextRound } from './src/game.js';
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
const phaseEl = document.getElementById('phase');
const playerHandEl = document.getElementById('player-hand');
const playerScoreEl = document.getElementById('player-score');
const playerQuartersEl = document.getElementById('player-quarters');
const discardTopEl = document.getElementById('discard-top');
const stockCountEl = document.getElementById('stock-count');
const stockDisplayEl = document.getElementById('stock-display');
const otherPlayersEl = document.getElementById('other-players');
const playerZoneEl = document.getElementById('player-zone');
const roundSummaryEl = document.getElementById('round-summary');
const roundResultsEl = document.getElementById('round-results');
const turnLogEl = document.getElementById('turn-log');
const ghostCardEl = document.getElementById('ghost-card');
const actionLabelEl = document.getElementById('action-label');
const lastActionStripEl = document.getElementById('last-action-strip');

// DOM elements - examples section
const loadExamplesBtn = document.getElementById('load-examples-btn');
const exampleHandEl = document.getElementById('example-hand');
const exampleScoreEl = document.getElementById('example-score');

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
const turnLog = [];
const AI_DELAY_BONUS_MS = 1000;

// Match-level stats (reset on each new match)
function initMatchStats() {
    return { roundsPlayed: 0, hammersUsed: 0, instant31Count: 0, lastRoundLosers: [] };
}
let matchStats = initMatchStats();
const DEBUG_AI = false;

// AI thresholds
const GAMBLE_SCORE_THRESHOLD = 25;   // "strong" hand — might skip small discard cards
const GAMBLE_CARD_MAX_VALUE = 3;     // only gamble past cards worth ≤ this
const KNOCK_SCORE_THRESHOLD = 27;    // knock when hand is this good or better

function isRedSuit(suit) {
    return suit === '♥' || suit === '♦';
}

function cardFaceHtml(card) {
    return `<span class="card-corner top-left">${card.rank}<br>${card.suit}</span>` +
           `<span class="card-center-pip">${card.suit}</span>` +
           `<span class="card-corner bottom-right">${card.rank}<br>${card.suit}</span>`;
}

function log(msg) {
    turnLog.unshift(msg);
    if (turnLog.length > 12) turnLog.length = 12;
    renderLog();
}

function renderLog() {
    turnLogEl.innerHTML = turnLog.map(m => `<li>${m}</li>`).join('');
}

function setLastAction(text) {
    lastActionStripEl.textContent = text ? `Last: ${text}` : '';
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
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
        currentPlayerEl.textContent = '—';
        phaseEl.textContent = '—';
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
        roundSummaryEl.style.display = 'none';
        startGameBtn.textContent = 'Start Game';
        renderLog();
        return;
    }

    // Compute round-end scores once — used in opponent reveal and round summary
    const roundEndData = gameState.roundOver ? scoreRound(gameState) : null;

    startGameBtn.textContent = 'Restart';

    // Current player and phase
    currentPlayerEl.textContent = `Player ${gameState.currentPlayerIndex + 1}`;
    let phaseText = gameState.phase;
    if (gameState.knocked) {
        phaseText += ` (Knocked by Player ${gameState.knockerIndex + 1}, ${gameState.finalTurnsRemaining} turns left)`;
    }
    if (gameState.gameOver) {
        phaseText = 'Game Over';
    } else if (gameState.roundOver) {
        phaseText = 'Round Over';
    }
    phaseEl.textContent = phaseText;

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
                log(`Player 1 discarded ${cardLabel(discarded)}`);
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
        const area = document.createElement('div');
        area.className = 'opponent-area' +
            (player.out ? ' out' : '') +
            (i === gameState.currentPlayerIndex && !gameState.roundOver ? ' active-turn' : '');
        area.dataset.playerIndex = i;

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

    // Round summary
    if (isRoundOver) {
        roundSummaryEl.style.display = 'block';
        const { scores, losers } = roundEndData;

        let html = '';

        // Game over winner message
        if (isGameOver) {
            const endMsg = gameState.winnerIndex !== null
                ? `Winner: Player ${gameState.winnerIndex + 1}!`
                : `It's a tie — everyone is out!`;
            html += `<p><strong style="font-size: 1.5em;">${endMsg}</strong></p>`;
        }

        // Show round result type message
        if (gameState.roundResultType === 'instant31') {
            html += `<p><strong>Instant 31: Player ${gameState.instant31WinnerIndex + 1}</strong></p>`;
        } else if (gameState.roundResultType === 'hammer') {
            html += `<p><strong>The Hammer! Player ${gameState.startingPlayerIndex + 1} slammed down their hand.</strong></p>`;
        }

        html += '<div class="results-list">';
        for (let i = 0; i < gameState.players.length; i++) {
            const player = gameState.players[i];
            if (player.hand.length === 0) {
                html += `<div class="results-player"><div class="results-player-info"><div class="results-player-name">Player ${i + 1}</div><div class="results-score">OUT</div></div></div>`;
                continue;
            }
            const isLoser = losers.includes(i);
            const isKnocker = i === gameState.knockerIndex;
            const isInstant31Winner = gameState.roundResultType === 'instant31' && i === gameState.instant31WinnerIndex;

            const cardsHtml = player.hand.map(card => {
                const redClass = isRedSuit(card.suit) ? ' red-suit' : '';
                return `<div class="card-face-sm${redClass}">${cardFaceHtml(card)}</div>`;
            }).join('');

            let badgesHtml = '';
            if (isKnocker) badgesHtml += '<span class="badge">Knocker</span>';
            if (isInstant31Winner) badgesHtml += '<span class="badge badge-31">31!</span>';
            if (isLoser) badgesHtml += '<span class="badge badge-lost">LOST −¼</span>';
            if (isLoser && player.quarters === 0) badgesHtml += '<span class="badge badge-lost">ELIMINATED</span>';

            html += `
                <div class="results-player${isLoser ? ' results-loser' : ''}">
                    <div class="results-player-info">
                        <div class="results-player-name">Player ${i + 1}</div>
                        <div class="results-score">${scores[i]} pts</div>
                        <div class="results-badges">${badgesHtml}</div>
                    </div>
                    <div class="results-hand">${cardsHtml}</div>
                </div>`;
        }
        html += '</div>';

        const loserNames = losers.map(i => `Player ${i + 1}`).join(', ');
        html += `<p style="margin-top:0.75rem;"><strong>Loser(s):</strong> ${loserNames} (-1 quarter each)</p>`;

        roundResultsEl.innerHTML = html;
    } else {
        roundSummaryEl.style.display = 'none';
    }

    renderLog();
}

async function runOtherPlayersTurns() {
    if (!gameState || gameState.roundOver || gameState.gameOver) return;

    isAutoPlaying = true;
    render();

    const player1Out = gameState.players[0].out;

    while ((player1Out || gameState.currentPlayerIndex !== 0) && !gameState.roundOver) {
        const pi = gameState.currentPlayerIndex;
        const hand = gameState.players[pi].hand;

        log(`Player ${pi + 1} thinking\u2026`);
        await sleep(300 + AI_DELAY_BONUS_MS);

        // --- Knock decision (before drawing) ---
        const preDrawScore = scoreHand(hand);
        if (!gameState.knocked && preDrawScore >= KNOCK_SCORE_THRESHOLD) {
            knock(gameState);
            log(`Player ${pi + 1} knocked`);
            setLastAction(`Player ${pi + 1} knocked`);
            showAction(pi, 'Knocked');
            render();
            if (gameState.roundOver) break;
            await sleep(500 + AI_DELAY_BONUS_MS);
            continue;   // knocking ends this player's turn
        }

        // --- Draw decision ---
        const targetSuit = pickTargetSuit(hand, cardValue);
        if (DEBUG_AI) console.log(`Player ${pi + 1} targets ${targetSuit}`);

        const topCard = getTopDiscard(gameState);
        let drewDiscard = false;
        const opponentDrawEl = getPlayerAreaEl(pi);

        if (topCard && topCard.suit === targetSuit) {
            const currentTargetTotal = hand
                .filter(c => c.suit === targetSuit)
                .reduce((sum, c) => sum + cardValue(c), 0);
            const discardHelps = currentTargetTotal + cardValue(topCard) > currentTargetTotal;

            if (discardHelps) {
                // Gamble: skip small helpful cards when hand is already strong
                const shouldGamble = preDrawScore >= GAMBLE_SCORE_THRESHOLD
                    && cardValue(topCard) <= GAMBLE_CARD_MAX_VALUE;

                if (shouldGamble) {
                    if (DEBUG_AI) console.log(`Player ${pi + 1} gambles — skips ${cardLabel(topCard)}`);
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
            log(`Player ${pi + 1} drew discard ${cardLabel(topCard)}`);
            setLastAction(`Player ${pi + 1} drew discard ${cardLabel(topCard)}`);
        } else {
            log(`Player ${pi + 1} drew stock`);
            setLastAction(`Player ${pi + 1} drew stock`);
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

        log(`Player ${pi + 1} discarded ${cardLabel(discardedCard)}`);
        setLastAction(`Player ${pi + 1} discarded ${cardLabel(discardedCard)}`);
        render();
        if (gameState.roundOver) break;

        await sleep(500 + AI_DELAY_BONUS_MS);
    }

    isAutoPlaying = false;
    render();
}

// Single start/restart handler — always starts a fresh game
startGameBtn.addEventListener('click', () => {
    const numPlayers = parseInt(playerCountSelect.value, 10);
    gameState = startGame(numPlayers);
    matchStats = initMatchStats();
    isAutoPlaying = false;
    hideMatchOverOverlay();
    turnLog.length = 0;
    setLastAction('');
    log(`Round starts with Player ${gameState.startingPlayerIndex + 1}`);
    console.log('Game started:', gameState);
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
        log('Player 1 drew stock');
        setLastAction('Player 1 drew stock');
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
        log(`Player 1 drew discard ${cardLabel(topCard)}`);
        setLastAction(`Player 1 drew discard ${cardLabel(topCard)}`);
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
        log('Player 1 knocked');
        setLastAction('Player 1 knocked');
        render();
        await runOtherPlayersTurns();
    }
});

hammerBtn.addEventListener('click', () => {
    if (hammer(gameState)) {
        log('Player 1 hammered');
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
    turnLog.length = 0;
    setLastAction('');
    log(`Round starts with Player ${gameState.startingPlayerIndex + 1}`);
    console.log('Starting next round');
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
    turnLog.length = 0;
    setLastAction('');
    log(`Round starts with Player ${gameState.startingPlayerIndex + 1}`);
    render();
    await runOtherPlayersTurns();
});

// Change Settings: return to pre-game state without starting
changeSettingsBtn.addEventListener('click', () => {
    gameState = null;
    matchStats = initMatchStats();
    isAutoPlaying = false;
    hideMatchOverOverlay();
    turnLog.length = 0;
    setLastAction('');
    render();
});

// Example hands for verification (separate section)
const exampleHands = [
    // 7♠, 9♥, K♦ -> all different suits, highest card is K (10) -> score 10
    [
        { rank: '7', suit: '♠' },
        { rank: '9', suit: '♥' },
        { rank: 'K', suit: '♦' }
    ],
    // 7♠, 9♠, K♠ -> all spades -> 7 + 9 + 10 = 26
    [
        { rank: '7', suit: '♠' },
        { rank: '9', suit: '♠' },
        { rank: 'K', suit: '♠' }
    ],
    // A♣, K♣, 10♣ -> all clubs -> 11 + 10 + 10 = 31
    [
        { rank: 'A', suit: '♣' },
        { rank: 'K', suit: '♣' },
        { rank: '10', suit: '♣' }
    ]
];

let exampleIndex = 0;

loadExamplesBtn.addEventListener('click', () => {
    const hand = exampleHands[exampleIndex];
    exampleHandEl.textContent = hand.map(cardLabel).join('  ');
    exampleScoreEl.textContent = scoreHand(hand);
    console.log(`Example ${exampleIndex + 1}:`, hand.map(cardLabel).join(', '), '-> Score:', scoreHand(hand));
    exampleIndex = (exampleIndex + 1) % exampleHands.length;
});

// Initial render
render();
