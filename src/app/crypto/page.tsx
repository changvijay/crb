import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { Crypto, type Dash } from "@/components/crypto/Crypto";
import { CryptoGuide } from "@/components/seo/CryptoGuide";
import { pageMetadata } from "@/lib/seo";
import { getData } from "@/lib/server/public-data";

export const metadata = pageMetadata("/crypto");

export default async function Page() {
  const data = await getData<Dash>("crypto");
  return (
    <>
      <Crypto initial={data} />
      <CryptoGuide data={data} />
      <RelatedLinks path="/crypto" />
    </>
  );
}
