"use client";

import React, { useEffect, useMemo, useState, ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { RPC_URL } from "@/lib/constants";
import { createSolanaClient } from "@metamask/connect-solana";
import { getWallets } from "@wallet-standard/app";

require("@solana/wallet-adapter-react-ui/styles.css");

const DEVNET_CHAIN = "solana:devnet";
const DEVNET_CAIP = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

/**
 * Monkey-patches Wallet Standard wallets to ensure they always use Solana Devnet.
 * This intercepts calls to signTransaction, signAllTransactions, and signAndSendTransaction,
 * guaranteeing chain: 'solana:devnet' is present so MetaMask extension simulates and signs on Devnet.
 */
function patchWalletStandardWallets() {
  if (typeof window === "undefined") return;

  try {
    const { get, on } = getWallets();

    const patch = (wallet: any) => {
      if (!wallet || !wallet.features) return;

      // Ensure devnet chains are listed in wallet.chains
      if (Array.isArray(wallet.chains)) {
        if (!wallet.chains.includes(DEVNET_CHAIN)) {
          wallet.chains.push(DEVNET_CHAIN);
        }
        if (!wallet.chains.includes(DEVNET_CAIP)) {
          wallet.chains.push(DEVNET_CAIP);
        }
      }

      // If wallet has a scope property (like MetaMask), ensure it points to Devnet
      if (wallet.scope !== undefined) {
        wallet.scope = DEVNET_CAIP;
      }


      // 1. Patch solana:signTransaction
      const signTxFeature = wallet.features["solana:signTransaction"];
      if (signTxFeature && !signTxFeature.__stocksplit_patched) {
        signTxFeature.__stocksplit_patched = true;
        const origSign = signTxFeature.signTransaction;
        signTxFeature.signTransaction = async (...inputs: any[]) => {
          const patchedInputs = inputs.map((inp) => ({
            ...inp,
            chain: inp.chain || DEVNET_CHAIN,
          }));
          return origSign.apply(signTxFeature, patchedInputs);
        };
      }

      // 2. Patch solana:signAllTransactions
      const signAllTxFeature = wallet.features["solana:signAllTransactions"];
      if (signAllTxFeature && !signAllTxFeature.__stocksplit_patched) {
        signAllTxFeature.__stocksplit_patched = true;
        const origSignAll = signAllTxFeature.signAllTransactions;
        signAllTxFeature.signAllTransactions = async (...inputs: any[]) => {
          const patchedInputs = inputs.map((inp) => ({
            ...inp,
            chain: inp.chain || DEVNET_CHAIN,
          }));
          return origSignAll.apply(signAllTxFeature, patchedInputs);
        };
      }

      // 3. Patch solana:signAndSendTransaction
      const signAndSendFeature = wallet.features["solana:signAndSendTransaction"];
      if (signAndSendFeature && !signAndSendFeature.__stocksplit_patched) {
        signAndSendFeature.__stocksplit_patched = true;
        const origSignAndSend = signAndSendFeature.signAndSendTransaction;
        signAndSendFeature.signAndSendTransaction = async (...inputs: any[]) => {
          const patchedInputs = inputs.map((inp) => ({
            ...inp,
            chain: inp.chain || DEVNET_CHAIN,
          }));
          return origSignAndSend.apply(signAndSendFeature, patchedInputs);
        };
      }
    };

    // Patch all existing registered wallets
    get().forEach(patch);

    // Listen for future wallet registrations
    on("register", (...newWallets: any[]) => {
      newWallets.forEach(patch);
    });
  } catch (err) {
    console.warn("Wallet standard patch error:", err);
  }
}

// Cast providers to avoid React 18/19 JSX element type mismatch
const AnyConnectionProvider = ConnectionProvider as any;
const AnyWalletProvider = WalletProvider as any;
const AnyWalletModalProvider = WalletModalProvider as any;

export function SolanaProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => RPC_URL, []);
  const wallets = useMemo(() => [], []);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    // Patch standard wallets immediately
    patchWalletStandardWallets();

    try {
      createSolanaClient({
        dapp: {
          name: "StockSplit",
          url: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
        },
        api: {
          supportedNetworks: {
            devnet: RPC_URL,
          },
        },
      })
        .then((client) => {
          if (typeof window !== "undefined") {
            (window as any).__metamaskSolanaClient = client;

            // Intercept invokeMethod on the Multichain client provider
            // to ensure solana requests are routed under DEVNET scope
            const multichainProvider = client.core?.provider as any;
            if (multichainProvider && !multichainProvider.__stocksplit_patched) {
              multichainProvider.__stocksplit_patched = true;
              const origInvoke = multichainProvider.invokeMethod;
              multichainProvider.invokeMethod = async (args: any) => {
                if (
                  args?.scope?.startsWith?.("solana:") &&
                  !args.scope.includes("EtWTRABZaYq6iMfeYKouRu166VU2xqa1")
                ) {
                  args.scope = DEVNET_CAIP;
                }
                if (
                  args?.request?.params?.scope?.startsWith?.("solana:") &&
                  !args.request.params.scope.includes("EtWTRABZaYq6iMfeYKouRu166VU2xqa1")
                ) {
                  args.request.params.scope = DEVNET_CAIP;
                }
                return origInvoke.call(multichainProvider, args);
              };
            }

            // Run wallet patching again after client creation
            patchWalletStandardWallets();
          }
          if (active) setReady(true);
        })
        .catch((err) => {
          console.warn("MetaMask Connect Solana client error:", err);
          if (active) setReady(true);
        });
    } catch (e) {
      console.warn("MetaMask Connect Solana setup error:", e);
      if (active) setReady(true);
    }

    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return null;
  }

  return (
    <AnyConnectionProvider endpoint={endpoint}>
      <AnyWalletProvider wallets={wallets} autoConnect>
        <AnyWalletModalProvider>{children}</AnyWalletModalProvider>
      </AnyWalletProvider>
    </AnyConnectionProvider>
  );
}
