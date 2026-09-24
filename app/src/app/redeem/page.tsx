"use client";

import React from "react";
import { DemoBanner } from "@/components/demo-banner";
import { DemoVaultCard } from "@/components/demo-vault-card";
import { PositionCard } from "@/components/position-card";
import { LifecycleTimeline } from "@/components/lifecycle-timeline";
import { useUserPositions } from "@/hooks/use-user-positions";
import { useWallet } from "@solana/wallet-adapter-react";
import { Layers, Loader2 } from "lucide-react";

export default function RedeemPage() {
  const { connected } = useWallet();
  const { positions, loading, refetch } = useUserPositions();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <DemoBanner />

      {/* Top Pre-Settled Demo Vault */}
      <div className="space-y-3">
        <DemoVaultCard />
      </div>

      {/* User Positions Section */}
      <div id="positions" className="space-y-4 scroll-mt-24">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" /> Your Positions
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Vaults across Solana where you currently hold PT or YT tokens.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="glass-panel p-8 rounded-2xl border border-[#1e1e3a] flex items-center justify-center text-slate-400 gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Scanning vaults on Solana devnet...</span>
          </div>
        ) : !connected ? (
          <div className="glass-panel p-8 rounded-2xl border border-[#1e1e3a] text-center text-slate-400 text-sm">
            Connect your wallet to see your active and matured positions.
          </div>
        ) : positions.length === 0 ? (
          <div className="glass-panel p-8 rounded-2xl border border-[#1e1e3a] text-center text-slate-400 text-sm space-y-2">
            <p>No active positions found in your connected wallet.</p>
            <p className="text-xs text-slate-500">
              Split SPYx on the Split page, or click &quot;Get demo position&quot; in the banner above!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {positions.map((pos) => (
              <PositionCard key={pos.vaultPda} position={pos} onRefresh={refetch} />
            ))}
          </div>
        )}
      </div>

      {/* Lifecycle Timeline */}
      <LifecycleTimeline />
    </div>
  );
}
