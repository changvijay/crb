import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { UsGuide } from "@/components/seo/UsGuide";
import { UsMarket, type Dash } from "@/components/us/UsMarket";
import { pageMetadata } from "@/lib/seo";
import { getData } from "@/lib/server/public-data";

export const metadata = pageMetadata("/us-market");

export default async function Page() {
  const data = await getData<Dash>("us");
  return (
    <>
      <UsMarket initial={data} />
      <UsGuide data={data} />
      <RelatedLinks path="/us-market" />
    </>
  );
}
