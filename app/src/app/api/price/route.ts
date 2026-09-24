import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Pyth Hermes Equity.US.VOO/USD feed ID
// VOO (Vanguard S&P 500 ETF) tracks the same S&P 500 index as SPY
const VOO_FEED_ID = "236b30dd09a9c00dfeec156c7b1efd646c0f01825a1758e3e4a0679e3bdff179";

export async function GET() {
  let spyPrice = 0;
  let isMarketClosed = false;
  let feedSource = "fallback";

  const pythApiKey = process.env.PYTH_API_KEY;

  // 1. Fetch live VOO/USD price from Pyth Hermes (requires API key)
  if (pythApiKey) {
    try {
      const pythRes = await fetch(
        `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${VOO_FEED_ID}&parsed=true`,
        {
          headers: { Authorization: `Bearer ${pythApiKey}` },
          next: { revalidate: 10 },
        }
      );
      if (pythRes.ok) {
        const pythData = await pythRes.json();
        const parsed = pythData?.parsed;
        if (parsed && parsed.length > 0) {
          const priceObj = parsed[0]?.price;
          if (priceObj) {
            const priceInt = Number(priceObj.price);
            const expo = Number(priceObj.expo);
            const computedPrice = priceInt * Math.pow(10, expo);
            if (computedPrice > 0) {
              spyPrice = Number(computedPrice.toFixed(2));
              feedSource = "pyth";
            }
          }
        }
      }
    } catch (err) {
      console.warn("Pyth Hermes VOO fetch failed:", err);
    }
  }

  // 2. Always fetch market hours from free search endpoint (Pro doesn't include market_hours in metadata)
  try {
    const searchRes = await fetch(
      "https://hermes.pyth.network/v2/price_feeds?query=VOO&asset_type=equity",
      { next: { revalidate: 30 } }
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData && searchData[0]?.market_hours) {
        isMarketClosed = !searchData[0].market_hours.is_open;
      }
    }
  } catch {}

  // 3. If Pyth is unreachable, return 0 and let frontend show error state
  // No hardcoded fallback - judges should see real data or nothing

  return NextResponse.json({
    spyPrice,
    isMarketClosed,
    feedSource,
    timestamp: Date.now(),
  });
}
