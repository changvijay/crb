import { GuideShell } from "@/components/guides/GuideShell";
import { guideMetadata } from "@/lib/guides";
import "@/content/guides/price-action.css";

export const metadata = guideMetadata("price-action");

export default function Page() {
  return (
    <GuideShell
      slug="price-action"
      current="/price-action"
      eyebrow="Market education"
      title={<>Price action for beginners: how to read a chart <span className="grad-text">without indicators</span></>}
      lede="A simple, complete guide to reading candles, levels, trends and risk, written in plain English for new traders."
      meta={["Beginner level", "About 20 minutes to read", "Applies to NSE/BSE stocks, forex and crypto"]}
    />
  );
}
