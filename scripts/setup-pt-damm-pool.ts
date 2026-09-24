import * as fs from "fs";
import * as path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import AmmImpl, { derivePoolAddress } from "@meteora-ag/dynamic-amm-sdk";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  mintTo,
} from "@solana/spl-token";
import BN from "bn.js";

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const ADDRESSES_FILE = path.join(__dirname, "addresses.json");
const KEYPAIR_FILE = path.join(__dirname, "..", "keypair.json");

function loadKeypair(filePath: string): Keypair {
  const secretKey = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

function getAddresses(): Record<string, any> {
  if (fs.existsSync(ADDRESSES_FILE)) {
    return JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf-8"));
  }
  throw new Error(`addresses.json not found at ${ADDRESSES_FILE}`);
}

function updateAddresses(data: Record<string, any>) {
  let addresses: Record<string, any> = {};
  if (fs.existsSync(ADDRESSES_FILE)) {
    try {
      addresses = JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf-8"));
    } catch {}
  }
  addresses = { ...addresses, ...data };
  fs.writeFileSync(ADDRESSES_FILE, JSON.stringify(addresses, null, 2), "utf-8");
  console.log(`Updated ${ADDRESSES_FILE} with:`, data);
}

async function main() {
  console.log("=== Setting up Meteora DAMM v2 Pool for PT-SPYx ===");
  const connection = new Connection(RPC_URL, "confirmed");
  const payer = loadKeypair(KEYPAIR_FILE);
  console.log("Payer address:", payer.publicKey.toBase58());

  const addresses = getAddresses();
  if (!addresses.ptMint || !addresses.usdcMint) {
    throw new Error("ptMint or usdcMint missing from addresses.json!");
  }

  const ptMint = new PublicKey(addresses.ptMint);
  const usdcMint = new PublicKey(addresses.usdcMint);
  console.log("Token A (PT Mint):", ptMint.toBase58());
  console.log("Token B (USDC Mint):", usdcMint.toBase58());

  // Check if pool already created
  if (addresses.ptDammPool) {
    const existingPool = new PublicKey(addresses.ptDammPool);
    console.log("Using existing DAMM v2 pool:", existingPool.toBase58());
    const pool = await AmmImpl.create(connection, existingPool);
    console.log("Pool tokenA amount:", pool.poolInfo.tokenAAmount.toString());
    console.log("Pool tokenB amount:", pool.poolInfo.tokenBAmount.toString());
    return;
  }

  // Ensure payer has 5,330 USDC (5_330_000_000 raw)
  const payerUsdcAta = getAssociatedTokenAddressSync(usdcMint, payer.publicKey, false, TOKEN_PROGRAM_ID);
  const usdcAtaInfo = await connection.getAccountInfo(payerUsdcAta);
  if (!usdcAtaInfo) {
    const createAtaTx = new (await import("@solana/web3.js")).Transaction().add(
      createAssociatedTokenAccountInstruction(payer.publicKey, payerUsdcAta, payer.publicKey, usdcMint)
    );
    await sendAndConfirmTransaction(connection, createAtaTx, [payer]);
  }
  await mintTo(connection, payer, usdcMint, payerUsdcAta, payer, 5_330_000_000, [], undefined, TOKEN_PROGRAM_ID);
  console.log("Minted 5,330 USDC to payer ATA");

  // Initial amounts: 10 PT tokens, 5,330 USDC ($533 per PT)
  const tokenAAmount = new BN(10_000_000);
  const tokenBAmount = new BN(5_330_000_000);

  console.log("Calling createPermissionlessPool on devnet...");
  const poolTx = await AmmImpl.createPermissionlessPool(
    connection,
    payer.publicKey,
    ptMint,
    usdcMint,
    tokenAAmount,
    tokenBAmount,
    false, // isStable = false (Constant Product)
    new BN(100) // tradeFeeBps = 100 (1%)
  );

  const sig = await sendAndConfirmTransaction(connection, poolTx, [payer]);
  console.log("🎉 DAMM V2 POOL CREATED! tx:", sig);

  const poolAddress = derivePoolAddress(connection, ptMint, usdcMint, 6, 6, false, new BN(100));
  console.log("DAMM v2 Pool Address:", poolAddress.toBase58());

  updateAddresses({
    ptDammPool: poolAddress.toBase58(),
  });

  console.log("\n✅ Meteora DAMM v2 Pool setup completed successfully!");
}

main().catch((err) => {
  console.error("Error setting up DAMM v2 pool:", err);
  process.exit(1);
});
