import { Connection, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import idl from "./idl.json";
import { PROGRAM_ID, RPC_URL } from "./constants";

export function getProgram(connection?: Connection, wallet?: any): Program {
  const conn = connection || new Connection(RPC_URL, "confirmed");
  
  let wrappedWallet = wallet;
  if (wallet && wallet.signTransaction) {
    wrappedWallet = {
      ...wallet,
      signTransaction: async (tx: any) => {
        if (!tx.recentBlockhash) {
          const { blockhash } = await conn.getLatestBlockhash("confirmed");
          tx.recentBlockhash = blockhash;
        }
        if (!tx.feePayer && wallet.publicKey) {
          tx.feePayer = wallet.publicKey;
        }
        return wallet.signTransaction(tx);
      },
      signAllTransactions: async (txs: any[]) => {
        const { blockhash } = await conn.getLatestBlockhash("confirmed");
        for (const tx of txs) {
          if (!tx.recentBlockhash) {
            tx.recentBlockhash = blockhash;
          }
          if (!tx.feePayer && wallet.publicKey) {
            tx.feePayer = wallet.publicKey;
          }
        }
        return wallet.signAllTransactions(txs);
      },
    };
  }

  const provider = new AnchorProvider(
    conn,
    wrappedWallet || {
      publicKey: PublicKey.default,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any) => txs,
    },
    { commitment: "confirmed", preflightCommitment: "confirmed" }
  );
  return new Program(idl as any, PROGRAM_ID, provider);
}
