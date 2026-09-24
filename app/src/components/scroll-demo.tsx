"use client";

import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, DollarSign, Layers, Shield, Sparkles } from "lucide-react";
import { useSpyxPrice } from "@/hooks/use-spyx-price";
import { usePtPool } from "@/hooks/use-pt-pool";
import { useYtPool } from "@/hooks/use-yt-pool";

export function ScrollDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { spyxPrice } = useSpyxPrice();
  const ptPool = usePtPool();
  const ytPool = useYtPool();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  // Step opacity & translation transforms
  const step1Opacity = useTransform(scrollYProgress, [0.1, 0.25, 0.4], [0, 1, 0.3]);
  const step2Opacity = useTransform(scrollYProgress, [0.35, 0.5, 0.65], [0, 1, 0.3]);
  const step3Opacity = useTransform(scrollYProgress, [0.6, 0.75, 0.95], [0, 1, 1]);

  return (
    <section ref={containerRef} className="py-28 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      <div className="text-center space-y-3 mb-16">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
          Interactive Architecture
        </span>
        <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
          How StockSplit Works
        </h2>
        <p className="text-slate-400 max-w-xl mx-auto text-sm">
          Scroll down to see tokenized S&P 500 equities split into two independent, tradeable instruments.
        </p>
      </div>

      <div className="space-y-12">
        {/* Step 1 */}
        <motion.div
          style={{ opacity: step1Opacity }}
          className="glass-panel p-6 sm:p-8 rounded-2xl border border-[#1e1e3a] relative overflow-hidden group hover:border-indigo-500/40 transition-colors"
        >
          <div className="flex flex-col md:flex-row items-center gap-6 justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-primary-glow">
                <Layers className="w-8 h-8" />
              </div>
              <div>
                <span className="text-xs font-mono text-indigo-400 font-semibold">STEP 01</span>
                <h3 className="text-xl font-bold text-white">Deposit Underlying Stock</h3>
                <p className="text-sm text-slate-400">You hold 18.5 SPYx (~${spyxPrice > 0 ? (18.5 * spyxPrice).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "..."} spot value at ${spyxPrice > 0 ? spyxPrice.toFixed(0) : "..."}/share)</p>
              </div>
            </div>

            <div className="bg-[#1a1a36] px-5 py-3 rounded-xl border border-[#2a2a50] text-center">
              <span className="text-xs text-slate-400 block">Initial Multiplier</span>
              <span className="font-mono text-lg font-bold text-white">1.000000x</span>
            </div>
          </div>
        </motion.div>

        {/* Step 2 */}
        <motion.div
          style={{ opacity: step2Opacity }}
          className="glass-panel p-6 sm:p-8 rounded-2xl border border-[#1e1e3a] relative overflow-hidden group hover:border-indigo-500/40 transition-colors"
        >
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-emerald-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <Sparkles className="w-8 h-8 text-indigo-400" />
              </div>
              <div>
                <span className="text-xs font-mono text-indigo-400 font-semibold">STEP 02</span>
                <h3 className="text-xl font-bold text-white">The Split: 1 SPYx → 1 PT + 1 YT</h3>
                <p className="text-sm text-slate-400">
                  The stock splits 1:1 into Principal Token (price) and Yield Token (dividends).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* PT Card */}
              <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-800/40 shadow-pt-glow">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="font-bold text-blue-400 text-sm">PT-SPYx (Principal)</span>
                </div>
                <p className="text-xs text-slate-300">
                  Entitles you to the stock at maturity without dividends. Trades at a discount (~${ptPool.price > 0 ? `$${ptPool.price.toFixed(0)}` : "..."}).
                </p>
              </div>

              {/* YT Card */}
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/40 shadow-yt-glow">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="font-bold text-emerald-400 text-sm">YT-SPYx (Yield)</span>
                </div>
                <p className="text-xs text-slate-300">
                  Entitles you to all future dividend accruals swapped to USDC. Trades on Meteora (~${ytPool.price > 0 ? `$${ytPool.price.toFixed(2)}` : "..."}).
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Step 3 */}
        <motion.div
          style={{ opacity: step3Opacity }}
          className="glass-panel p-6 sm:p-8 rounded-2xl border border-[#1e1e3a] relative overflow-hidden group hover:border-emerald-500/40 transition-colors"
        >
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <Shield className="w-8 h-8" />
              </div>
              <div>
                <span className="text-xs font-mono text-emerald-400 font-semibold">STEP 03</span>
                <h3 className="text-xl font-bold text-white">Maturity & Settlement</h3>
                <p className="text-sm text-slate-400">
                  Trade them independently anytime or hold until maturity to redeem cash and stock.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[#1a1a36] border border-[#2a2a50]">
                <span className="text-xs text-blue-400 font-semibold block mb-1">PT Holder Redemption</span>
                <div className="text-lg font-bold text-white font-mono">18,262,586 raw SPYx</div>
                <div className="text-xs text-slate-400 mt-1">Exact UI value of $9,870 SPYx stock preserved</div>
              </div>

              <div className="p-4 rounded-xl bg-[#1a1a36] border border-[#2a2a50]">
                <span className="text-xs text-emerald-400 font-semibold block mb-1">YT Holder Dividend Payout</span>
                <div className="text-lg font-bold text-emerald-400 font-mono">$130.00 USDC</div>
                <div className="text-xs text-slate-400 mt-1">100% of accrued dividends distributed directly in cash</div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
