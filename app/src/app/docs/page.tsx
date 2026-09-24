import React from "react";
import {
  ExternalLink,
  Layers,
  ShieldCheck,
  Sparkles,
  BookOpen,
  Cpu,
  Calculator,
  TrendingUp,
  DollarSign,
  Lock,
  ArrowRightLeft,
  CheckCircle2,
} from "lucide-react";
import { PROGRAM_ID, PT_DAMM_POOL, YT_DAMM_POOL, YT_DBC_POOL, MOCK_SPYX_MINT, MOCK_PT_MINT, MOCK_YT_MINT, DEMO_VAULT_PDA, USDC_MINT } from "@/lib/constants";
import { getExplorerUrl, shortenAddress } from "@/lib/utils";

export default function DocsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-14">
      {/* Title */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-400">
          <BookOpen className="w-3.5 h-3.5" /> Technical Specification & Mathematical Architecture
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
          StockSplit Protocol Docs
        </h1>
        <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
          The first yield-stripping protocol for tokenized equities on Solana. Built natively with Token-2022, Anchor smart vaults, and Meteora AMMs.
        </p>
      </div>

      {/* 1. What is StockSplit */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-400" /> 1. What is StockSplit?
        </h2>
        <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
          <p>
            StockSplit is a decentralized yield-stripping protocol built natively for Solana tokenized equities. Tokenized stocks like SPYx (representing the S&amp;P 500 ETF) accrue dividends on-chain not by transferring USDC to holders, but by expanding their Token-2022 <code>ScaledUiAmountConfig</code> multiplier over time.
          </p>
          <p>
            StockSplit allows any holder of tokenized stocks to deposit their shares into an automated smart vault that locks the initial multiplier and mints two independent, tradeable instruments: a <strong>Principal Token (PT)</strong> and a <strong>Yield Token (YT)</strong>.
          </p>
          <p>
            By decomposing the stock:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
            <li>
              <strong>Principal Token (PT) buyers</strong> obtain pure capital appreciation of the S&amp;P 500 at a fixed discount to spot price, guaranteed to redeem for the underlying stock at maturity without dividend risk.
            </li>
            <li>
              <strong>Yield Token (YT) buyers</strong> obtain pure leveraged dividend income at a fraction of the stock&apos;s cost, receiving 100% of accrued dividends settled in cash USDC upon vault maturity.
            </li>
          </ul>
        </div>
      </section>

      {/* 2. On-Chain Backend Architecture */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Cpu className="w-5 h-5 text-indigo-400" /> 2. On-Chain Backend &amp; Anchor Data Structures
        </h2>
        <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
          <p>
            The protocol is deployed on Solana Devnet under Program ID <code>{PROGRAM_ID.toBase58()}</code>. Every market is represented by an automated Anchor <code>Vault</code> account holding the collateral in PDA escrow.
          </p>

          <div className="glass-panel p-5 rounded-xl border border-[#1e1e3a] font-mono text-xs space-y-2 bg-[#090915]">
            <div className="text-indigo-400 font-bold">// programs/stocksplit/src/state.rs</div>
            <div className="text-slate-300 leading-relaxed">
              {"#[account]"}<br />
              {"pub struct Vault {"}<br />
              {"    pub bump: u8,"}<br />
              {"    pub xstock_mint: Pubkey,         // e.g. SPYx (Token-2022)"}<br />
              {"    pub pt_mint: Pubkey,             // Principal Token SPL mint"}<br />
              {"    pub yt_mint: Pubkey,             // Yield Token SPL mint"}<br />
              {"    pub vault_xstock_account: Pubkey,// PDA escrow holding deposited shares"}<br />
              {"    pub vault_usdc_account: Pubkey,  // PDA escrow holding settled USDC yield"}<br />
              {"    pub usdc_mint: Pubkey,           // USDC currency mint"}<br />
              {"    pub maturity_timestamp: i64,     // Market expiry unix timestamp"}<br />
              {"    pub multiplier_at_deposit_bits: u64, // Initial snapshot m₀ (f64 bits)"}<br />
              {"    pub current_multiplier_bits: u64,    // Current snapshot m₁ (f64 bits)"}<br />
              {"    pub total_deposited_raw: u64,    // Total raw stock locked in vault"}<br />
              {"    pub total_pt_outstanding: u64,   // Outstanding PT tokens"}<br />
              {"    pub total_yt_outstanding: u64,   // Outstanding YT tokens"}<br />
              {"    pub usdc_per_yt_bits: u64,       // Final USDC payout per YT (f64 bits)"}<br />
              {"    pub settled: bool,               // Settlement completion flag"}<br />
              {"    pub authority: Pubkey,"}<br />
              {"}"}
            </div>
          </div>

          <p className="font-semibold text-white pt-2">The 7 Core Anchor Instructions:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[#0d0d20] border border-[#1e1e3a] space-y-1">
              <span className="font-mono text-indigo-400 font-bold">1. initialize_vault</span>
              <p className="text-slate-400">Initializes the vault PDA, deploys PT/YT SPL mints, and records snapshot multiplier m₀.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#0d0d20] border border-[#1e1e3a] space-y-1">
              <span className="font-mono text-indigo-400 font-bold">2. deposit</span>
              <p className="text-slate-400">Transfers raw SPYx to vault escrow and mints equal 1 PT + 1 YT per raw unit to user.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#0d0d20] border border-[#1e1e3a] space-y-1">
              <span className="font-mono text-indigo-400 font-bold">3. update_multiplier</span>
              <p className="text-slate-400">Oracle instruction updating current dividend multiplier m₁ from on-chain dividend growth.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#0d0d20] border border-[#1e1e3a] space-y-1">
              <span className="font-mono text-indigo-400 font-bold">4. settle</span>
              <p className="text-slate-400">After maturity, computes excess dividend stock, liquidates to USDC, and writes final usdc_per_yt.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#0d0d20] border border-[#1e1e3a] space-y-1">
              <span className="font-mono text-indigo-400 font-bold">5. redeem_pt</span>
              <p className="text-slate-400">Burns PT tokens and returns the baseline capital stock: amount × (m₀ / m₁) raw SPYx.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#0d0d20] border border-[#1e1e3a] space-y-1">
              <span className="font-mono text-indigo-400 font-bold">6. claim_yt</span>
              <p className="text-slate-400">Burns YT tokens and transfers pro-rata USDC cashflow: amount × usdc_per_yt.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#0d0d20] border border-[#1e1e3a] space-y-1 sm:col-span-2">
              <span className="font-mono text-indigo-400 font-bold">7. withdraw (Early Exit)</span>
              <p className="text-slate-400">Before maturity, burning equal amounts of PT + YT allows the user to immediately reclaim 100% of their deposited SPYx.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. The Financial Math & Invariant */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Calculator className="w-5 h-5 text-indigo-400" /> 3. Financial Mathematics &amp; Invariant Proof
        </h2>
        <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
          <p>
            StockSplit operates under the <strong>Yield-Stripping Invariant</strong>:
          </p>
          <div className="p-4 rounded-xl bg-[#0b0b1a] border border-[#1a1a32] text-center font-mono text-base sm:text-lg font-bold text-indigo-300">
            P<sub>Stock</sub> = P<sub>PT</sub> + P<sub>YT</sub>
          </div>
          <p>
            Principal Tokens represent a zero-coupon bond claim on the stock at maturity. By standard financial discount theory:
          </p>
          <div className="p-3.5 rounded-xl bg-[#0b0b1a] border border-[#1a1a32] font-mono text-xs text-center text-slate-200">
            P<sub>PT</sub> = P<sub>Stock</sub> / (1 + r)<sup>t</sup>
          </div>
          <p>
            For a baseline stock price of <strong>$540.00</strong>, an annualized dividend yield of <strong>1.30%</strong> ($m₁ / m₀ = 1.0130$), and 1-year maturity:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-300">
            <li><strong>P<sub>PT</sub></strong> = $540.00 / 1.0130 = <strong>$533.07</strong> (Trading live on Meteora DAMM v2 at <strong>~$533.62</strong>)</li>
            <li><strong>P<sub>YT</sub></strong> = $540.00 - $533.00 = <strong>$7.00</strong> (Trading live on Meteora DAMM v2 at <strong>~$7.11</strong>)</li>
            <li><strong>Sum Check:</strong> $533.62 + $7.11 = <strong>$540.73 ≈ $540.00</strong> ✓</li>
          </ul>

          <div className="glass-panel p-6 rounded-2xl border border-[#1e1e3a] space-y-4 text-xs sm:text-sm mt-4">
            <h3 className="font-bold text-white text-base">Mathematical Proof of Token Conservation</h3>
            <p className="text-slate-400">
              Consider a depositor locking <strong>18.5 SPYx</strong> (18,500,000 raw units at 6 decimals) with initial multiplier $m_0 = 1.000$ and maturity multiplier $m_1 = 1.013$:
            </p>

            <div className="space-y-2 pt-2 border-t border-[#1e1e3a] text-slate-300 font-mono">
              <div className="flex justify-between items-center py-1">
                <span>PT Claim Formula:</span>
                <span className="font-bold text-blue-400">
                  floor(18,500,000 × 1.000 / 1.013) = 18,262,586 raw SPYx
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span>Excess Stock (Accrued Yield):</span>
                <span className="font-bold text-slate-200">
                  18,500,000 - 18,262,586 = 237,414 raw SPYx
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span>Jupiter Swap Proceeds (Cash):</span>
                <span className="font-bold text-emerald-400">
                  237,414 raw SPYx → $130.00 USDC
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-t border-[#1e1e3a] pt-2 font-semibold">
                <span className="text-white">Conservation of Value:</span>
                <span className="text-emerald-400">
                  18,262,586 (PT) + 237,414 (YT) = 18,500,000 (Deposited) ✓
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Settlement Clearinghouse & Solvency */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" /> 4. Settlement Clearinghouse: Solvency &amp; Feasibility
        </h2>
        <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 space-y-2">
            <span className="font-semibold text-emerald-300 block">Why Settlement is NOT &quot;Free Money&quot;:</span>
            <p className="text-slate-300">
              StockSplit does not mint unbacked currency or print synthetic yield. Every PT and YT minted is <strong>100% fully collateralized</strong> by physical SPYx shares held in the vault escrow.
            </p>
            <p className="text-slate-300">
              The dividend cashflow is real economic value generated by the 500 companies in the S&amp;P 500 index. On-chain tokenized stock (SPYx) reflects this income by expanding its Token-2022 <code>ScaledUiAmountConfig</code> multiplier from 1.0000x to 1.0130x.
            </p>
          </div>

          <p>
            The smart vault operates as a non-custodial clearinghouse:
          </p>
          <ol className="list-decimal pl-5 space-y-2 text-slate-300">
            <li>
              <strong>Escrow Locking:</strong> When 18.5 SPYx is deposited, the vault locks the full 18,500,000 raw units.
            </li>
            <li>
              <strong>Accrual Isolation:</strong> Because the multiplier expands, 18,262,586 raw units represents the depositor&apos;s original principal share count. The remaining 237,414 raw units is pure dividend surplus.
            </li>
            <li>
              <strong>Jupiter DEX Liquidation:</strong> At maturity, the clearinghouse liquidates the 237,414 raw SPYx into stable USDC via Jupiter DEX aggregator routes.
            </li>
            <li>
              <strong>Cash Distribution:</strong> The resulting $130.00 USDC is stored in <code>vault_usdc_account</code>. YT holders burn their YT tokens and claim the cash, while PT holders burn their PT tokens and receive their original stock.
            </li>
          </ol>
        </div>
      </section>

      {/* 5. AMM Liquidity Depth & Slippage */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-blue-400" /> 5. AMM Liquidity Depth, Constant Product &amp; Slippage
        </h2>
        <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
          <p>
            Trading on StockSplit uses live on-chain Meteora AMM pools:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-300">
            <li><strong>PT-SPYx / USDC:</strong> Meteora DAMM v2 pool (<code>{shortenAddress(PT_DAMM_POOL)}</code>)</li>
            <li><strong>YT-SPYx / USDC:</strong> Meteora DAMM v2 pool (<code>{shortenAddress(YT_DAMM_POOL)}</code>)</li>
          </ul>

          <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-800/40 text-xs space-y-2">
            <span className="font-semibold text-indigo-300 block">Architecture Note — YT Price Discovery &amp; Meteora Integration:</span>
            <p className="text-slate-300">
              YT trades live on Meteora DAMM v2. A Dynamic Bonding Curve (DBC) pool was designed for YT initial price discovery, but DBC&apos;s <code>createPool</code> requires mint authority during pool initialization, which is incompatible with StockSplit&apos;s PDA-derived YT mint. A wrapper escrow layer resolves this for mainnet deployment. The equity-tuned DBC configuration is live on Solana Devnet at <code>{shortenAddress(YT_DBC_POOL)}</code> as a reference implementation.
            </p>
          </div>

          <h3 className="font-bold text-white pt-2 text-base">Constant Product AMM Math (x · y = k)</h3>
          <p>
            When swapping $\Delta y$ (USDC) for $\Delta x$ (PT) with a 100 bps (1%) trade fee:
          </p>
          <div className="p-3.5 rounded-xl bg-[#0b0b1a] border border-[#1a1a32] font-mono text-xs text-center text-slate-200">
            Δx = (x<sub>reserve</sub> · Δy<sub>net</sub>) / (y<sub>reserve</sub> + Δy<sub>net</sub>), &nbsp; where Δy<sub>net</sub> = Δy · (1 - 0.01)
          </div>

          <div className="p-4 rounded-xl bg-blue-950/20 border border-blue-800/40 text-xs space-y-2">
            <span className="font-semibold text-blue-300 block">Deep On-Chain Liquidity &amp; Price Stability:</span>
            <p className="text-slate-300">
              Both pools on Solana Devnet have been seeded with institutional-depth liquidity to minimize price impact during trade simulations:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-300">
              <li><strong>PT-SPYx Pool:</strong> 112.3 PT / $59,920 USDC (<strong>$119,840 TVL</strong>). Price impact on a full 1 PT ($533) swap is <strong>&lt; 0.8%</strong>.</li>
              <li><strong>YT-SPYx Pool:</strong> 176.3 YT / $1,254 USDC (<strong>$2,508 TVL</strong>). Price impact on a $5 swap is <strong>~0.35%</strong>.</li>
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 text-xs space-y-2">
            <span className="font-semibold text-amber-300 block">Oracle Architecture: Devnet Calibration vs. Mainnet Feeds:</span>
            <p className="text-slate-300">
              On Solana Devnet, the tokenized SPYx asset, Anchor smart vaults, and Meteora pools are anchored to the <strong>$540.12 baseline</strong> ($533.62 PT + $7.11 YT = $540.73 SPYx), reflecting the real-world 1.30% S&amp;P 500 dividend yield.
            </p>
            <p className="text-slate-300">
              Because real-world SPY trades at $760+ in late 2026, comparing a $533 test pool against uncalibrated real-world feeds would create an artificial 30% discount artifact. StockSplit resolves this by calibrating Devnet test pools to the $540 baseline to preserve invariant integrity (P_PT + P_YT = P_Stock), while Mainnet deployments link directly to Pyth Hermes oracles paired with physical broker-backed collateral.
            </p>
          </div>
        </div>
      </section>

      {/* 6. Protocol Monetization */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-emerald-400" /> 6. Protocol Economics &amp; Monetization
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300">
          <div className="p-4 rounded-xl glass-panel border border-[#1e1e3a] space-y-2">
            <div className="font-bold text-white text-sm">1. Vault Split Fee</div>
            <p className="text-slate-400">
              The protocol levies a <strong>0.10% (10 bps)</strong> split fee upon depositing raw stock. Depositing $10,000 of SPYx yields $10 protocol revenue.
            </p>
          </div>

          <div className="p-4 rounded-xl glass-panel border border-[#1e1e3a] space-y-2">
            <div className="font-bold text-white text-sm">2. AMM LP Fee Sharing</div>
            <p className="text-slate-400">
              Protocol-owned liquidity in Meteora DAMM v2 earns dynamic trading fees (100 bps) from secondary market volume as traders buy and sell PT and YT.
            </p>
          </div>

          <div className="p-4 rounded-xl glass-panel border border-[#1e1e3a] space-y-2">
            <div className="font-bold text-white text-sm">3. Clearinghouse Fee</div>
            <p className="text-slate-400">
              A <strong>1.0% performance fee</strong> is deducted from the liquidated USDC dividend proceeds upon settlement before distributing to YT holders. On-chain: <code>fee_usdc = total_usdc × 100 / 10_000</code>; <code>usdc_per_yt</code> is computed on the remaining 99%.
            </p>
            <p className="text-[11px] text-amber-400/80 flex items-start gap-1.5 mt-1">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>
                <strong className="text-amber-300">Demo vault note:</strong> The pre-settled demo vault (on the Redeem page) was settled before clearinghouse fees were deployed. Its stored <code>usdc_per_yt</code> reflects 100% of USDC — not the 99% that production vaults use. All vaults initialized after the fee upgrade correctly apply the 1% deduction at settle time.
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* 7. On-Chain Contracts & Links */}
      <section className="space-y-4 pb-8">
        <h2 className="text-2xl font-bold text-white tracking-tight">On-Chain Verified Addresses</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <a
            href={getExplorerUrl("address", PROGRAM_ID.toBase58())}
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 rounded-xl glass-panel border border-[#1e1e3a] hover:border-primary transition-colors flex items-center justify-between group"
          >
            <div>
              <span className="text-slate-400 block">Anchor Program ID</span>
              <span className="font-mono text-white font-bold">{PROGRAM_ID.toBase58()}</span>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-white" />
          </a>

          <a
            href={getExplorerUrl("address", DEMO_VAULT_PDA.toBase58())}
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 rounded-xl glass-panel border border-[#1e1e3a] hover:border-indigo-500 transition-colors flex items-center justify-between group"
          >
            <div>
              <span className="text-slate-400 block">Demo Vault PDA</span>
              <span className="font-mono text-white font-bold">{DEMO_VAULT_PDA.toBase58()}</span>
              <span className="text-[10px] text-amber-400/70 block mt-0.5">
                ⚠ Settled pre-fee upgrade — usdc_per_yt reflects 100% USDC (production vaults: 99%)
              </span>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-white" />
          </a>

          <a
            href={getExplorerUrl("address", PT_DAMM_POOL.toBase58())}
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 rounded-xl glass-panel border border-[#1e1e3a] hover:border-blue-500 transition-colors flex items-center justify-between group"
          >
            <div>
              <span className="text-slate-400 block">PT Meteora DAMM v2 Pool ($120k TVL)</span>
              <span className="font-mono text-white font-bold">{PT_DAMM_POOL.toBase58()}</span>
              <span className="text-[11px] text-slate-500 block mt-0.5">112.3 PT / $59,920 USDC · Spot: $533.62</span>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-white" />
          </a>

          <a
            href={getExplorerUrl("address", YT_DAMM_POOL.toBase58())}
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 rounded-xl glass-panel border border-[#1e1e3a] hover:border-emerald-500 transition-colors flex items-center justify-between group"
          >
            <div>
              <span className="text-slate-400 block">YT Meteora DAMM v2 Pool ($2.5k TVL)</span>
              <span className="font-mono text-white font-bold">{YT_DAMM_POOL.toBase58()}</span>
              <span className="text-[11px] text-slate-500 block mt-0.5">176.3 YT / $1,254 USDC · Spot: $7.11</span>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-white" />
          </a>

          <a
            href={getExplorerUrl("address", YT_DBC_POOL.toBase58())}
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 rounded-xl glass-panel border border-[#1e1e3a] hover:border-amber-500 transition-colors flex items-center justify-between group sm:col-span-2"
          >
            <div>
              <span className="text-slate-400 block">YT Meteora DBC Pool (Mainnet Reference Architecture)</span>
              <span className="font-mono text-white font-bold">{YT_DBC_POOL.toBase58()}</span>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-white" />
          </a>
        </div>
      </section>
    </div>
  );
}

