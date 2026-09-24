import React from "react";
import { CheckCircle2, ChevronRight, Clock, ShieldCheck, Trophy, Undo2 } from "lucide-react";

export function LifecycleTimeline() {
  const stages = [
    {
      title: "Stage 1: Before Maturity",
      status: "Active",
      badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      actions: [
        { name: "Trade on AMM / DBC", desc: "PT on DAMM v2, YT on DBC" },
        { name: "Withdraw Early", desc: "Burn matching PT + YT to exit" },
      ],
      icon: Undo2,
    },
    {
      title: "Stage 2: After Maturity",
      status: "Matured",
      badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      actions: [
        { name: "Snapshot Multiplier", desc: "Calculates dividend excess" },
        { name: "Settle Vault", desc: "Permissionless (callable by anyone)" },
      ],
      icon: Clock,
    },
    {
      title: "Stage 3: After Settlement",
      status: "Settled",
      badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      actions: [
        { name: "Redeem PT", desc: "Burn PT for original SPYx value" },
        { name: "Claim YT", desc: "Burn YT for 100% USDC dividends" },
      ],
      icon: Trophy,
    },
  ];

  return (
    <div className="w-full glass-panel p-6 rounded-2xl border border-[#1e1e3a] space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Vault Lifecycle & State Machine
        </h3>
        <span className="text-xs text-slate-500">StockSplit On-Chain Rules</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stages.map((st, idx) => {
          const Icon = st.icon;
          return (
            <div
              key={st.title}
              className="p-4 rounded-xl bg-[#0d0d20] border border-[#1e1e3a] space-y-3 relative"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-white">{st.title}</span>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${st.badge}`}>
                  {st.status}
                </span>
              </div>

              <div className="space-y-1.5 pt-1">
                {st.actions.map((act) => (
                  <div key={act.name} className="text-xs flex items-start gap-1.5 text-slate-400">
                    <span className="text-emerald-400">✓</span>
                    <div>
                      <strong className="text-slate-200">{act.name}:</strong> {act.desc}
                    </div>
                  </div>
                ))}
              </div>

              {idx < stages.length - 1 && (
                <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 text-slate-600 z-10">
                  <ChevronRight className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
