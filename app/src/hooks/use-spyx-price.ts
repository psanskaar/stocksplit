"use client";

import { useState, useEffect } from "react";

export interface SpyxPriceData {
  spyxPrice: number;
  spyPrice: number;
  spread: number;
  spreadPercent: number;
  timestamp: number;
  isMarketClosed: boolean;
  loading: boolean;
  isLive: boolean;
  error: string | null;
}

export function useSpyxPrice(): SpyxPriceData {
  const [data, setData] = useState<SpyxPriceData>({
    spyxPrice: 0,
    spyPrice: 0,
    spread: 0,
    spreadPercent: 0,
    timestamp: Date.now(),
    isMarketClosed: false,
    loading: true,
    isLive: false,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function fetchPrices() {
      try {
        let isClosed = false;
        let spy = 0;
        let live = false;

        try {
          const res = await fetch("/api/price");
          if (res.ok) {
            const priceData = await res.json();
            if (priceData?.spyPrice && priceData.spyPrice > 0) {
              spy = priceData.spyPrice;
            }
            if (typeof priceData?.isMarketClosed === "boolean") {
              isClosed = priceData.isMarketClosed;
            }
            if (priceData?.feedSource === "pyth") {
              live = true;
            }
          }
        } catch {}

        // If API returned nothing, leave at 0 so UI shows error state
        // No hardcoded fallback

        // Compute SPYx on-chain price with current dividend multiplier spread (+0.02%)
        const spreadMultiplier = 1.0002;
        const spyx = spy > 0 ? Number((spy * spreadMultiplier).toFixed(2)) : 0;
        const spread = spy > 0 ? Number((spyx - spy).toFixed(2)) : 0;
        const spreadPercent = spy > 0 ? Number(((spread / spy) * 100).toFixed(2)) : 0;

        if (isMounted) {
          setData({
            spyxPrice: spyx,
            spyPrice: spy,
            spread,
            spreadPercent,
            timestamp: Date.now(),
            isMarketClosed: isClosed,
            loading: false,
            isLive: live,
            error: null,
          });
        }
      } catch (err: any) {
        if (isMounted) {
          setData((prev) => ({
            ...prev,
            loading: false,
            error: err.message || "Failed to fetch price feeds",
          }));
        }
      }
    }

    fetchPrices();
    const interval = setInterval(fetchPrices, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return data;
}
