import { GuideShell } from "@/components/guides/GuideShell";
import { TaCharts } from "@/components/guides/TaCharts";
import { guideMetadata } from "@/lib/guides";
import "@/content/guides/technical-analysis-guide.css";

export const metadata = guideMetadata("technical-analysis-guide");

export default function Page() {
  return (
    <GuideShell
      slug="technical-analysis-guide"
      current="/technical-analysis-guide"
      eyebrow="Beginner's guide"
      title={<>Technical analysis, <span className="grad-text">from zero to confident</span></>}
      lede="A structured, plain-language introduction to reading charts, spotting trends, and understanding the indicators that drive trading decisions."
      enhance={<TaCharts />}
    />
  );
}
