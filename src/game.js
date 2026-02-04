import { createDeck, shuffle, deal } from './cards.js';

/**
 * Start a new game with the given number of players.
 * Returns the initial game state.
 */
export function startGame(numPlayers) {
    const deck = shuffle(createDeck());

    const players = [];
    for (let i = 0; i < numPlayers; i++) {
        players.push({ hand: deal(deck, 3) });
    }

    // Turn top card face-up to start the discard pile
    const discard = deal(deck, 1);

    return {
        players,
        currentPlayerIndex: 0,
        phase: 'needDraw',
        stock: deck,
        discard
    };
}

/**
 * Draw one card from the stock pile.
 * Only works if phase is "needDraw".
 */
export function drawFromStock(state) {
    if (state.phase !== 'needDraw') {
        return false;
    }
    if (state.stock.length === 0) {
        return false;
    }

    const card = state.stock.shift();
    state.players[state.currentPlayerIndex].hand.push(card);
    state.phase = 'needDiscard';
    return true;
}

/**
 * Draw the top card from the discard pile.
 * Only works if phase is "needDraw".
 */
export function drawFromDiscard(state) {
    if (state.phase !== 'needDraw') {
        return false;
    }
    if (state.discard.length === 0) {
        return false;
    }

    const card = state.discard.pop();
    state.players[state.currentPlayerIndex].hand.push(card);
    state.phase = 'needDiscard';
    return true;
}

/**
 * Discard a card from the current player's hand.
 * Only works if phase is "needDiscard".
 */
export function discardCard(state, handIndex) {
    if (state.phase !== 'needDiscard') {
        return false;
    }

    const hand = state.players[state.currentPlayerIndex].hand;
    if (handIndex < 0 || handIndex >= hand.length) {
        return false;
    }

    const card = hand.splice(handIndex, 1)[0];
    state.discard.push(card);
    state.phase = 'needDraw';

    // Advance to next player
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    return true;
}

/**
 * Get the top card of the discard pile, or null if empty.
 */
export function getTopDiscard(state) {
    if (state.discard.length === 0) {
        return null;
    }
    return state.discard[state.discard.length - 1];
}

// Keep newRound for backward compatibility if needed
export function newRound(numPlayers) {
    const state = startGame(numPlayers);
    return {
        players: state.players,
        discardTop: getTopDiscard(state),
        stockCount: state.stock.length
    };
}
