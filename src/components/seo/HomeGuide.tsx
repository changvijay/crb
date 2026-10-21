import Link from "next/link";
import { dayIST, inr, list, num, pct } from "@/lib/snapshot";
import { Prose, Snapshot } from "./Prose";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

const INDEXES = [
  ["Nifty 50", "nifty50Analysis"],
  ["Bank Nifty", "bankniftyAnalysis"],
  ["Sensex", "sensexAnalysis"],
] as const;

function levels(a: Any | undefined, key: "supportLevels" | "resistanceLevels"): string {
  const xs = ((a?.[key] as unknown[]) ?? []).map((v) => num(v)).filter((v): v is number => v != null).slice(0, 2);
  return xs.length ? xs.map((v) => inr(v)).join(" and ") : "";
}

/** Home page copy. `reports` and `flows` are the same payloads the dashboard hydrates with. */
export function HomeGuide({ reports, flows }: { reports: Any | null; flows: Any | null }) {
  const latest = reports?.latestReport as Any | undefined;
  const summary = latest?.report?.overallMarketSummary as Any | undefined;
  const date = dayIST(latest?.generatedAt);
  const lines = summary
    ? INDEXES.flatMap(([name, key]) => {
        const a = summary[key] as Any | undefined;
        const price = num(a?.currentPrice);
        if (!a || price == null) return [];
        const sup = levels(a, "supportLevels");
        const res = levels(a, "resistanceLevels");
        return [`${name} was at ${inr(price)} in the report${a.trend ? `, with the trend described as "${a.trend}"` : ""}${sup ? `; first supports sit near ${sup}` : ""}${res ? ` and first resistances near ${res}` : ""}.`];
      })
    : [];
  const day = (flows?.data?.day as Any[] | undefined)?.[0];
  const flowLine = day && num(day.fii) != null && num(day.dii) != null
    ? `On ${dayIST(`${day.date}T00:00:00+05:30`) ?? day.date}, the latest session in the flow table, foreign institutional investors (FII) recorded a net ${num(day.fii)! >= 0 ? "buy" : "sell"} of ₹${inr(Math.abs(num(day.fii)!))} crore and domestic institutional investors (DII) a net ${num(day.dii)! >= 0 ? "buy" : "sell"} of ₹${inr(Math.abs(num(day.dii)!))} crore.`
    : "";
  const tech = latest?.technicalData as Any | undefined;
  const moves = tech
    ? ([["Nifty 50", tech.nifty50], ["Bank Nifty", tech.bankNifty], ["Sensex", tech.sensex]] as const).flatMap(([n, t]) => (t && num(t.dayChangePct) != null ? [`${n} ${pct(t.dayChangePct)}`] : []))
    : [];

  return (
    <Prose label="How to read the Chang Research Base daily market report" title="How to read the daily market report">
      <p>
        Chang Research Base (CRB) publishes a pre-market report for Indian equities on trading days. It focuses on three benchmark indices: the Nifty 50, the Bank Nifty and the BSE Sensex. For each one the report lists the current level, a short list of support and resistance prices, a trend and momentum label, and the readings of widely used indicators. The goal is to give a trader or investor one organised page to read before the opening bell, instead of collecting the same numbers from several places.
      </p>

      {summary && (
        <Snapshot heading={`Today's snapshot${date ? ` — report of ${date}` : ""}`}>
          <p>
            The latest report on this page carries an overall sentiment of <strong>{summary.sentimentIndicator ?? "n/a"}</strong>.
            {lines.length ? ` ${lines.join(" ")}` : ""}
            {moves.length ? ` Previous-session moves in the technical data: ${list(moves)}.` : ""}
          </p>
          {flowLine && <p>{flowLine}</p>}
          <p>These figures are copied from the report shown above and refresh whenever a new report is published. They describe market conditions, not a recommendation.</p>
        </Snapshot>
      )}

      <h3>What each section of the report shows</h3>
      <ul>
        <li><strong>Sentiment and outlook.</strong> A one-word read (for example Bullish, Mildly Bullish, Neutral or Bearish) with a short paragraph explaining what drives it, such as global cues, flows or domestic events.</li>
        <li><strong>Index analysis.</strong> Price, trend, momentum and volatility expectation for each index, followed by support and resistance levels.</li>
        <li><strong>FII and DII flows.</strong> Daily, monthly and yearly net buying or selling by foreign and domestic institutions, reported in ₹ crore.</li>
        <li><strong>Intraday charts.</strong> The latest session chart for each index, so you can compare the report with what the market is actually doing.</li>
        <li><strong>Options and open interest.</strong> The put-call ratio and the strikes with the largest open interest, which hint at where option writers are positioned.</li>
        <li><strong>Global cues, events and risks.</strong> US, European and Asian markets, commodities and currencies, plus scheduled events and the main risks and opportunities.</li>
      </ul>

      <h3>Key terms used in the report</h3>
      <dl>
        <dt>Support</dt>
        <dd>A price area where buyers have tended to step in, slowing or stopping a decline. A close below support can mean the area has failed.</dd>
        <dt>Resistance</dt>
        <dd>A price area where sellers have tended to appear, slowing or stopping a rise. A close above resistance can mean the area has been absorbed.</dd>
        <dt>Pivot point</dt>
        <dd>A reference level calculated from the previous session&apos;s high, low and close. Supports and resistances are often derived from it.</dd>
        <dt>RSI (Relative Strength Index)</dt>
        <dd>A momentum gauge from 0 to 100. Readings above 70 are commonly called overbought and below 30 oversold, but strong trends can stay in those zones for a long time.</dd>
        <dt>MACD</dt>
        <dd>A trend-following indicator built from two moving averages. The MACD line above its signal line is read as positive momentum, below it as negative.</dd>
        <dt>Bollinger Bands</dt>
        <dd>A volatility envelope around a moving average. Price near the upper band shows strength, near the lower band weakness, and a narrow band often comes before a larger move.</dd>
        <dt>PCR (Put-Call Ratio)</dt>
        <dd>Total put open interest divided by total call open interest. It is a positioning indicator, not a forecast.</dd>
        <dt>FII and DII</dt>
        <dd>Foreign Institutional Investors and Domestic Institutional Investors. Their net buying or selling is published daily by the exchanges.</dd>
      </dl>

      <h3>How to use it responsibly</h3>
      <p>
        Treat levels as areas to watch, not exact prices, and confirm them with the live charts and your own risk limits. Reports are generated with the help of automated analysis, so read the numbers alongside the reasoning given in each section. To learn the concepts behind the indicators, start with the <Link href="/learning">learning hub</Link>, the <Link href="/technical-analysis-guide">technical analysis guide</Link> or <Link href="/price-action">price action guide</Link>. For live market tables see <Link href="/nse-data">NSE market data</Link>, the <Link href="/us-market">US market dashboard</Link> and the <Link href="/crypto">crypto dashboard</Link>. Please also read our <Link href="/disclaimer">disclaimer</Link>: everything here is for information and education only.
      </p>
    </Prose>
  );
}
