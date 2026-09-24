"use client";

import { useState, useEffect } from "react";

export interface CountdownResult {
  diff: number;
  isMatured: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
  isLive: boolean;
}

export function useCountdown(targetTimestamp: number): CountdownResult {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Use client time or fallback
  const current = now ?? targetTimestamp;
  const diff = Math.max(0, targetTimestamp - current);
  const isMatured = now !== null ? diff <= 0 : false;

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = Math.floor(diff % 60);

  const formatted =
    days > 0
      ? `${days}d ${hours}h ${minutes}m ${seconds.toString().padStart(2, "0")}s`
      : `${hours}h ${minutes}m ${seconds.toString().padStart(2, "0")}s`;

  return {
    diff,
    isMatured,
    days,
    hours,
    minutes,
    seconds,
    formatted,
    isLive: now !== null,
  };
}
