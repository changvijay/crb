import { CandleEnhance } from "@/components/guides/CandleEnhance";
import { GuideShell } from "@/components/guides/GuideShell";
import { guideMetadata } from "@/lib/guides";
import "@/content/guides/candlestick-patterns.css";

export const metadata = guideMetadata("candlestick-patterns");

export default function Page() {
  return (
    <GuideShell
      slug="candlestick-patterns"
      current="/candlestick-patterns"
      eyebrow="Pattern library"
      title={<>The complete in-depth reference: <span className="grad-text">every candlestick pattern</span> explained</>}
      lede="Psychology, anatomy, real-world examples, entry & exit rules, and common mistakes — for all 19 essential patterns."
      meta={["8 bullish patterns", "7 bearish patterns", "4 neutral patterns", "~35 min read"]}
      enhance={<CandleEnhance />}
    />
  );
}
