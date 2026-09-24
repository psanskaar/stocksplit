const MAINNET_SCOPE = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const DEVNET_SCOPE = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

let hasAlignedOnce = false;
let isAligning = false;

export async function alignToDevnet(wallet?: any, force = false): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if ((hasAlignedOnce && !force) || isAligning) return true;

  isAligning = true;
  hasAlignedOnce = true;

  let aligned = false;

  const walletName = (
    wallet?.adapter?.name ||
    (wallet?.adapter as any)?.wallet?.name ||
    ""
  ).toLowerCase();
  const isMetaMask = walletName.includes("metamask");

  // 1. MetaMask Connect Multichain Core: Disconnect Mainnet and Connect Devnet (ONLY if user is using MetaMask)
  if (isMetaMask) {
    try {
      const mmClient = (window as any).__metamaskSolanaClient;
      if (mmClient?.core) {
        const session = await mmClient.core.provider?.getSession();
        const hasDevnet = Boolean(session?.sessionScopes?.[DEVNET_SCOPE]);

        if (!hasDevnet && force) {
          console.log("[StockSplit] Connecting Solana Devnet scope to MetaMask...");
          try {
            await mmClient.core.connect([DEVNET_SCOPE], []);
            aligned = true;
          } catch (e) {
            console.warn("[StockSplit] Connect devnet scope error:", e);
          }
        } else if (hasDevnet) {
          aligned = true;
        }

        // Ensure the wallet object scope property is explicitly set to Devnet
        const walletObj = typeof mmClient.getWallet === "function" ? mmClient.getWallet() : null;
        if (walletObj) {
          walletObj.scope = DEVNET_SCOPE;
        }
      }
    } catch (err) {
      console.warn("[StockSplit] MultichainCore align error:", err);
    }
  }

  // 2. Wallet Standard programmatic network change
  try {
    const standardWallet = (wallet?.adapter as any)?.wallet;
    if (standardWallet?.features?.["solana:changeNetwork"]) {
      await standardWallet.features["solana:changeNetwork"].changeNetwork({
        chain: "solana:devnet",
      });
      aligned = true;
    }
  } catch (e) {}

  // 3. window.solana?.changeNetwork
  try {
    if ((window as any).solana?.changeNetwork) {
      await (window as any).solana.changeNetwork("devnet");
      aligned = true;
    }
  } catch (e) {}

  // 4. Update localStorage
  try {
    localStorage.setItem("stocksplit_wallet_network", "devnet");
  } catch (e) {}

  hasAlignedOnce = true;
  return aligned;
}
