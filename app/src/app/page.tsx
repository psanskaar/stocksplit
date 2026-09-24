import React from "react";
import { Hero } from "@/components/hero";
import { ScrollDemo } from "@/components/scroll-demo";
import { WhoIsThisFor } from "@/components/who-is-this-for";
import { HowItWorks } from "@/components/how-it-works";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-12 pb-16">
      <Hero />
      <ScrollDemo />
      <WhoIsThisFor />
      <HowItWorks />
    </div>
  );
}
