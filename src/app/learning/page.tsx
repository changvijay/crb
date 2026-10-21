import { RelatedLinks } from "@/components/seo/RelatedLinks";
import type { Metadata } from "next";
import { Learning } from "@/components/learning/Learning";
import { SITE, ldJson, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("/learning");

const jsonLd = [
  { "@context": "https://schema.org", "@type": "EducationalOrganization", name: "Chang Research Base (CRB) Learning Center", description: "Free structured learning center for Indian stock market traders on Chang Research Base (CRB), Chang Reports, and Market Reports.", url: `${SITE}/learning`, publisher: { "@type": "Organization", name: "Chang Research Base (CRB)", alternateName: ["CRB", "Chang Reports", "Chang Base", "Market Reports"], url: SITE } },
  { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` }, { "@type": "ListItem", position: 2, name: "Learning Center", item: `${SITE}/learning` }] },
];

export default function Page() {
  return (
    <>
      {jsonLd.map((d, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(d) }} />)}
      <Learning />
      <RelatedLinks path="/learning" />
    </>
  );
}
