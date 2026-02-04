import { createDeck, shuffle, deal } from './cards.js';

export function newRound(numPlayers) {
    const deck = shuffle(createDeck());

    const players = [];
    for (let i = 0; i < numPlayers; i++) {
        players.push({ hand: deal(deck, 3) });
    }

    const discardTop = deal(deck, 1)[0];

    return {
        players,
        discardTop,
        stockCount: deck.length
    };
}
