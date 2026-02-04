import { cardLabel } from './src/cards.js';
import { newRound } from './src/game.js';
import { scoreHand } from './src/rules.js';

const newRoundBtn = document.getElementById('new-round-btn');
const loadExamplesBtn = document.getElementById('load-examples-btn');
const playerHandEl = document.getElementById('player-hand');
const playerScoreEl = document.getElementById('player-score');
const discardTopEl = document.getElementById('discard-top');
const stockCountEl = document.getElementById('stock-count');

function render(state) {
    const handLabels = state.players[0].hand.map(cardLabel).join('  ');
    playerHandEl.textContent = handLabels;
    playerScoreEl.textContent = scoreHand(state.players[0].hand);
    discardTopEl.textContent = cardLabel(state.discardTop);
    stockCountEl.textContent = state.stockCount;
}

function renderHand(hand) {
    const handLabels = hand.map(cardLabel).join('  ');
    playerHandEl.textContent = handLabels;
    playerScoreEl.textContent = scoreHand(hand);
    discardTopEl.textContent = '—';
    stockCountEl.textContent = '—';
}

newRoundBtn.addEventListener('click', () => {
    const state = newRound(3);
    render(state);
    console.log('New round:', state);
});

// Example hands for verification
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
    renderHand(hand);
    console.log(`Example ${exampleIndex + 1}:`, hand.map(cardLabel).join(', '), '-> Score:', scoreHand(hand));
    exampleIndex = (exampleIndex + 1) % exampleHands.length;
});
