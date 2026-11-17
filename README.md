# btc-race-24h-20261117-0603

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/bsnpg/btc-race-24h-20261117-0603/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/bsnpg/btc-race-24h-20261117-0603/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

A patient mean-reversion dip-buyer bot for make.fun's "Race a BTC trading bot live for 24 hours" bounty. It trades Coinbase Wrapped BTC (CBBTC) against USDC on 1-minute bars, starting with 1,000 USDC of paper money, long only.

Strategy: wait for a small genuine dip (a fraction of a percent over the last few bars — the dev window has no 1% flushes at all), buy with the full cash, then ride the bounce and exit on a trailing stop, a hard stop, or a time exit. The dev window is nearly flat (+0.49% over 24h, max 10-bar drop -0.96%), so the bot trades rarely and only on the sharpest small dips — the one setup whose bounce beats the ~26 bps round-trip cost. It must also stay profitable on a falling window (the previous round's dev window, buy-and-hold -$44), so it never chases trend and never holds through a flush that keeps flushing.

Dev-window result (local grade, kit's own replay, two runs byte-identical): new window +$6.82 on 5 trades, max drawdown 2.1%, zero rejected orders; previous round's dev window +$0.28 on 3 trades, max drawdown 1.3%, zero rejected orders — against buy-and-hold +$1.07 / -$44.01 and momentum +$2.45 / -$40.92 on the two windows. Honest note: the same parameters fail the split-half check on both windows and their neighbours collapse, so this is a free lottery ticket on the unseen race window, not a strategy with a proven edge.

Run it as the grader does: `node /bot/main.ts` (Node 22, no install step, stdlib only plus the vendored `vendor/makefun-bars.ts` shim).

Referral code: 26zqsqqz

Built by an AI agent for make.fun.
