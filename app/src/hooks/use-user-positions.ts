"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getProgram } from "@/lib/program";
import { bnToF64 } from "@/lib/utils";
import { DEMO_VAULT_PDA } from "@/lib/constants";

export interface UserPosition {
  vaultPda: string;
  xstockMint: string;
  ptMint: string;
  ytMint: string;
  usdcMint: string;
  maturityTimestamp: number;
  multiplierAtDeposit: number;
  currentMultiplier: number;
  settled: boolean;
  isMatured: boolean;
  ptBalanceRaw: string;
  ptBalance: number;
  ytBalanceRaw: string;
  ytBalance: number;
  /** USDC per YT token (stored on-chain after settlement). 0 if not yet settled. */
  usdcPerYt: number;
}

export function useUserPositions() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPositions = useCallback(
    async (forceFresh = false) => {
      if (!publicKey) {
        setPositions([]);
        setLoading(false);
        return;
      }

      try {
        const program = getProgram(connection);
        const now = Math.floor(Date.now() / 1000);

        // Collect known vault PDAs (Demo vault + any user-created vaults from localStorage)
        let savedVaults: string[] = [];
        try {
          savedVaults = JSON.parse(
            localStorage.getItem("stocksplit_user_vaults") || "[]"
          );
        } catch {}
        const vaultAddresses = Array.from(
          new Set([DEMO_VAULT_PDA.toBase58(), ...savedVaults])
        );
        const vaultPubkeys = vaultAddresses.map((addr) => new PublicKey(addr));

        // PROBLEM 3 FIX: Run balances fetch and batched vault accounts fetch in parallel
        const [tokenMapRes, accountsInfoRes] = await Promise.all([
          // 1. Balances fetch
          (async () => {
            try {
              const url = forceFresh
                ? `/api/balances?wallet=${publicKey.toBase58()}&fresh=true`
                : `/api/balances?wallet=${publicKey.toBase58()}`;
              const res = await fetch(url);
              if (res.ok) {
                const b = await res.json();
                return (b.tokens || {}) as Record<
                  string,
                  { balance: number; raw: string }
                >;
              }
            } catch (err) {
              console.warn("Could not fetch balances for positions:", err);
            }
            return {} as Record<string, { balance: number; raw: string }>;
          })(),

          // PROBLEM 1 FIX: Single batched RPC request for all vault accounts
          connection.getMultipleAccountsInfo(vaultPubkeys, "confirmed"),
        ]);

        const userPositions: UserPosition[] = [];

        // Decode each account using Anchor's BorshAccountsCoder via program.coder.accounts
        for (let i = 0; i < vaultAddresses.length; i++) {
          const pdaStr = vaultAddresses[i];
          const accInfo = accountsInfoRes[i];
          if (!accInfo || !accInfo.data) continue;

          try {
            const vaultAccount: any = program.coder.accounts.decode(
              "vault",
              accInfo.data
            );
            if (!vaultAccount) continue;

            const ptMint = vaultAccount.ptMint.toBase58();
            const ytMint = vaultAccount.ytMint.toBase58();

            const ptData = tokenMapRes[ptMint] || { balance: 0, raw: "0" };
            const ytData = tokenMapRes[ytMint] || { balance: 0, raw: "0" };

            const ptBalance = ptData.balance;
            const ptBalanceRaw = ptData.raw;
            const ytBalance = ytData.balance;
            const ytBalanceRaw = ytData.raw;

            // Display vault if user holds tokens OR if it's the official demo vault
            if (
              ptBalance > 0 ||
              ytBalance > 0 ||
              pdaStr === DEMO_VAULT_PDA.toBase58()
            ) {
              const maturity = vaultAccount.maturityTimestamp.toNumber();
              const multDeposit =
                vaultAccount.multiplierAtDepositBits ||
                vaultAccount.initialMultiplierBits;

              userPositions.push({
                vaultPda: pdaStr,
                xstockMint: vaultAccount.xstockMint.toBase58(),
                ptMint,
                ytMint,
                usdcMint: vaultAccount.usdcMint.toBase58(),
                maturityTimestamp: maturity,
                multiplierAtDeposit: Number(bnToF64(multDeposit).toFixed(6)),
                currentMultiplier: Number(
                  bnToF64(vaultAccount.currentMultiplierBits).toFixed(6)
                ),
                settled: vaultAccount.settled,
                isMatured: now >= maturity,
                ptBalanceRaw,
                ptBalance,
                ytBalanceRaw,
                ytBalance,
                usdcPerYt: vaultAccount.usdcPerYtBits
                  ? bnToF64(vaultAccount.usdcPerYtBits)
                  : 0,
              });
            }
          } catch (decodeErr) {
            console.warn("Could not decode vault account:", pdaStr, decodeErr);
          }
        }

        // PROBLEM 2 FIX: Filter and retain only active vaults with user balance > 0 in localStorage
        const activeUserVaults = userPositions
          .filter(
            (p) =>
              (p.ptBalance > 0 || p.ytBalance > 0) &&
              p.vaultPda !== DEMO_VAULT_PDA.toBase58()
          )
          .map((p) => p.vaultPda);

        try {
          localStorage.setItem(
            "stocksplit_user_vaults",
            JSON.stringify(activeUserVaults)
          );
        } catch {}

        setPositions(userPositions);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching user positions:", err);
        setLoading(false);
      }
    },
    [connection, publicKey]
  );

  useEffect(() => {
    fetchPositions(false);

    // 30-second polling interval so positions stay fresh
    const interval = setInterval(() => fetchPositions(false), 30000);

    const onBalanceUpdate = () => {
      fetchPositions(true);
    };
    window.addEventListener("stocksplit_balance_updated", onBalanceUpdate);

    // Clear interval and listener on component unmount
    return () => {
      clearInterval(interval);
      window.removeEventListener("stocksplit_balance_updated", onBalanceUpdate);
    };
  }, [fetchPositions]);

  return { positions, loading, refetch: () => fetchPositions(true) };
}
