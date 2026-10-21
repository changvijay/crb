import { Explore } from "@/components/home/Explore";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { HomeGuide } from "@/components/seo/HomeGuide";
import { SITE, ldJson, pageMetadata } from "@/lib/seo";
import { getData } from "@/lib/server/public-data";

export const metadata = pageMetadata("/");

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Chang Research Base",
    alternateName: "CRB",
    url: SITE,
    description: "Daily pre-market reports with technical analysis, support and resistance levels and market data dashboards for Indian equities, US markets and crypto.",
    publisher: { "@type": "Organization", name: "Chang Research Base", alternateName: "CRB", url: SITE, logo: { "@type": "ImageObject", url: `${SITE}/logo.png` } },
  },
];

export default async function Home() {
  // Same payloads the dashboard hydrates with, read on the server so the HTML already contains the report.
  const [reports, sevenDay, flows, intraday, world] = await Promise.all([
    getData<Record<string, unknown>>("reports"),
    getData("sevenDay"),
    getData<Record<string, unknown>>("flows"),
    getData("intraday"),
    getData("world"),
  ]);
  return (
    <>
      {jsonLd.map((d, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(d) }} />
      ))}
      <HomeDashboard initial={{ reports, sevenDay, flows, intraday, world } as never} />
      <HomeGuide reports={reports} flows={flows} />
      <Explore />
    </>
  );
}
