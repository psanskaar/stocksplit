"use client";

import { useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import BN from "bn.js";
import { getProgram } from "@/lib/program";
import {
  PROGRAM_ID,
  MOCK_SPYX_MINT,
  USDC_MINT,
  PROTOCOL_SPYX_FEE_ACCOUNT,
  PROTOCOL_USDC_FEE_ACCOUNT,
} from "@/lib/constants";
import { getVaultPda, getPtMintPda, getYtMintPda, f64ToBN } from "@/lib/utils";
import { alignToDevnet } from "@/lib/devnet-align";
import { sendAndConfirmWithRetry } from "@/lib/solana-tx";

export function useStockSplitProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const program = useMemo(() => {
    return getProgram(connection, wallet);
  }, [connection, wallet]);

  async function ensureDevnetScope() {
    if (typeof window === "undefined") return;
    try {
      await alignToDevnet(wallet);
    } catch (err) {
      console.warn("Devnet scope ensure error:", err);
    }
  }

  /** 1. initializeVault */
  async function initializeVault(
    maturityTimestamp: number,
    initialMultiplier: number = 1.0,
    xstockMint: PublicKey = MOCK_SPYX_MINT,
    usdcMint: PublicKey = USDC_MINT,
    onSignPrompt?: () => void,
    onSigned?: () => void
  ): Promise<string> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    await ensureDevnetScope();

    const [vaultPda] = getVaultPda(xstockMint, maturityTimestamp);
    const [ptMint] = getPtMintPda(vaultPda);
    const [ytMint] = getYtMintPda(vaultPda);

    const vaultXstockAccount = getAssociatedTokenAddressSync(
      xstockMint,
      vaultPda,
      true,
      TOKEN_2022_PROGRAM_ID
    );
    const vaultUsdcAccount = getAssociatedTokenAddressSync(
      usdcMint,
      vaultPda,
      true,
      TOKEN_PROGRAM_ID
    );

    return sendAndConfirmWithRetry(
      () =>
        program.methods
          .initializeVault(new BN(maturityTimestamp), f64ToBN(initialMultiplier))
          .accounts({
            authority: wallet.publicKey,
            xstockMint,
            usdcMint,
            vault: vaultPda,
            ptMint,
            ytMint,
            vaultXstockAccount,
            vaultUsdcAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .transaction(),
      wallet,
      connection,
      { onSignPrompt, onSigned }
    );
  }

  /** 2. deposit */
  async function deposit(
    amountRaw: number | BN,
    vaultPda: PublicKey,
    xstockMint: PublicKey = MOCK_SPYX_MINT,
    onSignPrompt?: () => void,
    onSigned?: () => void
  ): Promise<string> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    await ensureDevnetScope();

    const vault: any = await program.account.vault.fetch(vaultPda);
    const ptMint = vault.ptMint;
    const ytMint = vault.ytMint;

    const depositorXstockAccount = getAssociatedTokenAddressSync(
      xstockMint,
      wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const vaultXstockAccount = vault.vaultXstockAccount;

    const depositorPtAccount = getAssociatedTokenAddressSync(
      ptMint,
      wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );
    const depositorYtAccount = getAssociatedTokenAddressSync(
      ytMint,
      wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const bnAmount = typeof amountRaw === "number" ? new BN(amountRaw) : amountRaw;

    return sendAndConfirmWithRetry(
      () =>
        program.methods
          .deposit(bnAmount)
          .accounts({
            depositor: wallet.publicKey,
            vault: vaultPda,
            xstockMint,
            depositorXstockAccount,
            vaultXstockAccount,
            protocolFeeAccount: PROTOCOL_SPYX_FEE_ACCOUNT, // 10 bps split fee collector
            ptMint,
            ytMint,
            depositorPtAccount,
            depositorYtAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .transaction(),
      wallet,
      connection,
      { onSignPrompt, onSigned }
    );
  }

  /** 2b. split (two separate sequential transactions: initializeVault confirmed first, then deposit) */
  async function split(
    amountRaw: number | BN,
    maturityTimestamp: number,
    xstockMint: PublicKey = MOCK_SPYX_MINT,
    initialMultiplier: number = 1.0,
    usdcMint: PublicKey = USDC_MINT,
    onSignPrompt?: () => void,
    onSigned?: () => void
  ): Promise<{ signature: string; vaultPda: PublicKey }> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    await ensureDevnetScope();

    const [vaultPda] = getVaultPda(xstockMint, maturityTimestamp);

    // Check if vault account already exists on devnet
    const vaultInfo = await connection.getAccountInfo(vaultPda, "confirmed");

    if (!vaultInfo) {
      // Step 1: Initialize Vault and wait for full on-chain confirmation
      await initializeVault(
        maturityTimestamp,
        initialMultiplier,
        xstockMint,
        usdcMint,
        onSignPrompt,
        onSigned
      );
    }

    // Step 2: Deposit into confirmed vault
    const depositSig = await deposit(
      amountRaw,
      vaultPda,
      xstockMint,
      onSignPrompt,
      onSigned
    );

    return { signature: depositSig, vaultPda };
  }

  /** 3. updateMultiplier */
  async function updateMultiplier(vaultPda: PublicKey, newMultiplier: number): Promise<string> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    await ensureDevnetScope();

    return sendAndConfirmWithRetry(
      () =>
        program.methods
          .updateMultiplier(f64ToBN(newMultiplier))
          .accounts({
            authority: wallet.publicKey,
            vault: vaultPda,
          })
          .transaction(),
      wallet,
      connection
    );
  }

  /** 4. settle */
  async function settle(vaultPda: PublicKey): Promise<string> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    await ensureDevnetScope();

    const vault: any = await program.account.vault.fetch(vaultPda);
    const callerXstockAccount = getAssociatedTokenAddressSync(
      vault.xstockMint,
      wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    return sendAndConfirmWithRetry(
      () =>
        program.methods
          .settle(Buffer.from([]))
          .accounts({
            caller: wallet.publicKey,
            vault: vaultPda,
            xstockMint: vault.xstockMint,
            vaultXstockAccount: vault.vaultXstockAccount,
            vaultUsdcAccount: vault.vaultUsdcAccount,
            protocolUsdcFeeAccount: PROTOCOL_USDC_FEE_ACCOUNT, // 100 bps clearinghouse fee collector
            callerXstockAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .transaction(),
      wallet,
      connection
    );
  }

  /** 5. redeemPt */
  async function redeemPt(amountRaw: number | BN, vaultPda: PublicKey): Promise<string> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    await ensureDevnetScope();

    const vault: any = await program.account.vault.fetch(vaultPda);
    const redeemerPtAccount = getAssociatedTokenAddressSync(
      vault.ptMint,
      wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );
    const redeemerXstockAccount = getAssociatedTokenAddressSync(
      vault.xstockMint,
      wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const bnAmount = typeof amountRaw === "number" ? new BN(amountRaw) : amountRaw;

    return sendAndConfirmWithRetry(
      async () => {
        const preInstructions = [];
        const xstockInfo = await connection.getAccountInfo(redeemerXstockAccount, "confirmed");
        if (!xstockInfo) {
          preInstructions.push(
            createAssociatedTokenAccountInstruction(
              wallet.publicKey,
              redeemerXstockAccount,
              wallet.publicKey,
              vault.xstockMint,
              TOKEN_2022_PROGRAM_ID
            )
          );
        }

        return program.methods
          .redeemPt(bnAmount)
          .accounts({
            redeemer: wallet.publicKey,
            vault: vaultPda,
            xstockMint: vault.xstockMint,
            vaultXstockAccount: vault.vaultXstockAccount,
            redeemerXstockAccount,
            redeemerPtAccount,
            ptMint: vault.ptMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            token2022Program: TOKEN_2022_PROGRAM_ID,
          })
          .preInstructions(preInstructions)
          .transaction();
      },
      wallet,
      connection
    );
  }

  /** 6. claimYt */
  async function claimYt(amountRaw: number | BN, vaultPda: PublicKey): Promise<string> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    await ensureDevnetScope();

    const vault: any = await program.account.vault.fetch(vaultPda);
    const claimerYtAccount = getAssociatedTokenAddressSync(
      vault.ytMint,
      wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );
    const claimerUsdcAccount = getAssociatedTokenAddressSync(
      vault.usdcMint,
      wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const bnAmount = typeof amountRaw === "number" ? new BN(amountRaw) : amountRaw;

    return sendAndConfirmWithRetry(
      async () => {
        const preInstructions = [];
        const usdcInfo = await connection.getAccountInfo(claimerUsdcAccount, "confirmed");
        if (!usdcInfo) {
          preInstructions.push(
            createAssociatedTokenAccountInstruction(
              wallet.publicKey,
              claimerUsdcAccount,
              wallet.publicKey,
              vault.usdcMint,
              TOKEN_PROGRAM_ID
            )
          );
        }

        return program.methods
          .claimYt(bnAmount)
          .accounts({
            claimer: wallet.publicKey,
            vault: vaultPda,
            vaultUsdcAccount: vault.vaultUsdcAccount,
            claimerUsdcAccount,
            claimerYtAccount,
            ytMint: vault.ytMint,
            usdcMint: vault.usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .preInstructions(preInstructions)
          .transaction();
      },
      wallet,
      connection
    );
  }

  /** 7. withdraw (early exit before maturity) */
  async function withdraw(amountRaw: number | BN, vaultPda: PublicKey): Promise<string> {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    await ensureDevnetScope();

    const vault: any = await program.account.vault.fetch(vaultPda);
    const withdrawerPtAccount = getAssociatedTokenAddressSync(
      vault.ptMint,
      wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );
    const withdrawerYtAccount = getAssociatedTokenAddressSync(
      vault.ytMint,
      wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );
    const withdrawerXstockAccount = getAssociatedTokenAddressSync(
      vault.xstockMint,
      wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const bnAmount = typeof amountRaw === "number" ? new BN(amountRaw) : amountRaw;

    return sendAndConfirmWithRetry(
      () =>
        program.methods
          .withdraw(bnAmount)
          .accounts({
            withdrawer: wallet.publicKey,
            vault: vaultPda,
            xstockMint: vault.xstockMint,
            ptMint: vault.ptMint,
            ytMint: vault.ytMint,
            withdrawerPtAccount,
            withdrawerYtAccount,
            withdrawerXstockAccount,
            vaultXstockAccount: vault.vaultXstockAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .transaction(),
      wallet,
      connection
    );
  }

  return {
    program,
    initializeVault,
    deposit,
    split,
    updateMultiplier,
    settle,
    redeemPt,
    claimYt,
    withdraw,
  };
}
