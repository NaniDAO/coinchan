# PAMM: A simple guide to how our prediction markets work

**TL;DR**
PAMM is a **pari-mutuel** market. When the event resolves, **winners split a shared wstETH pot**. It's **not** a fixed "$1 if YES" system. You profit if your **average cost per share ≤ payout per share at resolution**. Being right on the outcome isn't always enough if you bought late/expensive.

---

## What you're buying

* A **YES** or **NO** share is a **claim on a shared pot** of wstETH.
* The **displayed odds** come from the on-chain YES/NO pool (like a price). They move as people trade.

## How payouts work

When the market resolves:

* **Payout per winning share** =
  **pot (after any resolver fee)** ÷ **circulating winning shares**
  *(Shares held by the protocol/AMM don't count in the denominator.)*
* Your total payout = **your winning shares × payout per share**.

> **Not fixed payout:** There's no guaranteed $1 per winning share. Payout depends on how much was contributed to the pot and how many winning shares exist.

## "I won the bet but lost money"—why that can happen

* If you **bought late** on the already-favored side, your **average cost per share** might be **higher** than the final payout per share (because many other buyers minted more winning shares, diluting the split).
* Result: you're right on the outcome, but your **cost > payout**, so you lose a bit.

## How you make money here

1. **Be early & right (hold to resolution).**
   Buy when you believe the true chance is higher than the current odds. If later trading and/or the losing side's spend grows the pot relative to your entry cost, your **payout per share > your cost**.
2. **Trade the move (before resolution).**
   Buy when you think odds will rise; **sell** later if your refund quote exceeds your cost. (Quotes already include the tiny 0.10% pool fee; refunds are capped by the pot.)

## Fees & fairness

* A small **0.10% market-quality fee** is baked into every trade quote.
  It **discourages spammy in-and-out trades** and helps the price reflect real conviction.
  **No extra fee is taken at claim.**

## Timing rules

* **Trading is open** until the market's **close time**.
* After close (and after resolution), **trading is disabled**; winners can **claim** once resolved.

## Simple example

* Pot ends at **10 wstETH**.
* Circulating winning shares = **12.5**.
* **Payout per share = 10 / 12.5 = 0.8 wstETH.**
* If your **avg cost per share** was **0.65**, you profit (0.8 > 0.65).
* If your avg cost was **0.85**, you "won" but lose a bit at payout (0.8 < 0.85).

## Pro tips for new traders

* **Check two numbers before you buy:**

  * **Projected payout if resolved now** (pot ÷ current circulating winners)
  * **Your avg cost per share** (shown on your ticket)
    Aim for **projected payout ≥ your cost**.
* **Late buys on a heavy favorite** can still lose money at resolution—consider taking profits **before** resolution if your sell quote is above your cost.
* **Short windows & on-chain outcomes** (like ICO milestones) are friendliest to learn on: clear info, clear timelines.

## Why PAMM?

* **On-chain, transparent math** (pot & shares are visible).
* **Capital-efficient** (no $1-per-share collateral requirement).
* **Flexible**: you can hold to resolution or trade the move.

---

### One-liner you'll see in the UI

**Not a fixed-payout market — winners split a shared pot; profit when your average cost per share is at or below the final payout per share.**
