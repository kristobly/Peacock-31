# Peacock 31

A browser-based implementation of the card game "Peacock 31" for learning purposes.

## Project Goals

- Build incrementally in small sessions
- Each session ends with something runnable locally
- Prioritize working code over perfect code
- Learn by doing, refactor as understanding grows

## Tech Constraints

- Plain HTML, CSS, and JavaScript only
- No frameworks (React, Vue, etc.)
- No build tools (Webpack, Vite, etc.)
- No npm/node dependencies
- All code runs directly in the browser

## Local Development

Start a local server:
```bash
python3 -m http.server 5173
```

Open in browser: http://localhost:5173/

## Git Workflow

- Commit after each session milestone
- Keep diffs small and focused
- Each commit should leave the game in a runnable state
- Use descriptive commit messages

## Rules Source of Truth

### Overview
31 is a card game for 2+ players using a standard 52-card deck. Players try to collect three cards of the same suit totaling as close to 31 as possible.

### Card Values
- Aces: 11 points
- Face cards (J, Q, K): 10 points each
- Number cards (2-10): face value

### Setup
- Each player starts with 4 quarters (lives)
- Deal 3 cards to each player
- Place remaining deck face-down as the stock pile
- Turn top card face-up to start the discard pile
- Assume 3-card hands always, and scoring is max sum of same-suit cards, otherwise highest single card

### Order of Play
Play moves clockwise, starting with the player to the dealer's left.

On each turn, a player must:
- Draw one card (from either stock or discard pile)
- Discard one card to the discard pile

OR instead of drawing/discarding:
- Knock (if confident their hand beats at least one opponent)
- Call "31" (if they have exactly 31 in one suit, ends round immediately)

### Special Rules

#### The Hammer (First Turn Only)
The player to the dealer's left can, before drawing any cards, throw down their hand immediately. Everyone reveals and scores their dealt hands right away. Lowest score(s) pay. Once any player draws a card, The Hammer is no longer available until the next hand.

#### Knocking
- When a player knocks, all other players get ONE final turn (draw and discard, or stand with current hand)
- Round ends after the player to the knocker's right has their final turn
- If stock runs out before anyone knocks, the round is a draw (no one pays)

#### Instant 31
If a player gets exactly 31 in one suit at any point before someone knocks, they immediately reveal it. Round ends and all other players lose one quarter.

### Scoring
At round end, each player calculates their best score using only cards of the same suit.
- If all three cards are different suits, only the highest single card counts
- Example: 7♠ + 9♥ + K♦ = 10 points (only the King counts)
- Example: 7♠ + 9♠ + K♠ = 26 points (all spades)

### Losing and Paying
- Player(s) with the lowest score lose one quarter
- If multiple players tie for lowest, ALL tied players pay (including the knocker if they're tied)
- Players eliminated when they run out of quarters
- Last player with quarters remaining wins

### Strategic Notes for AI
- Target 31 or high 20s in one suit (A+K+10 = 31, A+K+9 = 30, etc.)
- Track discards to infer which suits opponents are collecting
- Suit switching (discarding different suits on consecutive turns) signals weakness
- Knock timing: Balance confidence in your hand against risk of others improving
- Two-player endgame: After a knock, you can pick up your own just-discarded card
- The Hammer risk: Evaluate your dealt hand, strong hands (20+) might favor using The Hammer to prevent opponents from improving
