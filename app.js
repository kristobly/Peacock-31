import { cardLabel } from './src/cards.js';
import { newRound } from './src/game.js';

const newRoundBtn = document.getElementById('new-round-btn');
const playerHandEl = document.getElementById('player-hand');
const discardTopEl = document.getElementById('discard-top');
const stockCountEl = document.getElementById('stock-count');

function render(state) {
    const handLabels = state.players[0].hand.map(cardLabel).join('  ');
    playerHandEl.textContent = handLabels;
    discardTopEl.textContent = cardLabel(state.discardTop);
    stockCountEl.textContent = state.stockCount;
}

newRoundBtn.addEventListener('click', () => {
    const state = newRound(3);
    render(state);
    console.log('New round:', state);
});
