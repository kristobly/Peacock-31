import { cardLabel } from './src/cards.js';
import { startGame, drawFromStock, drawFromDiscard, discardCard, getTopDiscard, knock, hammer, scoreRound, applyRoundResults, startNextRound, newGame } from './src/game.js';
import { scoreHand } from './src/rules.js';

// DOM elements - game controls
const startGameBtn = document.getElementById('start-game-btn');
const drawStockBtn = document.getElementById('draw-stock-btn');
const drawDiscardBtn = document.getElementById('draw-discard-btn');
const knockBtn = document.getElementById('knock-btn');
const hammerBtn = document.getElementById('hammer-btn');
const nextRoundBtn = document.getElementById('next-round-btn');
const newGameBtn = document.getElementById('new-game-btn');

// DOM elements - game display
const currentPlayerEl = document.getElementById('current-player');
const phaseEl = document.getElementById('phase');
const playerHandEl = document.getElementById('player-hand');
const playerScoreEl = document.getElementById('player-score');
const playerQuartersEl = document.getElementById('player-quarters');
const discardTopEl = document.getElementById('discard-top');
const stockCountEl = document.getElementById('stock-count');
const otherPlayersEl = document.getElementById('other-players');
const roundSummaryEl = document.getElementById('round-summary');
const roundResultsEl = document.getElementById('round-results');
const turnLogEl = document.getElementById('turn-log');

// DOM elements - examples section
const loadExamplesBtn = document.getElementById('load-examples-btn');
const exampleHandEl = document.getElementById('example-hand');
const exampleScoreEl = document.getElementById('example-score');

// Game state
let gameState = null;
let isAutoPlaying = false;
const turnLog = [];
const AI_DELAY_BONUS_MS = 1000;

function log(msg) {
    turnLog.unshift(msg);
    if (turnLog.length > 12) turnLog.length = 12;
    renderLog();
}

function renderLog() {
    turnLogEl.innerHTML = turnLog.map(m => `<li>${m}</li>`).join('');
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function render() {
    if (!gameState) {
        currentPlayerEl.textContent = '—';
        phaseEl.textContent = '—';
        playerHandEl.innerHTML = '';
        playerScoreEl.textContent = '—';
        playerQuartersEl.textContent = '';
        discardTopEl.textContent = '—';
        stockCountEl.textContent = '—';
        otherPlayersEl.innerHTML = '';
        drawStockBtn.disabled = true;
        drawDiscardBtn.disabled = true;
        knockBtn.disabled = true;
        hammerBtn.disabled = true;
        nextRoundBtn.disabled = true;
        roundSummaryEl.style.display = 'none';
        renderLog();
        return;
    }

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

    // Player 1's quarters
    const p1 = gameState.players[0];
    if (p1.out) {
        playerQuartersEl.textContent = '[OUT]';
    } else {
        playerQuartersEl.textContent = `[${p1.quarters} quarter${p1.quarters !== 1 ? 's' : ''}]`;
    }

    // Player 1's hand as clickable buttons
    const hand = gameState.players[0].hand;
    playerHandEl.innerHTML = '';
    hand.forEach((card, index) => {
        const btn = document.createElement('button');
        btn.textContent = cardLabel(card);
        btn.className = 'card-btn';

        // Only clickable when it's Player 1's turn and phase is needDiscard and round not over
        const canDiscard = !isAutoPlaying && gameState.currentPlayerIndex === 0 && gameState.phase === 'needDiscard' && !gameState.roundOver;
        btn.disabled = !canDiscard;

        btn.addEventListener('click', async () => {
            if (discardCard(gameState, index)) {
                render();
                await runOtherPlayersTurns();
            }
        });

        playerHandEl.appendChild(btn);
    });

    // Player 1's score
    playerScoreEl.textContent = scoreHand(hand);

    // Discard pile top
    const topDiscard = getTopDiscard(gameState);
    discardTopEl.textContent = topDiscard ? cardLabel(topDiscard) : '—';

    // Stock count
    stockCountEl.textContent = gameState.stock.length;

    // Other players (show hand sizes and quarters, or OUT)
    otherPlayersEl.innerHTML = '';
    for (let i = 1; i < gameState.players.length; i++) {
        const p = document.createElement('p');
        const player = gameState.players[i];
        if (player.out) {
            p.textContent = `Player ${i + 1}: OUT`;
        } else {
            p.textContent = `Player ${i + 1}: ${player.hand.length} cards [${player.quarters} quarter${player.quarters !== 1 ? 's' : ''}]`;
        }
        otherPlayersEl.appendChild(p);
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
    newGameBtn.style.display = 'inline-block';

    // Round summary
    if (isRoundOver) {
        roundSummaryEl.style.display = 'block';
        const { scores, losers } = scoreRound(gameState);

        let html = '';

        // Game over winner message
        if (isGameOver) {
            html += `<p><strong style="font-size: 1.5em;">Winner: Player ${gameState.winnerIndex + 1}!</strong></p>`;
        }

        // Show round result type message
        if (gameState.roundResultType === 'instant31') {
            html += `<p><strong>Instant 31: Player ${gameState.instant31WinnerIndex + 1}</strong></p>`;
        } else if (gameState.roundResultType === 'hammer') {
            html += `<p><strong>The Hammer! Player 1 slammed down their hand.</strong></p>`;
        }

        html += '<p><strong>Scores:</strong></p><ul>';
        for (let i = 0; i < gameState.players.length; i++) {
            const player = gameState.players[i];
            if (player.hand.length === 0) {
                html += `<li>Player ${i + 1}: OUT</li>`;
                continue;
            }
            const handStr = player.hand.map(cardLabel).join(' ');
            const isLoser = losers.includes(i);
            const isKnocker = i === gameState.knockerIndex;
            const isInstant31Winner = gameState.roundResultType === 'instant31' && i === gameState.instant31WinnerIndex;
            let label = `Player ${i + 1}: ${scores[i]} points (${handStr})`;
            if (isKnocker) label += ' [Knocker]';
            if (isInstant31Winner) label += ' [31!]';
            if (isLoser) label = `<strong>${label} — LOST</strong>`;
            if (isLoser && player.quarters === 0) label += ' [ELIMINATED]';
            html += `<li>${label}</li>`;
        }
        html += '</ul>';

        const loserNames = losers.map(i => `Player ${i + 1}`).join(', ');
        html += `<p><strong>Loser(s):</strong> ${loserNames} (-1 quarter each)</p>`;

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

        log(`Player ${pi + 1} thinking\u2026`);
        await sleep(300 + AI_DELAY_BONUS_MS);

        if (!drawFromStock(gameState)) {
            console.log('Stock empty during AI turn');
            break;
        }

        log(`Player ${pi + 1} drew from stock`);
        render();
        if (gameState.roundOver) break;

        await sleep(400 + AI_DELAY_BONUS_MS);

        const hand = gameState.players[pi].hand;
        const discardIndex = hand.length - 1;
        const discardedCard = hand[discardIndex];
        discardCard(gameState, discardIndex);

        log(`Player ${pi + 1} discarded ${cardLabel(discardedCard)}`);
        render();
        if (gameState.roundOver) break;

        await sleep(500 + AI_DELAY_BONUS_MS);
    }

    isAutoPlaying = false;
    render();
}

// Event listeners
startGameBtn.addEventListener('click', () => {
    gameState = startGame(3);
    turnLog.length = 0;
    console.log('Game started:', gameState);
    render();
});

drawStockBtn.addEventListener('click', () => {
    if (drawFromStock(gameState)) {
        render();
    }
});

drawDiscardBtn.addEventListener('click', () => {
    if (drawFromDiscard(gameState)) {
        render();
    }
});

knockBtn.addEventListener('click', async () => {
    if (knock(gameState)) {
        log('Player 1 knocked!');
        render();
        await runOtherPlayersTurns();
    }
});

hammerBtn.addEventListener('click', () => {
    if (hammer(gameState)) {
        console.log('Player 1 used The Hammer!');
        render();
    }
});

nextRoundBtn.addEventListener('click', () => {
    // Apply round results before starting next round
    const { losers } = scoreRound(gameState);
    applyRoundResults(gameState, losers);
    if (gameState.gameOver) {
        render();
        return;
    }
    startNextRound(gameState);
    turnLog.length = 0;
    console.log('Starting next round');
    render();
});

newGameBtn.addEventListener('click', () => {
    gameState = newGame(3);
    turnLog.length = 0;
    console.log('New game started');
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
