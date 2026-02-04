import { cardLabel } from './src/cards.js';
import { startGame, drawFromStock, drawFromDiscard, discardCard, getTopDiscard, knock, scoreRound, applyRoundResults, startNextRound } from './src/game.js';
import { scoreHand } from './src/rules.js';

// DOM elements - game controls
const startGameBtn = document.getElementById('start-game-btn');
const drawStockBtn = document.getElementById('draw-stock-btn');
const drawDiscardBtn = document.getElementById('draw-discard-btn');
const knockBtn = document.getElementById('knock-btn');
const nextRoundBtn = document.getElementById('next-round-btn');

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

// DOM elements - examples section
const loadExamplesBtn = document.getElementById('load-examples-btn');
const exampleHandEl = document.getElementById('example-hand');
const exampleScoreEl = document.getElementById('example-score');

// Game state
let gameState = null;

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
        nextRoundBtn.disabled = true;
        roundSummaryEl.style.display = 'none';
        return;
    }

    // Current player and phase
    currentPlayerEl.textContent = `Player ${gameState.currentPlayerIndex + 1}`;
    let phaseText = gameState.phase;
    if (gameState.knocked) {
        phaseText += ` (Knocked by Player ${gameState.knockerIndex + 1}, ${gameState.finalTurnsRemaining} turns left)`;
    }
    if (gameState.roundOver) {
        phaseText = 'Round Over';
    }
    phaseEl.textContent = phaseText;

    // Player 1's quarters
    const p1Quarters = gameState.players[0].quarters;
    playerQuartersEl.textContent = `[${p1Quarters} quarter${p1Quarters !== 1 ? 's' : ''}]`;

    // Player 1's hand as clickable buttons
    const hand = gameState.players[0].hand;
    playerHandEl.innerHTML = '';
    hand.forEach((card, index) => {
        const btn = document.createElement('button');
        btn.textContent = cardLabel(card);
        btn.className = 'card-btn';

        // Only clickable when it's Player 1's turn and phase is needDiscard and round not over
        const canDiscard = gameState.currentPlayerIndex === 0 && gameState.phase === 'needDiscard' && !gameState.roundOver;
        btn.disabled = !canDiscard;

        btn.addEventListener('click', () => {
            if (discardCard(gameState, index)) {
                render();
                runOtherPlayersTurns();
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

    // Other players (show hand sizes and quarters)
    otherPlayersEl.innerHTML = '';
    for (let i = 1; i < gameState.players.length; i++) {
        const p = document.createElement('p');
        const quarters = gameState.players[i].quarters;
        p.textContent = `Player ${i + 1}: ${gameState.players[i].hand.length} cards [${quarters} quarter${quarters !== 1 ? 's' : ''}]`;
        otherPlayersEl.appendChild(p);
    }

    // Enable/disable buttons based on state
    const isPlayer1Turn = gameState.currentPlayerIndex === 0;
    const isDrawPhase = gameState.phase === 'needDraw';
    const isRoundOver = gameState.roundOver;

    drawStockBtn.disabled = !(isPlayer1Turn && isDrawPhase && gameState.stock.length > 0 && !isRoundOver);
    drawDiscardBtn.disabled = !(isPlayer1Turn && isDrawPhase && gameState.discard.length > 0 && !isRoundOver);
    knockBtn.disabled = !(isPlayer1Turn && isDrawPhase && !gameState.knocked && !isRoundOver);
    nextRoundBtn.disabled = !isRoundOver;

    // Round summary
    if (isRoundOver) {
        roundSummaryEl.style.display = 'block';
        const { scores, losers } = scoreRound(gameState);

        let html = '<p><strong>Scores:</strong></p><ul>';
        for (let i = 0; i < gameState.players.length; i++) {
            const handStr = gameState.players[i].hand.map(cardLabel).join(' ');
            const isLoser = losers.includes(i);
            const isKnocker = i === gameState.knockerIndex;
            let label = `Player ${i + 1}: ${scores[i]} points (${handStr})`;
            if (isKnocker) label += ' [Knocker]';
            if (isLoser) label = `<strong>${label} — LOST</strong>`;
            html += `<li>${label}</li>`;
        }
        html += '</ul>';

        const loserNames = losers.map(i => `Player ${i + 1}`).join(', ');
        html += `<p><strong>Loser(s):</strong> ${loserNames} (-1 quarter each)</p>`;

        roundResultsEl.innerHTML = html;
    } else {
        roundSummaryEl.style.display = 'none';
    }
}

function runOtherPlayersTurns() {
    // Auto-play other players with dumb strategy: draw from stock, discard random card
    while (gameState.currentPlayerIndex !== 0 && !gameState.roundOver) {
        // Draw from stock
        if (!drawFromStock(gameState)) {
            // Stock empty, round would end (not implemented yet)
            console.log('Stock empty during AI turn');
            break;
        }

        // Discard a random card (deterministic: always discard the last card)
        const hand = gameState.players[gameState.currentPlayerIndex].hand;
        const discardIndex = hand.length - 1; // Always discard last card for determinism
        const prevPlayer = gameState.currentPlayerIndex;
        discardCard(gameState, discardIndex);

        console.log(`Player ${prevPlayer + 1} took a turn`);

        // Check if round ended after this discard
        if (gameState.roundOver) {
            break;
        }
    }
    render();
}

// Event listeners
startGameBtn.addEventListener('click', () => {
    gameState = startGame(3);
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

knockBtn.addEventListener('click', () => {
    if (knock(gameState)) {
        console.log('Player 1 knocked!');
        render();
        runOtherPlayersTurns();
    }
});

nextRoundBtn.addEventListener('click', () => {
    // Apply round results before starting next round
    const { losers } = scoreRound(gameState);
    applyRoundResults(gameState, losers);
    startNextRound(gameState);
    console.log('Starting next round');
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
