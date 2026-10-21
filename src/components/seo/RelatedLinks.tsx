import Link from "next/link";
import { PAGES } from "@/lib/pages";

/** Hand-picked next steps per page, so every page links onward with descriptive anchor text. */
const RELATED: Record<string, string[]> = {
  "/price-action": ["/candlestick-patterns", "/technical-analysis-guide", "/stock-market-basics", "/nse-data", "/learning"],
  "/fundamental-indicators": ["/fundamental-analysis-ratios", "/fundamental-stock-analysis", "/stock-market-basics", "/news", "/learning"],
  "/technical-analysis-guide": ["/price-action", "/candlestick-patterns", "/nse-data", "/fundamental-indicators", "/learning"],
  "/candlestick-patterns": ["/price-action", "/technical-analysis-guide", "/nse-data", "/stock-market-basics", "/learning"],
  "/stock-market-basics": ["/learning", "/price-action", "/technical-analysis-guide", "/fundamental-indicators", "/nse-data"],
  "/understanding-crypto-complete-guide": ["/crypto", "/stock-market-basics", "/news", "/us-market", "/learning"],
  "/fundamental-analysis-ratios": ["/fundamental-indicators", "/fundamental-stock-analysis", "/stock-market-basics", "/nifty-equity-indices", "/learning"],
  "/fundamental-stock-analysis": ["/fundamental-analysis-ratios", "/fundamental-indicators", "/nse-data", "/nifty-equity-indices", "/news"],
  "/nifty-equity-indices": ["/nse-data", "/fundamental-stock-analysis", "/technical-analysis-guide", "/stock-market-basics", "/news"],
  "/learning": ["/stock-market-basics", "/price-action", "/technical-analysis-guide", "/fundamental-indicators", "/understanding-crypto-complete-guide"],
  "/recommendations": ["/nse-data", "/technical-analysis-guide", "/fundamental-stock-analysis", "/news", "/disclaimer"],
  "/news": ["/nse-data", "/us-market", "/crypto", "/recommendations", "/learning"],
  "/nse-data": ["/nifty-equity-indices", "/fundamental-stock-analysis", "/news", "/technical-analysis-guide", "/learning"],
  "/us-market": ["/nse-data", "/crypto", "/news", "/stock-market-basics", "/learning"],
  "/crypto": ["/understanding-crypto-complete-guide", "/us-market", "/news", "/stock-market-basics", "/learning"],
};

export function RelatedLinks({ path }: { path: string }) {
  const items = (RELATED[path] ?? []).flatMap((p) => PAGES.find((x) => x.path === p) ?? []);
  if (!items.length) return null;
  return (
    <nav aria-label="Related pages" className="container-x pb-10 pt-4">
      <p className="eyebrow mb-3">Related on Chang Research Base</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <li key={p.path}>
            <Link href={p.path} className="card card-hover block !p-4">
              <span className="font-semibold text-[var(--ink)]">{p.label}</span>
              <span className="muted mt-1 block text-[12.5px] leading-5">{p.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
