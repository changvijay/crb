import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { Nifty } from "@/components/nifty/Nifty";
import { guideJsonLd, guideMetadata } from "@/lib/guides";

export const metadata = guideMetadata("nifty-equity-indices");

export default function Page() {
  return (
    <>
      {guideJsonLd("nifty-equity-indices").map((d, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(d).replace(/</g, "\\u003c") }} />)}
      <Nifty />
      <RelatedLinks path="/nifty-equity-indices" />
    </>
  );
}
