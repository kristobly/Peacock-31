import { createDeck, shuffle, deal } from './cards.js';
import { scoreHand, cardValue } from './rules.js';

/**
 * Start a new game with the given number of players.
 * Returns the initial game state.
 */
export function startGame(numPlayers) {
    const deck = shuffle(createDeck());

    const players = [];
    for (let i = 0; i < numPlayers; i++) {
        players.push({ hand: deal(deck, 3), quarters: 4 });
    }

    // Turn top card face-up to start the discard pile
    const discard = deal(deck, 1);

    return {
        players,
        currentPlayerIndex: 0,
        phase: 'needDraw',
        stock: deck,
        discard,
        // Round-ending fields
        knocked: false,
        knockerIndex: null,
        finalTurnsRemaining: 0,
        roundOver: false,
        roundResultType: 'normal',
        instant31WinnerIndex: null,
        hammerAvailable: true
    };
}

/**
 * Compute suit totals for a hand.
 * Returns an object like { '♠': 26, '♥': 10, ... }
 */
export function suitTotals(hand) {
    const totals = {};
    for (const card of hand) {
        if (!totals[card.suit]) {
            totals[card.suit] = 0;
        }
        totals[card.suit] += cardValue(card);
    }
    return totals;
}

/**
 * Check if a hand has exactly 31 in any suit.
 */
export function hasInstant31(hand) {
    const totals = suitTotals(hand);
    return Object.values(totals).some(total => total === 31);
}

/**
 * Check if any player has instant 31. If so, end the round.
 * Returns true if instant 31 was found.
 */
export function checkInstant31(state) {
    if (state.roundOver) {
        return false;
    }

    for (let i = 0; i < state.players.length; i++) {
        if (hasInstant31(state.players[i].hand)) {
            state.roundOver = true;
            state.roundResultType = 'instant31';
            state.instant31WinnerIndex = i;
            return true;
        }
    }
    return false;
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

    state.hammerAvailable = false;
    const card = state.stock.shift();
    state.players[state.currentPlayerIndex].hand.push(card);
    state.phase = 'needDiscard';
    checkInstant31(state);
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

    state.hammerAvailable = false;
    const card = state.discard.pop();
    state.players[state.currentPlayerIndex].hand.push(card);
    state.phase = 'needDiscard';
    checkInstant31(state);
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

    // Handle knock final turns
    if (state.knocked && state.currentPlayerIndex !== state.knockerIndex) {
        state.finalTurnsRemaining--;
        if (state.finalTurnsRemaining <= 0) {
            state.roundOver = true;
        }
    }

    // Advance to next player
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;

    // Check for instant 31 after discard
    checkInstant31(state);
    return true;
}

/**
 * Knock to end the round. Only works when:
 * - It's the current player's turn
 * - Phase is "needDraw"
 * - No one has knocked yet
 */
export function knock(state) {
    if (state.phase !== 'needDraw') {
        return false;
    }
    if (state.knocked) {
        return false;
    }

    state.knocked = true;
    state.knockerIndex = state.currentPlayerIndex;
    state.finalTurnsRemaining = state.players.length - 1;

    // Advance to next player (knocker's turn is done)
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    return true;
}

/**
 * Hammer: Player 1 ends the round immediately on the first turn
 * before anyone draws. Everyone scores their dealt hands.
 */
export function hammer(state) {
    if (!state.hammerAvailable) return false;
    if (state.currentPlayerIndex !== 0) return false;
    if (state.phase !== 'needDraw') return false;
    if (state.roundOver) return false;

    state.roundOver = true;
    state.roundResultType = 'hammer';
    state.hammerAvailable = false;
    return true;
}

/**
 * Score the round and return results.
 * Returns { scores: number[], losers: number[] }
 */
export function scoreRound(state) {
    const scores = state.players.map(p => scoreHand(p.hand));

    // For instant 31, all players except the winner are losers
    if (state.roundResultType === 'instant31') {
        const losers = [];
        for (let i = 0; i < state.players.length; i++) {
            if (i !== state.instant31WinnerIndex) {
                losers.push(i);
            }
        }
        return { scores, losers };
    }

    // Normal scoring: lowest score(s) lose
    const minScore = Math.min(...scores);
    const losers = scores
        .map((score, index) => (score === minScore ? index : -1))
        .filter(index => index !== -1);

    return { scores, losers };
}

/**
 * Apply round results by subtracting 1 quarter from each loser.
 */
export function applyRoundResults(state, losers) {
    for (const loserIndex of losers) {
        state.players[loserIndex].quarters = Math.max(0, state.players[loserIndex].quarters - 1);
    }
}

/**
 * Start the next round: re-deal hands/stock/discard, reset round fields.
 * Preserves players' quarters.
 */
export function startNextRound(state) {
    const deck = shuffle(createDeck());

    // Re-deal hands
    for (const player of state.players) {
        player.hand = deal(deck, 3);
    }

    // Turn top card face-up to start the discard pile
    state.discard = deal(deck, 1);
    state.stock = deck;

    // Reset round fields
    state.currentPlayerIndex = 0;
    state.phase = 'needDraw';
    state.knocked = false;
    state.knockerIndex = null;
    state.finalTurnsRemaining = 0;
    state.roundOver = false;
    state.roundResultType = 'normal';
    state.instant31WinnerIndex = null;
    state.hammerAvailable = true;
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
