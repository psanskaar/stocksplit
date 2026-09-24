import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";
import { RPC_URL, MOCK_PT_MINT, MOCK_YT_MINT } from "@/lib/constants";
import { sendAndConfirmServerTxWithRetry } from "@/lib/solana-tx";

export async function POST(req: NextRequest) {
  try {
    const { walletAddress } = await req.json();

    if (!walletAddress) {
      return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
    }

    let recipient: PublicKey;
    try {
      recipient = new PublicKey(walletAddress);
    } catch {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const payerKey = process.env.MOCK_PT_MINT_AUTHORITY || process.env.MOCK_SPYX_MINT_AUTHORITY;
    if (!payerKey) {
      return NextResponse.json({ error: "Server authority not configured" }, { status: 500 });
    }

    const payer = Keypair.fromSecretKey(bs58.decode(payerKey));
    const connection = new Connection(RPC_URL, "confirmed");

    const amountRaw = 18_500_000; // 18.5 PT and 18.5 YT

    // Source ATAs (Deployer / Faucet wallet)
    const sourcePtAta = getAssociatedTokenAddressSync(MOCK_PT_MINT, payer.publicKey, false, TOKEN_PROGRAM_ID);
    const sourceYtAta = getAssociatedTokenAddressSync(MOCK_YT_MINT, payer.publicKey, false, TOKEN_PROGRAM_ID);

    // Destination ATAs
    const destPtAta = getAssociatedTokenAddressSync(MOCK_PT_MINT, recipient, false, TOKEN_PROGRAM_ID);
    const destYtAta = getAssociatedTokenAddressSync(MOCK_YT_MINT, recipient, false, TOKEN_PROGRAM_ID);

    // 1. Check if recipient already holds demo PT or YT
    let existingPt = 0;
    let existingYt = 0;
    try {
      const acc = await getAccount(connection, destPtAta, "confirmed", TOKEN_PROGRAM_ID);
      existingPt = Number(acc.amount) / 1e6;
    } catch {}
    try {
      const acc = await getAccount(connection, destYtAta, "confirmed", TOKEN_PROGRAM_ID);
      existingYt = Number(acc.amount) / 1e6;
    } catch {}

    if (existingPt > 0 || existingYt > 0) {
      return NextResponse.json({
        message: `Demo position is already in your wallet! (${existingPt} PT, ${existingYt} YT). Ready to trade or redeem!`,
        ptBalance: existingPt,
        ytBalance: existingYt,
        alreadyFunded: true,
      });
    }

    const tx = new Transaction();

    // Check & fund gas SOL if user has less than 0.05 SOL
    try {
      const userSol = await connection.getBalance(recipient);
      if (userSol < 50_000_000) {
        tx.add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: recipient,
            lamports: 200_000_000, // 0.2 SOL
          })
        );
      }
    } catch (e: any) {
      console.warn("Could not check user SOL balance:", e.message);
    }

    // Check & create destination PT ATA
    const ptInfo = await connection.getAccountInfo(destPtAta);
    if (!ptInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          destPtAta,
          recipient,
          MOCK_PT_MINT,
          TOKEN_PROGRAM_ID
        )
      );
    }

    // Check & create destination YT ATA
    const ytInfo = await connection.getAccountInfo(destYtAta);
    if (!ytInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          destYtAta,
          recipient,
          MOCK_YT_MINT,
          TOKEN_PROGRAM_ID
        )
      );
    }

    // Check deployer balance before transfer
    let ptTransferred = 0;
    let ytTransferred = 0;
    try {
      const ptSourceAcc = await getAccount(connection, sourcePtAta, "confirmed", TOKEN_PROGRAM_ID);
      const ytSourceAcc = await getAccount(connection, sourceYtAta, "confirmed", TOKEN_PROGRAM_ID);

      const ptTransferAmount = Math.min(Number(ptSourceAcc.amount), amountRaw);
      const ytTransferAmount = Math.min(Number(ytSourceAcc.amount), amountRaw);

      if (ptTransferAmount > 0) {
        tx.add(createTransferInstruction(sourcePtAta, destPtAta, payer.publicKey, ptTransferAmount, [], TOKEN_PROGRAM_ID));
        ptTransferred = ptTransferAmount / 1e6;
      }
      if (ytTransferAmount > 0) {
        tx.add(createTransferInstruction(sourceYtAta, destYtAta, payer.publicKey, ytTransferAmount, [], TOKEN_PROGRAM_ID));
        ytTransferred = ytTransferAmount / 1e6;
      }
    } catch (e: any) {
      console.warn("Could not read source accounts for demo position transfer:", e.message);
      throw new Error(`Could not fetch faucet token balance: ${e.message}`);
    }

    if (ptTransferred === 0 || ytTransferred === 0) {
      return NextResponse.json({
        error: `Faucet currently low on demo tokens (${ptTransferred} PT, ${ytTransferred} YT).`,
      }, { status: 500 });
    }

    const signature = await sendAndConfirmServerTxWithRetry(connection, tx, [payer]);

    return NextResponse.json({
      ptSignature: signature,
      ytSignature: signature,
      ptAmount: ptTransferred,
      ytAmount: ytTransferred,
      message: `Demo position transferred! (${ptTransferred} PT, ${ytTransferred} YT)`,
    });
  } catch (err: any) {
    console.error("Airdrop position API error:", err);
    return NextResponse.json({ error: err.message || "Failed to airdrop demo position" }, { status: 500 });
  }
}
