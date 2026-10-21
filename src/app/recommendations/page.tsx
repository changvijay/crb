import { RecoApp } from "@/components/reco/RecoApp";
import type { RecoPage } from "@/components/reco/types";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { pageMetadata } from "@/lib/seo";
import { getData } from "@/lib/server/public-data";

export const metadata = pageMetadata("/recommendations");

export default async function RecommendationsPage() {
  const initial = await getData<RecoPage>("recos", { page: "1", limit: "24" });
  return (
    <>
      <RecoApp initial={initial} />
      <RelatedLinks path="/recommendations" />
    </>
  );
}
