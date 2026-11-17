// A1: adaptive-volatility dip buyer for the CBBTC/USDC 1-minute replay.
//
// Entry: buy with all the cash when the close has fallen over the last
// 10 bars by more than an adaptive threshold — twice the realised
// volatility of the last 20 one-minute returns, scaled by sqrt(10) —
// and the latest bar closed up, while the 60-bar return is above -50 bps
// (no buying into a slide that is still sliding). The threshold tracks
// the tape: about 33 bps on the flat new dev window, about 53 bps on
// the falling old one.
//
// Exit: sell the whole position when its value trails 250 bps below the
// best value seen since entry, or 300 bps below cost, or after 240 bars
// held. At most one order per batch, always the full cash on a buy and
// the full position on a sell, capped at 100 bps of slippage from the
// close the order was decided on.
//
// Verified against the exact-integer Python replay (backtest.py):
// new dev window +$6.82 on 5 trades (max drawdown 2.1%), old dev window
// +$0.28 on 3 trades (max drawdown 1.3%), zero rejected orders. The
// numbers are a lottery ticket, not an edge: the same parameters fail
// the split-half check on both windows and their neighbours collapse,
// so this entry is submitted as a free shot at the race window, not as
// a strategy with a proven advantage.
//
// Nothing here reads the wall clock, the environment, or any randomness:
// every decision is a pure function of the closes the harness has sent
// and the account it reports, so two runs on the same bars answer every
// batch with the same orders.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Stdev lookback for the realised-volatility threshold, in bars. */
const VOL_WINDOW = 20;
/** Threshold multiplier: entry needs a 10-bar drop of K * stdev20 * sqrt(10). */
const THRESHOLD_K = 2.0;
/** The entry looks back this many bars for the drop. */
const LOOKBACK = 10;
/** Entry needs the 60-bar return above this, in bps (blocks buying a slide). */
const REGIME_CUTOFF_BPS = -50n;
/** Exit when the position's value trails this far below its peak, in bps. */
const TRAIL_BPS = 250n;
/** Exit when the position's value falls this far below its cost, in bps. */
const HARD_STOP_BPS = 300n;
/** Exit after holding this many batches, whatever the price. */
const MAX_HOLD_BARS = 240;
/** An order is refused if it would fill further than this past the close. */
const MAX_SLIPPAGE_BPS = 100;
/** Both windows are 1,440 one-minute bars; never order on the last batch. */
const WINDOW_BARS = 1440;

/** Every CBBTC close the bot has been sent, in bar order (bigints, exact). */
const closes: bigint[] = [];
/** One-minute returns in bps, as integers (rets[0] = 0); rets[i] pairs with closes[i]. */
const rets: number[] = [];
/** The series index at which the current position was bought, if any. */
let entrySeq: number | null = null;
/** The best value the current position has reached, in micro-USDC. */
let peakValue: bigint = 0n;

/** Integer floor division (BigInt / truncates toward zero; this floors). */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  const r = a % b;
  return r !== 0n && a < 0n ? q - 1n : q;
}

/** Stdev, in bps, of the last VOL_WINDOW one-minute returns, ending at the latest bar. */
function realizedVol(): number {
  const w = rets.slice(Math.max(0, rets.length - VOL_WINDOW));
  if (w.length < 2) return 0;
  let mean = 0;
  for (const x of w) mean += x;
  mean /= w.length;
  let ss = 0;
  for (const x of w) {
    const d = x - mean;
    ss += d * d;
  }
  return Math.sqrt(ss / w.length);
}

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    // Warm-up batches are history, not the scored window: ignore them.
    if (state.warmingUp) return [];
    for (const bar of batch.bars) {
      if (bar.symbol !== SYMBOL) continue;
      const c = BigInt(bar.c);
      if (closes.length === 0) {
        closes.push(c);
        rets.push(0);
      } else {
        const prev = closes[closes.length - 1]!;
        rets.push(Number(floorDiv((c - prev) * 10000n, prev)));
        closes.push(c);
      }
    }
    // Series index of the bar just closed (0-based, like the replay's k).
    const i = closes.length - 1;
    // Never order on the last batch: the harness would refuse it (after_end)
    // and the position is flattened at the last close anyway.
    if (i >= WINDOW_BARS - 1) return [];

    const held = state.positions.get(SYMBOL);
    if (held === undefined || held.qty === 0n) {
      // Flat: forget any old entry bookkeeping and look for a dip.
      entrySeq = null;
      peakValue = 0n;
      if (i <= LOOKBACK) return [];
      const now = closes[i]!;
      const then = closes[i - LOOKBACK]!;
      const dropBps = floorDiv((then - now) * 10000n, then);
      const threshold = THRESHOLD_K * realizedVol() * Math.sqrt(LOOKBACK);
      if (Number(dropBps) < threshold) return [];
      // Confirm the flush is turning: the latest bar closed up.
      if (now <= closes[i - 1]!) return [];
      // Regime: do not buy when the last 60 bars fell more than 50 bps.
      if (i >= 60) {
        const ret60 = floorDiv((now - closes[i - 60]!) * 10000n, closes[i - 60]!);
        if (ret60 <= REGIME_CUTOFF_BPS) return [];
      }
      // Never send a buy the market must refuse: below the $1 minimum
      // notional it comes back rejected, and a rejection is a wasted
      // batch (the cash here is ~$1,000, so this never triggers in
      // practice — it is a guard, not a strategy branch).
      if (state.cash < 1000000n) return [];
      entrySeq = i;
      peakValue = state.cash;
      const buy: BuyInput = {
        side: 'buy',
        symbol: SYMBOL,
        notional_quote_units: state.cash,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      };
      return [buy];
    }

    // Holding: keep the peak value current and test the three exits.
    const value = state.value(SYMBOL, held.qty);
    if (value > peakValue) peakValue = value;
    const trailHit = peakValue > 0n && value * 10000n <= peakValue * (10000n - TRAIL_BPS);
    const stopHit = value * 10000n <= held.cost * (10000n - HARD_STOP_BPS);
    const timeHit = entrySeq !== null && i - entrySeq >= MAX_HOLD_BARS;
    if (trailHit || stopHit || timeHit) {
      const sell: SellInput = {
        side: 'sell',
        symbol: SYMBOL,
        qty: held.qty,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      };
      return [sell];
    }
    return [];
  },
});
