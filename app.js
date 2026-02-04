import { cardLabel } from './src/cards.js';
import { startGame, drawFromStock, drawFromDiscard, discardCard, getTopDiscard } from './src/game.js';
import { scoreHand } from './src/rules.js';

// DOM elements - game controls
const startGameBtn = document.getElementById('start-game-btn');
const drawStockBtn = document.getElementById('draw-stock-btn');
const drawDiscardBtn = document.getElementById('draw-discard-btn');

// DOM elements - game display
const currentPlayerEl = document.getElementById('current-player');
const phaseEl = document.getElementById('phase');
const playerHandEl = document.getElementById('player-hand');
const playerScoreEl = document.getElementById('player-score');
const discardTopEl = document.getElementById('discard-top');
const stockCountEl = document.getElementById('stock-count');
const otherPlayersEl = document.getElementById('other-players');

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
        discardTopEl.textContent = '—';
        stockCountEl.textContent = '—';
        otherPlayersEl.innerHTML = '';
        drawStockBtn.disabled = true;
        drawDiscardBtn.disabled = true;
        return;
    }

    // Current player and phase
    currentPlayerEl.textContent = `Player ${gameState.currentPlayerIndex + 1}`;
    phaseEl.textContent = gameState.phase;

    // Player 1's hand as clickable buttons
    const hand = gameState.players[0].hand;
    playerHandEl.innerHTML = '';
    hand.forEach((card, index) => {
        const btn = document.createElement('button');
        btn.textContent = cardLabel(card);
        btn.className = 'card-btn';

        // Only clickable when it's Player 1's turn and phase is needDiscard
        const canDiscard = gameState.currentPlayerIndex === 0 && gameState.phase === 'needDiscard';
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

    // Other players (just show hand sizes)
    otherPlayersEl.innerHTML = '';
    for (let i = 1; i < gameState.players.length; i++) {
        const p = document.createElement('p');
        p.textContent = `Player ${i + 1}: ${gameState.players[i].hand.length} cards`;
        otherPlayersEl.appendChild(p);
    }

    // Enable/disable draw buttons
    const isPlayer1Turn = gameState.currentPlayerIndex === 0;
    const isDrawPhase = gameState.phase === 'needDraw';
    drawStockBtn.disabled = !(isPlayer1Turn && isDrawPhase && gameState.stock.length > 0);
    drawDiscardBtn.disabled = !(isPlayer1Turn && isDrawPhase && gameState.discard.length > 0);
}

function runOtherPlayersTurns() {
    // Auto-play other players with dumb strategy: draw from stock, discard random card
    while (gameState.currentPlayerIndex !== 0) {
        // Draw from stock
        if (!drawFromStock(gameState)) {
            // Stock empty, round would end (not implemented yet)
            console.log('Stock empty during AI turn');
            break;
        }

        // Discard a random card (deterministic: always discard the last card)
        const hand = gameState.players[gameState.currentPlayerIndex].hand;
        const discardIndex = hand.length - 1; // Always discard last card for determinism
        discardCard(gameState, discardIndex);

        console.log(`Player ${gameState.currentPlayerIndex === 0 ? gameState.players.length : gameState.currentPlayerIndex} took a turn`);
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
