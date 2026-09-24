"use client";

import { useState, useEffect, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { getProgram } from "@/lib/program";
import { bnToF64 } from "@/lib/utils";

export interface VaultData {
  pda: string;
  xstockMint: string;
  ptMint: string;
  ytMint: string;
  usdcMint: string;
  vaultXstockAccount: string;
  vaultUsdcAccount: string;
  maturityTimestamp: number;
  multiplierAtDeposit: number;
  currentMultiplier: number;
  totalDepositedRaw: string;
  totalPtOutstanding: string;
  totalYtOutstanding: string;
  usdcPerYt: number;
  settled: boolean;
  authority: string;
  isMatured: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useVault(vaultPda: PublicKey | null): VaultData {
  const { connection } = useConnection();
  const [data, setData] = useState<VaultData>({
    pda: vaultPda ? vaultPda.toBase58() : "",
    xstockMint: "",
    ptMint: "",
    ytMint: "",
    usdcMint: "",
    vaultXstockAccount: "",
    vaultUsdcAccount: "",
    maturityTimestamp: 0,
    multiplierAtDeposit: 1.0,
    currentMultiplier: 1.0,
    totalDepositedRaw: "0",
    totalPtOutstanding: "0",
    totalYtOutstanding: "0",
    usdcPerYt: 0,
    settled: false,
    authority: "",
    isMatured: false,
    loading: true,
    error: null,
    refetch: async () => {},
  });

  const fetchVault = useCallback(async () => {
    if (!vaultPda) return;
    try {
      const program = getProgram(connection);
      const vault: any = await program.account.vault.fetch(vaultPda);

      const maturity = vault.maturityTimestamp.toNumber();
      const now = Math.floor(Date.now() / 1000);

      setData({
        pda: vaultPda.toBase58(),
        xstockMint: vault.xstockMint.toBase58(),
        ptMint: vault.ptMint.toBase58(),
        ytMint: vault.ytMint.toBase58(),
        usdcMint: vault.usdcMint.toBase58(),
        vaultXstockAccount: vault.vaultXstockAccount.toBase58(),
        vaultUsdcAccount: vault.vaultUsdcAccount.toBase58(),
        maturityTimestamp: maturity,
        multiplierAtDeposit: Number(bnToF64(vault.multiplierAtDepositBits).toFixed(6)),
        currentMultiplier: Number(bnToF64(vault.currentMultiplierBits).toFixed(6)),
        totalDepositedRaw: vault.totalDepositedRaw.toString(),
        totalPtOutstanding: vault.totalPtOutstanding.toString(),
        totalYtOutstanding: vault.totalYtOutstanding.toString(),
        usdcPerYt: Number(bnToF64(vault.usdcPerYtBits).toFixed(6)),
        settled: vault.settled,
        authority: vault.authority.toBase58(),
        isMatured: now >= maturity,
        loading: false,
        error: null,
        refetch: fetchVault,
      });
    } catch (err: any) {
      setData((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "Failed to fetch vault",
        refetch: fetchVault,
      }));
    }
  }, [connection, vaultPda]);

  useEffect(() => {
    fetchVault();
    const interval = setInterval(fetchVault, 25000);
    return () => clearInterval(interval);
  }, [fetchVault]);

  return data;
}
