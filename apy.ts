// test.ts
// run:  bun run test.ts  (or node)

// ────────────────────────────────────────────────────────────
// constants you already had
const ACC_PRECISION = 1_000_000_000_000n; // 1e12
const ONE_YEAR_SECONDS = 31_536_000n; // 365 d
const DECIMALS = 1_000_000_000_000_000_000n; // 1e18 (ZAMM & ETH)

// stream & pool state (read on-chain)
const rewardRate = 81018518518518518518518518518n; // wei ·1e12 / s
const totalShares = 168_657_147_013_251_654_493n; // LP shares

// your wallet
const myShares = 247_483_464_475_940_139n; // 247_483_464_475_940_139n; // LP shares you hold

// market data (hard-coded for now)
const zammPriceEth = 0.00004938560562505; // 1 ZAMM → ETH
const poolTvlEth = 97.612; // 48.806 ETH side × 2

// ────────────────────────────────────────────────────────────
// 1) per-share reward flow (still ×1e12)
const rewardPerSharePerYearScaled = 15149076367331469n; // (rewardRate * ONE_YEAR_SECONDS) / totalShares;

console.log("rewardPerSharePerYearScaled", rewardPerSharePerYearScaled);

// 2) drop 1e12 scaling  → wei / share / year
const rewardPerSharePerYearWei = rewardPerSharePerYearScaled / ACC_PRECISION;

console.log("rewardPerSharePerYearWei", rewardPerSharePerYearWei);

// 3) convert to human tokens
const tokensPerSharePerYear =
  Number(rewardPerSharePerYearWei) / Number(DECIMALS);

console.log("tokensPerSharePerYear", tokensPerSharePerYear);

// 4) your yearly ZAMM
const myYearlyZamm = tokensPerSharePerYear * Number(myShares);

console.log("myYearlyZamm", myYearlyZamm);

// 5) reward value in ETH
const rewardEthYear = myYearlyZamm * zammPriceEth;

console.log("rewardEthYear", rewardEthYear);

// 6) your LP stake value in ETH
const stakeEth = (Number(myShares) / Number(totalShares)) * poolTvlEth;
console.log("share of pool", Number(myShares) / Number(totalShares));
console.log("stakeEth", stakeEth);
// 7) simple APR %
const aprPct = (rewardEthYear / stakeEth) * 100;

// ────────────────────────────────────────────────────────────
console.log("─ zChef APR quick-calc ─");
console.log("Per-share / year  :", rewardPerSharePerYearWei.toString(), "wei");
console.log("                  :", tokensPerSharePerYear, "ZAMM");
console.log("ZAMM Price ETH    :", zammPriceEth.toFixed(6), "ETH");
console.log("------------------------");
console.log("Your yearly ZAMM  :", myYearlyZamm.toFixed(4), "ZAMM");
console.log("Reward value      :", rewardEthYear.toFixed(6), "ETH");
console.log("Stake value       :", stakeEth.toFixed(6), "ETH");
console.log("------------------------");
console.log("Simple APR        :", aprPct.toFixed(2), "%");
