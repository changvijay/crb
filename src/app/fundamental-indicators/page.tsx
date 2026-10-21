import { GuideShell } from "@/components/guides/GuideShell";
import { guideMetadata } from "@/lib/guides";
import "@/content/guides/fundamental-indicators.css";

export const metadata = guideMetadata("fundamental-indicators");

export default function Page() {
  return (
    <GuideShell
      slug="fundamental-indicators"
      current="/fundamental-indicators"
      eyebrow="Stock Market · Educational Notes"
      title={<>Fundamental <span className="grad-text">Analysis</span></>}
      lede="A complete reference for evaluating equities on NSE, BSE, and US markets. Covers financial statements, ratios, valuation models, and investment process."
      meta={["Version 2.1 · 2025 (Fact-Checked)", "NSE / BSE / US / Global Macro", "Educational only"]}
    />
  );
}
