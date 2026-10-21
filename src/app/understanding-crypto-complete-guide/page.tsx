import { CryptoReader } from "@/components/guides/CryptoReader";
import { GuideShell } from "@/components/guides/GuideShell";
import { guideMetadata } from "@/lib/guides";
import "@/content/guides/crypto-guide.css";

export const metadata = guideMetadata("crypto-guide");

export default function Page() {
  return (
    <GuideShell
      slug="crypto-guide"
      current="/understanding-crypto-complete-guide"
      eyebrow="Chang Research Base · Master guide"
      title={<>Understanding <span className="grad-text">Crypto</span></>}
      lede="A complete, evidence-driven map of cryptocurrency — from first principles to the technological frontier."
      meta={["35 chapters", "~45 min read", "18 high-res infographics", "Source-checked"]}
      tocFilter
      intro={<CryptoReader />}
    />
  );
}
