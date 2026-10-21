import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { NseData } from "@/components/nse/NseData";
import { NseGuide } from "@/components/seo/NseGuide";
import { pageMetadata } from "@/lib/seo";
import { getBhavTop, getData } from "@/lib/server/public-data";

export const metadata = pageMetadata("/nse-data");

type Any = Record<string, unknown>;

export default async function Page() {
  // Every table is read on the server so the HTML contains real rows; the client keeps refreshing afterwards.
  const [heat, gl, wk, penny, band, ipo, active, bhav, world, idx] = await Promise.all([
    getData<Any>("nseHeat"), getData<Any>("nseGainers"), getData<Any>("nse52"), getData<Any>("nsePenny"), getData<Any>("nseBand"),
    getData<Any>("nseIpo"), getData<Any>("nseActive"), getBhavTop(100), getData<Any>("world"), getData<Any>("nseIndices", { exchange: "NSE" }),
  ]);
  return (
    <>
      <NseData initial={{ heat, gl, wk, penny, band, ipo, active, bhav, world, idx }} />
      <NseGuide gl={gl} wk={wk} band={band} ipo={ipo} idx={idx} bhav={bhav} />
      <RelatedLinks path="/nse-data" />
    </>
  );
}
