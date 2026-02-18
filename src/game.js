import { createDeck, shuffle, deal } from './cards.js';
import { scoreHand, cardValue, isInstant31 } from './rules.js';

/**
 * Start a new game with the given number of players.
 * Returns the initial game state.
 */
export function startGame(numPlayers) {
    const deck = shuffle(createDeck());

    const players = [];
    for (let i = 0; i < numPlayers; i++) {
        players.push({ hand: deal(deck, 3), quarters: 4, out: false });
    }

    // Turn top card face-up to start the discard pile
    const discard = deal(deck, 1);

    return {
        numPlayers,
        players,
        startingPlayerIndex: 0,
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
        hammerAvailable: true,
        gameOver: false,
        winnerIndex: null
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
 * Delegates to isInstant31 which requires exactly 3 same-suit cards summing to 31.
 */
export function hasInstant31(hand) {
    return isInstant31(hand);
}

/**
 * For a 4-card hand, find which card to discard to achieve an instant 31 3-card hand.
 * Tries skipping each index in order (0,1,2,3); returns the first skip index where
 * the remaining 3 cards form an instant 31. Returns -1 if none found.
 */
function findInstant31DiscardIndex(hand) {
    if (hand.length !== 4) return -1;
    for (let skip = 0; skip < 4; skip++) {
        const subset = hand.filter((_, i) => i !== skip);
        if (isInstant31(subset)) return skip;
    }
    return -1;
}

/**
 * Check if any player has instant 31 (exactly 3 same-suit cards totaling 31).
 * If so, end the round. Returns true if instant 31 was found.
 */
export function checkInstant31(state) {
    if (state.roundOver) {
        return false;
    }

    for (let i = 0; i < state.players.length; i++) {
        if (state.players[i].out) continue;
        if (isInstant31(state.players[i].hand)) {
            state.roundOver = true;
            state.roundResultType = 'instant31';
            state.instant31WinnerIndex = i;
            return true;
        }
    }
    return false;
}

/**
 * Advance to the next active (non-out) player after the given index.
 */
function nextActivePlayer(state, fromIndex) {
    let next = (fromIndex + 1) % state.players.length;
    const start = next;
    while (state.players[next].out) {
        next = (next + 1) % state.players.length;
        if (next === start) break; // safety: all out (shouldn't happen)
    }
    return next;
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
    const hand = state.players[state.currentPlayerIndex].hand;
    hand.push(card);

    // Auto-complete: if the 4-card hand contains a 31 subset, discard the extra card
    const skipIdx = findInstant31DiscardIndex(hand);
    if (skipIdx >= 0) {
        const discarded = hand.splice(skipIdx, 1)[0];
        state.discard.push(discarded);
        state.roundOver = true;
        state.roundResultType = 'instant31';
        state.instant31WinnerIndex = state.currentPlayerIndex;
        state.phase = 'needDraw';
        return true;
    }

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
    const hand = state.players[state.currentPlayerIndex].hand;
    hand.push(card);

    // Auto-complete: if the 4-card hand contains a 31 subset, discard the extra card
    const skipIdx = findInstant31DiscardIndex(hand);
    if (skipIdx >= 0) {
        const discarded = hand.splice(skipIdx, 1)[0];
        state.discard.push(discarded);
        state.roundOver = true;
        state.roundResultType = 'instant31';
        state.instant31WinnerIndex = state.currentPlayerIndex;
        state.phase = 'needDraw';
        return true;
    }

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

    // Advance to next active player (skip eliminated players)
    state.currentPlayerIndex = nextActivePlayer(state, state.currentPlayerIndex);

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
    // Only active (non-out) players besides the knocker get final turns
    state.finalTurnsRemaining = state.players.filter(p => !p.out).length - 1;

    // Advance to next active player (knocker's turn is done)
    state.currentPlayerIndex = nextActivePlayer(state, state.currentPlayerIndex);
    return true;
}

/**
 * Hammer: the starting player ends the round immediately on the first turn
 * before anyone draws. Everyone scores their dealt hands.
 */
export function hammer(state) {
    if (!state.hammerAvailable) return false;
    if (state.currentPlayerIndex !== state.startingPlayerIndex) return false;
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
    // Use hand length to determine who played this round (empty hand = didn't participate)
    const played = state.players.map(p => p.hand.length > 0);
    const scores = state.players.map(p => p.hand.length === 0 ? 0 : scoreHand(p.hand));

    // For instant 31, all participating players except the winner are losers
    if (state.roundResultType === 'instant31') {
        const losers = [];
        for (let i = 0; i < state.players.length; i++) {
            if (i !== state.instant31WinnerIndex && played[i]) {
                losers.push(i);
            }
        }
        return { scores, losers };
    }

    // Normal scoring: lowest score(s) among participating players lose
    const activeScores = scores.filter((_, i) => played[i]);
    const minScore = Math.min(...activeScores);
    const losers = scores
        .map((score, index) => (played[index] && score === minScore ? index : -1))
        .filter(index => index !== -1);

    return { scores, losers };
}

/**
 * Apply round results by subtracting 1 quarter from each loser.
 */
export function applyRoundResults(state, losers) {
    for (const loserIndex of losers) {
        state.players[loserIndex].quarters = Math.max(0, state.players[loserIndex].quarters - 1);
        if (state.players[loserIndex].quarters === 0) {
            state.players[loserIndex].out = true;
        }
    }

    // Check if only one active player remains
    const activePlayers = state.players
        .map((p, i) => ({ index: i, active: !p.out }))
        .filter(p => p.active);

    if (activePlayers.length <= 1) {
        state.gameOver = true;
        state.winnerIndex = activePlayers.length === 1 ? activePlayers[0].index : null;
        state.roundOver = true;
    }
}

/**
 * Start the next round: re-deal hands/stock/discard, reset round fields.
 * Preserves players' quarters.
 */
export function startNextRound(state) {
    if (state.gameOver) return false;

    const deck = shuffle(createDeck());

    // Re-deal hands: only active players get cards
    for (const player of state.players) {
        if (player.out) {
            player.hand = [];
        } else {
            player.hand = deal(deck, 3);
        }
    }

    // Turn top card face-up to start the discard pile
    state.discard = deal(deck, 1);
    state.stock = deck;

    // Reset round fields
    state.phase = 'needDraw';
    state.knocked = false;
    state.knockerIndex = null;
    state.finalTurnsRemaining = 0;
    state.roundOver = false;
    state.roundResultType = 'normal';
    state.instant31WinnerIndex = null;
    state.hammerAvailable = true;

    // Rotate starting player to the next active player
    state.startingPlayerIndex = nextActivePlayer(state, state.startingPlayerIndex);
    state.currentPlayerIndex = state.startingPlayerIndex;
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

/**
 * Create a brand new game, resetting all state including quarters/out.
 */
export function newGame(numPlayers) {
    return startGame(numPlayers);
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
