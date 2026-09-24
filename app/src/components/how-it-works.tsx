import React from "react";
import { ArrowRight, Coins, Repeat, Sparkles, Trophy } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Deposit SPYx",
      description: "Deposit tokenized S&P 500 equity into the StockSplit smart vault on Solana.",
      icon: Coins,
    },
    {
      num: "02",
      title: "Receive PT + YT",
      description: "Vault mints 1 PT (principal) and 1 YT (yield) for each raw stock token deposited.",
      icon: Sparkles,
    },
    {
      num: "03",
      title: "Trade or Hold",
      description: "Trade PT on Meteora DAMM v2 or YT on Meteora DBC. Recombine anytime before maturity.",
      icon: Repeat,
    },
    {
      num: "04",
      title: "Redeem at Maturity",
      description: "PT redeems for original stock value; YT claims 100% of accrued dividends in USDC.",
      icon: Trophy,
    },
  ];

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#1e1e3a]">
      <div className="text-center space-y-3 mb-16">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
          Protocol Lifecycle
        </span>
        <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
          Four Steps from Deposit to Yield
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {steps.map((s, idx) => {
          const Icon = s.icon;
          return (
            <div
              key={s.num}
              className="glass-panel p-6 rounded-2xl border border-[#1e1e3a] relative flex flex-col justify-between hover:border-primary/40 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-500">{s.num}</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{s.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{s.description}</p>
              </div>

              {idx < steps.length - 1 && (
                <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-slate-600">
                  <ArrowRight className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
