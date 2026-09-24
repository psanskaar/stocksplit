import React from "react";
import { DemoBanner } from "@/components/demo-banner";
import { SplitForm } from "@/components/split-form";
import { WithdrawSection } from "@/components/withdraw-section";

export default function SplitPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <DemoBanner />
      <div className="space-y-6">
        <SplitForm />
        <WithdrawSection />
      </div>
    </div>
  );
}
