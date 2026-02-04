/**
 * Get the point value of a card.
 * A = 11, J/Q/K = 10, number cards = face value
 */
export function cardValue(card) {
    if (card.rank === 'A') return 11;
    if (['J', 'Q', 'K'].includes(card.rank)) return 10;
    return parseInt(card.rank, 10);
}

/**
 * Score a 3-card hand.
 * - Compute total points by suit, take the maximum suit total
 * - If all three cards are different suits, score is the highest single card value
 */
export function scoreHand(hand) {
    // Group cards by suit and sum their values
    const suitTotals = {};
    for (const card of hand) {
        if (!suitTotals[card.suit]) {
            suitTotals[card.suit] = 0;
        }
        suitTotals[card.suit] += cardValue(card);
    }

    // Find the maximum suit total
    const maxSuitTotal = Math.max(...Object.values(suitTotals));

    // If all three cards are different suits, the max will just be a single card's value
    // which is exactly what we want (highest single card)
    return maxSuitTotal;
}
