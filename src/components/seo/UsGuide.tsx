import Link from "next/link";
import { dayUTC, inr, num, pct } from "@/lib/snapshot";
import { Prose, Snapshot } from "./Prose";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

const NAMES: [string, string][] = [["S&P 500", "^GSPC"], ["Nasdaq Composite", "^IXIC"], ["Dow Jones Industrial Average", "^DJI"], ["Russell 2000", "^RUT"], ["VIX", "^VIX"]];
const q = (s: Any | undefined) => (s?.symbol && num(s.changePercent) != null ? `${s.symbol} (${pct(s.changePercent)} at $${inr(s.price)})` : "");

export function UsGuide({ data }: { data: Any | null }) {
  const indices = (data?.indices?.data as Any[] | undefined) ?? [];
  const idxLines = NAMES.flatMap(([label, sym]) => {
    const i = indices.find((x) => x.symbol === sym);
    return i && num(i.price) != null && num(i.changePercent) != null ? [`${label} ${inr(i.price)} (${pct(i.changePercent)})`] : [];
  });
  const gainer = q(data?.gainers?.quotes?.[0]);
  const loser = q(data?.losers?.quotes?.[0]);
  const active = q(data?.mostActive?.quotes?.[0]);
  const sectors = Object.keys((data?.heatmap?.sectors as Record<string, unknown> | undefined) ?? {});
  const date = dayUTC(data?.timestamp);

  return (
    <Prose label="How to read the US stock market dashboard" title="How to read the US stock market dashboard">
      <p>
        The US market dashboard gives a quick view of Wall Street for readers who follow global cues or invest in American shares. It combines the major index levels, an interactive sector heatmap built from the S&amp;P 500 leaders, the biggest gainers and losers, the most actively traded stocks, and stocks trading close to their 52-week highs or lows. The tables are produced on the server from public market quotes, and the page can be refreshed without reloading.
      </p>

      {(idxLines.length > 0 || gainer || loser) && (
        <Snapshot heading={`Today's snapshot${date ? ` — data timestamp ${date} (UTC)` : ""}`}>
          <p>
            {idxLines.length > 0 && <>Index levels in the table: {idxLines.join("; ")}. </>}
            {gainer && <>The first stock in the gainers list is {gainer}. </>}
            {loser && <>The first stock in the losers list is {loser}. </>}
            {active && <>The most active list begins with {active}. </>}
            {sectors.length > 0 && <>The heatmap covers {sectors.length} sectors. </>}
            {Array.isArray(data?.fiftyTwo?.nearHighs) && Array.isArray(data?.fiftyTwo?.nearLows) && <>The 52-week lists show {data!.fiftyTwo.nearHighs.length} stocks near highs and {data!.fiftyTwo.nearLows.length} near lows.</>}
          </p>
          <p>These sentences are filled in from the same data as the tables below and describe quotes only. Quotes outside regular trading hours can be pre-market or after-hours prices.</p>
        </Snapshot>
      )}

      <h3>The indices at the top</h3>
      <dl>
        <dt>S&amp;P 500</dt>
        <dd>A market-capitalisation weighted index of about 500 large US companies, widely used as the benchmark for the US equity market.</dd>
        <dt>Nasdaq Composite</dt>
        <dd>Covers most stocks listed on the Nasdaq exchange and leans towards technology and growth companies.</dd>
        <dt>Dow Jones Industrial Average</dt>
        <dd>A price-weighted index of 30 large companies. Because it is price-weighted, a high-priced share moves it more than its size alone would suggest.</dd>
        <dt>Russell 2000</dt>
        <dd>Tracks about 2,000 small US companies and is often read as a gauge of domestic economic sentiment and risk appetite.</dd>
        <dt>VIX</dt>
        <dd>The CBOE Volatility Index, derived from S&amp;P 500 option prices. A higher VIX signals that traders expect larger swings; it is often called the fear gauge.</dd>
      </dl>

      <h3>Reading the heatmap and tables</h3>
      <p>
        In the heatmap each tile is a company, grouped by sector. Tile size reflects market value and colour shows the day&apos;s percentage change, so you can see at a glance whether a move is broad or concentrated in a few large names. Gainers and losers rank stocks by percentage change, but a small, thinly traded company can move far more than a large one on little news, so compare the change with volume and market capitalisation. The most active list ranks by trading volume and shows where attention is concentrated. The 52-week lists show stocks near the top or bottom of their yearly range, together with the distance from those levels.
      </p>

      <h3>Why Indian investors watch Wall Street</h3>
      <p>
        US markets close during the Indian night, so their direction is one of the inputs in the <Link href="/">daily pre-market report</Link>. Moves in US technology shares, bond yields and the dollar can influence IT stocks, foreign fund flows and the rupee. Treat the link as context, not a rule: Indian markets also respond to domestic data, earnings and policy. To track Indian prices see the <Link href="/nse-data">NSE data dashboard</Link>, and for news behind the moves visit the <Link href="/news">market news page</Link>. If you are new to reading charts, the <Link href="/stock-market-basics">stock market basics guide</Link> explains the vocabulary.
      </p>
      <p>
        Quotes can be delayed and are provided for information only. Nothing here is a recommendation to buy or sell; see the <Link href="/disclaimer">disclaimer</Link>.
      </p>
    </Prose>
  );
}
