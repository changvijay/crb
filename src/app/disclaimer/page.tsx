import Link from "next/link";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/disclaimer");

export default function DisclaimerPage() {
  return (
    <article className="container-x max-w-3xl pb-12 pt-10 text-[15px] leading-8 text-[var(--ink-2)] [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[var(--ink)] [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_a]:font-semibold [&_a]:text-[var(--accent)]">
      <nav aria-label="Breadcrumb" className="muted mb-4 text-xs"><Link href="/">Home</Link> / <span>Disclaimer</span></nav>
      <p className="eyebrow">Legal</p>
      <h1 className="display mt-3 text-[clamp(30px,4.4vw,52px)]">Disclaimer and risk notice</h1>
      <p>This page explains what Chang Research Base (CRB) is and is not, so that you can use the site with the right expectations.</p>

      <h2>Information and education only</h2>
      <p>Everything on this website, including the daily market reports, support and resistance levels, trade ideas, dashboards, screeners and learning guides, is published for information and education. It is not investment advice, a recommendation, an offer or a solicitation to buy or sell any security, derivative or crypto asset, and it does not take your objectives, finances or risk tolerance into account.</p>

      <h2>Not a registered adviser</h2>
      <p>Chang Research Base does not present itself as a SEBI-registered investment adviser or research analyst, and nothing on the site should be read as registered advice. If you need personalised advice, consult a SEBI-registered investment adviser or a qualified professional in your jurisdiction before you invest.</p>

      <h2>Automated and AI-assisted content</h2>
      <p>Parts of the daily report are produced with the help of automated analysis. Such systems can misread data, repeat errors from their sources or miss important context. Levels and outlooks are statements about price history and indicators, not predictions or guarantees.</p>

      <h2>Data and third-party sources</h2>
      <ul>
        <li>Market data, news and quotes come from third-party providers and public sources and may be delayed, incomplete or later revised.</li>
        <li>Grey market premium figures for IPOs are unofficial and unregulated and can change quickly.</li>
        <li>Links to other websites are provided for convenience; we do not control and are not responsible for their content.</li>
        <li>Advisor blogs and trade ideas shown on the site reflect the views of their authors, not of CRB.</li>
      </ul>

      <h2>Risk</h2>
      <p>Trading and investing in equities, derivatives, currencies and crypto assets involves risk, including the loss of all capital invested. Past performance does not indicate future results. Derivatives and leveraged products can lose more than the amount first committed. Crypto assets are highly volatile and may be unregulated where you live. Only use money you can afford to lose and verify prices with your broker before you act.</p>

      <h2>No liability</h2>
      <p>To the extent permitted by law, CRB and the people who work on it accept no responsibility for any loss or damage arising from use of, or reliance on, this website or its content.</p>

      <h2>Corrections and questions</h2>
      <p>If you find an error or have a question about this notice, please reach us through the channels listed on the <Link href="/contact">contact page</Link>. Learn more about how reports are built on the <Link href="/about">about page</Link>.</p>
    </article>
  );
}
