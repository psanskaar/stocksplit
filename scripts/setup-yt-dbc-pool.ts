import * as fs from "fs";
import * as path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  DynamicBondingCurveClient,
  buildCurveWithCustomSqrtPrices,
  getSqrtPriceFromPrice,
  DEFAULT_MIGRATED_POOL_FEE_PARAMS,
  deriveDbcPoolAddress,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
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
  console.log("=== Setting up Meteora DBC Pool for YT-SPYx ===");
  const connection = new Connection(RPC_URL, "confirmed");
  const payer = loadKeypair(KEYPAIR_FILE);
  console.log("Payer address:", payer.publicKey.toBase58());

  const addresses = getAddresses();
  if (!addresses.usdcMint) {
    throw new Error("usdcMint missing from addresses.json!");
  }

  const usdcMint = new PublicKey(addresses.usdcMint);
  console.log("Quote Token (USDC Mint):", usdcMint.toBase58());

  const client = DynamicBondingCurveClient.create(connection, "confirmed");

  // 1. Create or load DBC Config
  let configKeypair: Keypair;
  let configPubkey: PublicKey;

  if (addresses.ytDbcConfig) {
    configPubkey = new PublicKey(addresses.ytDbcConfig);
    console.log("Using existing DBC Config:", configPubkey.toBase58());
  } else {
    configKeypair = Keypair.generate();
    configPubkey = configKeypair.publicKey;
    console.log("Generating DBC Config keypair:", configPubkey.toBase58());

    const p1 = getSqrtPriceFromPrice(7, 6, 6);
    const p2 = getSqrtPriceFromPrice(20, 6, 6);

    const curve = buildCurveWithCustomSqrtPrices({
      token: {
        tokenType: 1, // Token2022
        tokenBaseDecimal: 6,
        tokenQuoteDecimal: 6,
        tokenAuthorityOption: 0,
        totalTokenSupply: 1_000_000,
        leftover: 0,
      },
      migration: {
        migrationOption: 1, // MET_DAMM_V2
        migrationFeeOption: 0,
        migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
        migratedPoolFee: DEFAULT_MIGRATED_POOL_FEE_PARAMS,
      },
      fee: {
        baseFeeParams: {
          baseFeeMode: 0,
          feeSchedulerParam: {
            startingFeeBps: 100, // 1%
            endingFeeBps: 100,
            numberOfPeriod: 0,
            totalDuration: 0,
          },
        },
        dynamicFeeEnabled: false,
        collectFeeMode: 0, // quote only
        creatorTradingFeePercentage: 0,
        poolCreationFee: 0,
        enableFirstSwapWithMinFee: false,
      },
      liquidityDistribution: {
        partnerPermanentLockedLiquidityPercentage: 0,
        partnerLiquidityPercentage: 0,
        creatorPermanentLockedLiquidityPercentage: 100,
        creatorLiquidityPercentage: 0,
      },
      lockedVesting: {
        totalLockedVestingAmount: 0,
        numberOfVestingPeriod: 0,
        cliffUnlockAmount: 0,
        totalVestingDuration: 0,
        cliffDurationFromMigrationTime: 0,
      },
      activationType: 1, // timestamp
      sqrtPrices: [p1, p2],
    });

    curve.migrationQuoteThreshold = new BN(100_000_000);

    const createConfigTx = await client.partner.createConfig({
      config: configPubkey,
      feeClaimer: payer.publicKey,
      leftoverReceiver: payer.publicKey,
      quoteMint: usdcMint,
      payer: payer.publicKey,
      ...curve,
    });

    const configSig = await sendAndConfirmTransaction(connection, createConfigTx, [payer, configKeypair]);
    console.log("DBC Config created:", configPubkey.toBase58(), "tx:", configSig);
  }

  // 2. Create DBC Pool
  let poolAddress: PublicKey;
  if (addresses.ytDbcPool) {
    poolAddress = new PublicKey(addresses.ytDbcPool);
    console.log("Using existing DBC Pool:", poolAddress.toBase58());
  } else {
    const baseMintKeypair = Keypair.generate();
    console.log("Base Mint (Keypair for DBC):", baseMintKeypair.publicKey.toBase58());

    const createPoolTx = await client.creator.createPool({
      baseMint: baseMintKeypair.publicKey,
      name: "Yield Token SPYx",
      symbol: "YT-SPYx",
      uri: "https://stocksplit.finance/metadata/yt-spyx.json",
      poolCreator: payer.publicKey,
      config: configPubkey,
      payer: payer.publicKey,
    });

    const poolSig = await sendAndConfirmTransaction(connection, createPoolTx, [payer, baseMintKeypair]);
    poolAddress = deriveDbcPoolAddress(usdcMint, baseMintKeypair.publicKey, configPubkey);
    console.log("DBC Pool created:", poolAddress.toBase58(), "tx:", poolSig);

    updateAddresses({
      ytDbcConfig: configPubkey.toBase58(),
      ytDbcPool: poolAddress.toBase58(),
      ytDbcBaseMint: baseMintKeypair.publicKey.toBase58(),
    });
  }

  // 3. Initial Buy of $10 USDC to seed the curve
  console.log("\nPreparing $10 USDC for initial buy to seed the curve...");
  const payerUsdcAta = getAssociatedTokenAddressSync(usdcMint, payer.publicKey, false, TOKEN_PROGRAM_ID);
  const ataAccountInfo = await connection.getAccountInfo(payerUsdcAta);
  if (!ataAccountInfo) {
    console.log("Creating payer USDC ATA...");
    const createAtaTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(payer.publicKey, payerUsdcAta, payer.publicKey, usdcMint)
    );
    await sendAndConfirmTransaction(connection, createAtaTx, [payer]);
  }

  await mintTo(connection, payer, usdcMint, payerUsdcAta, payer, 10_000_000, [], undefined, TOKEN_PROGRAM_ID);
  console.log("Minted 10 USDC to payer ATA");

  console.log("Executing initial buy: 10 USDC → YT tokens...");
  try {
    const swapTx = await client.pool.swap({
      amountIn: new BN(10_000_000), // 10 USDC
      minimumAmountOut: new BN(1),
      swapBaseForQuote: false,
      owner: payer.publicKey,
      payer: payer.publicKey,
      pool: poolAddress,
      referralTokenAccount: null,
    });

    const swapSig = await sendAndConfirmTransaction(connection, swapTx, [payer]);
    console.log("Initial buy confirmed! tx:", swapSig);
  } catch (swapErr: any) {
    console.log("Initial buy already executed or status:", swapErr.message);
  }

  console.log("\n✅ Meteora DBC Pool for YT setup completed successfully!");
}

main().catch((err) => {
  console.error("Error setting up Meteora DBC pool:", err);
  process.exit(1);
});
