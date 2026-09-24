import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createMintToInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";
import { RPC_URL, MOCK_SPYX_MINT, USDC_MINT } from "@/lib/constants";
import { sendAndConfirmServerTxWithRetry } from "@/lib/solana-tx";

// In-memory rate limiting map (3 seconds between clicks)
const rateLimitMap = new Map<string, number>();

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, assetType = "spyx" } = await req.json();

    if (!walletAddress) {
      return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
    }

    let recipient: PublicKey;
    try {
      recipient = new PublicKey(walletAddress);
    } catch {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const now = Date.now();
    const lastRequest = rateLimitMap.get(`${walletAddress}_${assetType}`);
    if (lastRequest && now - lastRequest < 3000) {
      return NextResponse.json(
        { error: "Please wait a few seconds before requesting again." },
        { status: 429 }
      );
    }

    const mintAuthorityKey = process.env.MOCK_SPYX_MINT_AUTHORITY;
    if (!mintAuthorityKey) {
      return NextResponse.json({ error: "MOCK_SPYX_MINT_AUTHORITY not configured" }, { status: 500 });
    }

    const payer = Keypair.fromSecretKey(bs58.decode(mintAuthorityKey));
    const connection = new Connection(RPC_URL, "confirmed");

    const tx = new Transaction();

    // 1. Refill Both (USDC + SPYx)
    if (assetType === "all") {
      // USDC ATA & Mint (100 USDC)
      const usdcAta = getAssociatedTokenAddressSync(USDC_MINT, recipient, false, TOKEN_PROGRAM_ID);
      const usdcAtaInfo = await connection.getAccountInfo(usdcAta);
      if (!usdcAtaInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            payer.publicKey,
            usdcAta,
            recipient,
            USDC_MINT,
            TOKEN_PROGRAM_ID
          )
        );
      }
      tx.add(
        createMintToInstruction(
          USDC_MINT,
          usdcAta,
          payer.publicKey,
          100_000_000,
          [],
          TOKEN_PROGRAM_ID
        )
      );

      // SPYx ATA & Mint (50 SPYx)
      const spyxAta = getAssociatedTokenAddressSync(
        MOCK_SPYX_MINT,
        recipient,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const spyxAtaInfo = await connection.getAccountInfo(spyxAta);
      if (!spyxAtaInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            payer.publicKey,
            spyxAta,
            recipient,
            MOCK_SPYX_MINT,
            TOKEN_2022_PROGRAM_ID
          )
        );
      }
      tx.add(
        createMintToInstruction(
          MOCK_SPYX_MINT,
          spyxAta,
          payer.publicKey,
          50_000_000,
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );

      const signature = await sendAndConfirmServerTxWithRetry(connection, tx, [payer]);
      rateLimitMap.set(`${walletAddress}_${assetType}`, now);
      return NextResponse.json({
        signature,
        message: "Refilled Both: 100 USDC + 50 SPYx!",
      });
    }

    // 2. USDC Mint request
    if (assetType === "usdc") {
      const usdcAta = getAssociatedTokenAddressSync(USDC_MINT, recipient, false, TOKEN_PROGRAM_ID);
      const ataInfo = await connection.getAccountInfo(usdcAta);
      if (!ataInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            payer.publicKey,
            usdcAta,
            recipient,
            USDC_MINT,
            TOKEN_PROGRAM_ID
          )
        );
      }
      tx.add(
        createMintToInstruction(
          USDC_MINT,
          usdcAta,
          payer.publicKey,
          100_000_000,
          [],
          TOKEN_PROGRAM_ID
        )
      );

      const signature = await sendAndConfirmServerTxWithRetry(connection, tx, [payer]);
      rateLimitMap.set(`${walletAddress}_${assetType}`, now);
      return NextResponse.json({
        signature,
        amount: 100,
        symbol: "USDC",
        message: "Minted 100 mock USDC!",
      });
    }

    // 3. Default: SPYx Token-2022 Mint request
    const recipientAta = getAssociatedTokenAddressSync(
      MOCK_SPYX_MINT,
      recipient,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const ataInfo = await connection.getAccountInfo(recipientAta);
    if (!ataInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          recipientAta,
          recipient,
          MOCK_SPYX_MINT,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }
    tx.add(
      createMintToInstruction(
        MOCK_SPYX_MINT,
        recipientAta,
        payer.publicKey,
        50_000_000,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const signature = await sendAndConfirmServerTxWithRetry(connection, tx, [payer]);
    rateLimitMap.set(`${walletAddress}_${assetType}`, now);

    return NextResponse.json({
      signature,
      amount: 50,
      symbol: "SPYx",
      message: "Minted 50 mock SPYx!",
    });
  } catch (err: any) {
    console.error("Faucet API error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process faucet request" },
      { status: 500 }
    );
  }
}
