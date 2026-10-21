import { GuideShell } from "@/components/guides/GuideShell";
import { guideMetadata } from "@/lib/guides";
import "@/content/guides/stock-market-basics.css";

export const metadata = guideMetadata("stock-market-basics");

export default function Page() {
  return (
    <GuideShell
      slug="stock-market-basics"
      current="/stock-market-basics"
      eyebrow="Beginner guide"
      title={<>Stock market basics: where your money can go and <span className="grad-text">how people trade it</span></>}
      lede="Before you buy your first share, learn the main places money can be invested and the main ways traders approach the market."
      meta={["Beginner guide", "India-focused examples", "9 min read"]}
    />
  );
}
