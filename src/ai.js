// Suit tiebreak order: C, D, H, S
const SUIT_PRIORITY = ['♣', '♦', '♥', '♠'];

/**
 * Pick the best target suit from a hand (highest same-suit total).
 * Ties broken by suit order: C, D, H, S.
 */
export function pickTargetSuit(hand, cardValueFn) {
    const totals = {};
    for (const card of hand) {
        totals[card.suit] = (totals[card.suit] || 0) + cardValueFn(card);
    }

    let bestSuit = null;
    let bestTotal = -1;

    for (const suit of SUIT_PRIORITY) {
        const total = totals[suit] || 0;
        if (total > bestTotal) {
            bestTotal = total;
            bestSuit = suit;
        }
    }
    return bestSuit;
}

/**
 * Choose which card index to discard.
 * - Off-suit cards: discard the highest-value one.
 * - All target suit: discard the lowest-value card.
 */
export function chooseDiscardIndex(hand, cardValueFn) {
    const targetSuit = pickTargetSuit(hand, cardValueFn);

    // Find off-suit cards
    const offSuit = hand
        .map((card, i) => ({ card, i }))
        .filter(({ card }) => card.suit !== targetSuit);

    if (offSuit.length > 0) {
        // Discard lowest-value off-suit card (keep higher ones as fallback)
        let worst = offSuit[0];
        for (let j = 1; j < offSuit.length; j++) {
            if (cardValueFn(offSuit[j].card) < cardValueFn(worst.card)) {
                worst = offSuit[j];
            }
        }
        return worst.i;
    }

    // All cards are target suit — discard the lowest-value card
    let worstIdx = 0;
    let worstVal = cardValueFn(hand[0]);
    for (let i = 1; i < hand.length; i++) {
        const v = cardValueFn(hand[i]);
        if (v < worstVal) {
            worstVal = v;
            worstIdx = i;
        }
    }
    return worstIdx;
}
