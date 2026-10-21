import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { Screener } from "@/components/screener/Screener";
import { guideJsonLd, guideMetadata } from "@/lib/guides";

export const metadata = guideMetadata("fundamental-stock-analysis");

export default function Page() {
  return (
    <>
      {guideJsonLd("fundamental-stock-analysis").map((d, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(d).replace(/</g, "\\u003c") }} />)}
      <Screener />
      <RelatedLinks path="/fundamental-stock-analysis" />
    </>
  );
}
