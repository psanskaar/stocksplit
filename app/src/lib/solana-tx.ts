import {
  Connection,
  Transaction,
  Keypair,
  TransactionSignature,
} from "@solana/web3.js";

export interface WalletAdapterLike {
  publicKey: any;
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
  sendTransaction?: (
    tx: Transaction,
    connection: Connection,
    options?: any
  ) => Promise<string>;
}

function isBlockhashExpiredError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || err.toString() || "").toLowerCase();
  return (
    msg.includes("block height exceeded") ||
    msg.includes("blockhash not found") ||
    msg.includes("transaction has expired") ||
    msg.includes("blockhash expired") ||
    msg.includes("timeout") ||
    msg.includes("was not confirmed in")
  );
}

/**
 * Execute a transaction on the client side using wallet adapter.
 * - Fetches fresh blockhash immediately before send/sign.
 * - Uses skipPreflight: true to bypass simulation lag.
 * - Uses 'confirmed' commitment.
 * - Confirms with exact blockhash and lastValidBlockHeight.
 * - Retries up to maxRetries on blockhash expiration.
 */
export async function sendAndConfirmWithRetry(
  txOrBuilder: Transaction | (() => Promise<Transaction> | Transaction),
  wallet: WalletAdapterLike,
  connection: Connection,
  options?: {
    maxRetries?: number;
    onSignPrompt?: () => void;
    onSigned?: () => void;
  }
): Promise<TransactionSignature> {
  if (!wallet || !wallet.publicKey) {
    throw new Error("Wallet not connected");
  }

  const maxRetries = options?.maxRetries ?? 3;
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let sig: string = "";
    try {
      // 1. Build fresh transaction instructions
      const tx =
        typeof txOrBuilder === "function" ? await txOrBuilder() : txOrBuilder;

      // 2. Fetch fresh blockhash immediately before signing
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      // 3. Send with skipPreflight: true
      options?.onSignPrompt?.();

      if (wallet.signTransaction) {
        const signed = await wallet.signTransaction(tx);
        sig = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: true,
          preflightCommitment: "confirmed",
          maxRetries: 3,
        });
      } else if (wallet.sendTransaction) {
        sig = await wallet.sendTransaction(tx, connection, {
          skipPreflight: true,
          preflightCommitment: "confirmed",
          maxRetries: 3,
        });
      } else {
        throw new Error("Wallet cannot sign or send transactions");
      }

      options?.onSigned?.();

      // 4. Confirm with exact blockhash and lastValidBlockHeight pair
      const confirmRes = await connection.confirmTransaction(
        {
          signature: sig,
          blockhash,
          lastValidBlockHeight,
        },
        "confirmed"
      );

      if (confirmRes?.value?.err) {
        throw new Error(
          `Transaction failed on-chain: ${JSON.stringify(confirmRes.value.err)}`
        );
      }

      return sig;
    } catch (err: any) {
      lastError = err;

      // If signature was broadcast, check if it actually confirmed despite any client-side timeout
      if (sig) {
        try {
          const status = await connection.getSignatureStatus(sig, {
            searchTransactionHistory: true,
          });
          if (status?.value && !status.value.err) {
            return sig;
          }
        } catch {}
      }

      if (isBlockhashExpiredError(err) && attempt < maxRetries - 1) {
        console.warn(
          `[StockSplit] Blockhash expired on attempt ${attempt + 1}/${maxRetries}. Retrying with fresh blockhash...`
        );
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}

/**
 * Execute a transaction on the server side using Keypair signers.
 * - Fresh blockhash immediately before sign.
 * - skipPreflight: true.
 * - confirmed commitment.
 * - Confirms with exact blockhash and lastValidBlockHeight pair.
 * - Retries up to maxRetries on blockhash expiration.
 */
export async function sendAndConfirmServerTxWithRetry(
  connection: Connection,
  txOrBuilder: Transaction | (() => Promise<Transaction> | Transaction),
  signers: Keypair[],
  options?: { maxRetries?: number }
): Promise<TransactionSignature> {
  const maxRetries = options?.maxRetries ?? 3;
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let sig: string = "";
    try {
      const tx =
        typeof txOrBuilder === "function" ? await txOrBuilder() : txOrBuilder;
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = signers[0].publicKey;

      // Reset and apply signatures
      tx.signatures = [];
      tx.sign(...signers);

      sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        maxRetries: 3,
      });

      const res = await connection.confirmTransaction(
        {
          signature: sig,
          blockhash,
          lastValidBlockHeight,
        },
        "confirmed"
      );

      if (res?.value?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
      }

      return sig;
    } catch (err: any) {
      lastError = err;

      if (sig) {
        try {
          const status = await connection.getSignatureStatus(sig, {
            searchTransactionHistory: true,
          });
          if (status?.value && !status.value.err) {
            return sig;
          }
        } catch {}
      }

      if (isBlockhashExpiredError(err) && attempt < maxRetries - 1) {
        console.warn(
          `[StockSplit Server] Blockhash expired on attempt ${attempt + 1}/${maxRetries}. Retrying with fresh blockhash...`
        );
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}
