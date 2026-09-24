const fs = require('fs');
const path = require('path');
const { Connection, Keypair, PublicKey, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync, mintTo, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const bs58 = require('bs58');
const BN = require('bn.js');
const AmmImpl = require('@meteora-ag/dynamic-amm-sdk').default;

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://greatest-greatest-mound.solana-devnet.quiknode.pro/e667647b420748a3c7f7f91ecd9b13328b62540c/';
const KEYPAIR_FILE = path.join(__dirname, '..', '..', 'keypair.json');

const USDC_MINT = new PublicKey('AXQKoNyChJ9vihK3qThe9UdT6xteoh1Lc4roqP98i2zW');
const PT_MINT = new PublicKey('3GSyLYWRSZaNdPW41xcTrWrR7Qvn6X5Lv4F3d4CUHni3');
const YT_MINT = new PublicKey('HhKNM1MTQU1dG4jyyHnuT6cz4GSyeakR2yN8GGmBb4WE');

const PT_DAMM_POOL = new PublicKey('8cwZ7yESFJw7DyM1JWVE92Zu9NHHX82jbdCau6v1oW7s');
const YT_DAMM_POOL = new PublicKey('BvMKwwPFH781QqJuk4pRdvATg2rSuyHzVLuGMpgrax6o');

function loadKeypair() {
  const secretKey = JSON.parse(fs.readFileSync(KEYPAIR_FILE, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function main() {
  console.log('=== Injecting Deep Liquidity into Meteora DAMM v2 Pools ===');
  const conn = new Connection(RPC_URL, 'confirmed');
  const payer = loadKeypair();
  console.log('Payer:', payer.publicKey.toBase58());

  // 1. Mint 60,000 USDC to payer ATA
  console.log('\n--- Step 1: Minting 60,000 USDC to payer ---');
  const payerUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, payer.publicKey, false, TOKEN_PROGRAM_ID);
  await mintTo(conn, payer, USDC_MINT, payerUsdcAta, payer, 60_000_000_000, [], { commitment: 'confirmed' }, TOKEN_PROGRAM_ID);
  console.log('Minted 60,000 USDC to payer ATA');

  // 2. PT Pool Rebalance & Deposit
  console.log('\n--- Step 2: Injecting Liquidity into PT Pool ---');
  let ptPool = await AmmImpl.create(conn, PT_DAMM_POOL);
  console.log(`Current PT Pool: ${Number(ptPool.poolInfo.tokenAAmount.toString()) / 1e6} PT / $${Number(ptPool.poolInfo.tokenBAmount.toString()) / 1e6} USDC`);

  // Target: Deposit 94 PT + matching USDC
  const ptInLamports = new BN(94 * 1e6);
  const ptQuote = ptPool.getDepositQuote(ptInLamports, new BN(0), true, 2.0);
  console.log(`PT Deposit Quote: ${Number(ptQuote.tokenAInAmount.toString()) / 1e6} PT + $${Number(ptQuote.tokenBInAmount.toString()) / 1e6} USDC -> ${ptQuote.poolTokenAmountOut.toString()} LP`);

  const ptDepositTx = await ptPool.deposit(
    payer.publicKey,
    ptQuote.tokenAInAmount,
    ptQuote.tokenBInAmount,
    ptQuote.poolTokenAmountOut
  );
  const ptSig = await sendAndConfirmTransaction(conn, ptDepositTx, [payer], { skipPreflight: true, commitment: 'confirmed' });
  console.log('PT Deposit TX confirmed:', ptSig);

  // 3. YT Pool Rebalance & Deposit
  console.log('\n--- Step 3: Injecting Liquidity into YT Pool ---');
  let ytPool = await AmmImpl.create(conn, YT_DAMM_POOL);
  console.log(`Current YT Pool: ${Number(ytPool.poolInfo.tokenAAmount.toString()) / 1e6} YT / $${Number(ytPool.poolInfo.tokenBAmount.toString()) / 1e6} USDC`);

  // Target: Deposit 150 YT + matching USDC
  const ytInLamports = new BN(150 * 1e6);
  const ytQuote = ytPool.getDepositQuote(ytInLamports, new BN(0), true, 2.0);
  console.log(`YT Deposit Quote: ${Number(ytQuote.tokenAInAmount.toString()) / 1e6} YT + $${Number(ytQuote.tokenBInAmount.toString()) / 1e6} USDC -> ${ytQuote.poolTokenAmountOut.toString()} LP`);

  const ytDepositTx = await ytPool.deposit(
    payer.publicKey,
    ytQuote.tokenAInAmount,
    ytQuote.tokenBInAmount,
    ytQuote.poolTokenAmountOut
  );
  const ytSig = await sendAndConfirmTransaction(conn, ytDepositTx, [payer], { skipPreflight: true, commitment: 'confirmed' });
  console.log('YT Deposit TX confirmed:', ytSig);

  // 4. Verify Final Reserves
  console.log('\n--- Final Verification ---');
  ptPool = await AmmImpl.create(conn, PT_DAMM_POOL);
  ytPool = await AmmImpl.create(conn, YT_DAMM_POOL);

  const finalPtA = Number(ptPool.poolInfo.tokenAAmount.toString()) / 1e6;
  const finalPtB = Number(ptPool.poolInfo.tokenBAmount.toString()) / 1e6;
  const finalPtPrice = finalPtB / finalPtA;

  const finalYtA = Number(ytPool.poolInfo.tokenAAmount.toString()) / 1e6;
  const finalYtB = Number(ytPool.poolInfo.tokenBAmount.toString()) / 1e6;
  const finalYtPrice = finalYtB / finalYtA;

  console.log(`PT Pool Final: ${finalPtA.toFixed(2)} PT / $${finalPtB.toFixed(2)} USDC (Spot: $${finalPtPrice.toFixed(2)}, TVL: $${(finalPtB * 2).toFixed(2)})`);
  console.log(`YT Pool Final: ${finalYtA.toFixed(2)} YT / $${finalYtB.toFixed(2)} USDC (Spot: $${finalYtPrice.toFixed(2)}, TVL: $${(finalYtB * 2).toFixed(2)})`);
  console.log('🎉 Liquidity injection completed successfully!');
}

main().catch((err) => {
  console.error('Error during liquidity injection:', err);
  process.exit(1);
});
