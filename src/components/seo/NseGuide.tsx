import Link from "next/link";
import { dayIST, inr, list, num, pct } from "@/lib/snapshot";
import { Prose, Snapshot } from "./Prose";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

const mover = (s: Any | undefined) => (s?.symbol && num(s.pChange) != null ? `${s.symbol} (${pct(s.pChange)} at ₹${inr(s.lastPrice)})` : "");

export function NseGuide({ gl, wk, band, ipo, idx, bhav }: { gl: Any | null; wk: Any | null; band: Any | null; ipo: Any | null; idx: Any | null; bhav: Any | null }) {
  const gainer = mover(gl?.gainers?.[0]);
  const loser = mover(gl?.losers?.[0]);
  const indices = (idx?.indices as Any[] | undefined) ?? [];
  const up = indices.filter((i) => num(i.price_change_per) != null && i.price_change_per >= 0).length;
  const nifty = indices.find((i) => i.name === "Nifty 50");
  const ipos = (ipo?.ipoList as Any[] | undefined) ?? [];
  const byStatus = (s: string) => ipos.filter((i) => i.status === s).length;
  const stamp = dayIST(gl?.fetchedAt ?? idx?.fetchedAt);

  return (
    <Prose label="How to read the NSE market data dashboard" title="How to read the NSE market data dashboard">
      <p>
        This page collects the main daily tables for the National Stock Exchange of India (NSE) in one place: the sector heatmap, a technical scan of every equity in the exchange&apos;s daily BhavCopy file, an index comparison chart, global indices, the biggest gainers and losers, stocks at 52-week highs and lows, penny stocks, stocks locked at their price bands, the most active names, NSE and BSE index levels, and the IPO calendar with grey market premium. Each table is rendered on the server from the same data the interactive version uses, so you can read it even before the scripts load. You can sort most columns by clicking the header.
      </p>

      {(gainer || loser || indices.length > 0 || ipos.length > 0) && (
        <Snapshot heading={`Today's snapshot${stamp ? ` — data fetched ${stamp}` : ""}`}>
          <p>
            {gainer && <>The top gainer in the gainers table is {gainer}. </>}
            {loser && <>The top loser is {loser}. </>}
            {wk && Array.isArray(wk.high) && Array.isArray(wk.low) && <>The 52-week table currently lists {wk.high.length} stocks near highs and {wk.low.length} near lows. </>}
            {band?.summary && num(band.summary.UPPER) != null && num(band.summary.LOWER) != null && <>The price band tracker shows {band.summary.UPPER} stocks in the upper band and {band.summary.LOWER} in the lower band. </>}
            {nifty && <>The Nifty 50 stood at {inr(nifty.ltp)} ({pct(nifty.price_change_per)}). </>}
            {indices.length > 0 && <>{up} of the {indices.length} NSE indices in the table are up on the day. </>}
            {ipos.length > 0 && <>The IPO table lists {ipos.length} issues, including {list([`${byStatus("Open")} open`, `${byStatus("Upcoming")} upcoming`, `${byStatus("Listed")} listed`])}. </>}
            {num(bhav?.count) != null && <>The BhavCopy scan covers {bhav!.count} securities{bhav?.latestDate ? ` for the trading date ${bhav.latestDate}` : ""}.</>}
          </p>
          <p>These lines are generated from the tables on this page when it is built and refreshed, and they describe the data only; they are not a view on any stock.</p>
        </Snapshot>
      )}

      <h3>What each table means</h3>
      <dl>
        <dt>Heatmap</dt>
        <dd>Companies are grouped by sector and sized by market capitalisation. Colour shows the percentage change, so a large red block in a big sector is a sign of broad weakness.</dd>
        <dt>BhavCopy technicals</dt>
        <dd>The BhavCopy is the end-of-day file the exchange publishes with each security&apos;s open, high, low, close, volume and delivery quantity. The scan adds RSI, MACD, Bollinger Bands, moving averages and volume or delivery breakout flags to every equity.</dd>
        <dt>Gainers and losers</dt>
        <dd>Stocks ranked by percentage change from the previous close. A big move on thin volume says less than the same move on heavy volume.</dd>
        <dt>52-week highs and lows</dt>
        <dd>Stocks trading at or near the highest or lowest price of the past year. Highs often reflect strong trends; lows may reflect real problems or a bargain, which only research on the company can settle.</dd>
        <dt>Penny stocks</dt>
        <dd>Low-priced, usually small-cap shares. They can swing sharply and may be hard to sell, so liquidity and company quality deserve extra care.</dd>
        <dt>Price band hitters</dt>
        <dd>Every stock has a daily price band, a percentage limit beyond which the exchange does not allow trading that day. Upper-band stocks have hit the maximum rise and lower-band stocks the maximum fall. Locked stocks can be impossible to buy or sell at the quoted price.</dd>
        <dt>Most active</dt>
        <dd>High volume gainers show where trading interest is concentrated, and recovery stocks have risen from their intraday low.</dd>
        <dt>IPO and GMP</dt>
        <dd>The table lists price band, issue size, lot size, key dates and status. GMP (grey market premium) is an unofficial price at which an IPO share trades before listing. It is not regulated, can change quickly and is not a guarantee of listing price.</dd>
      </dl>

      <h3>Using the page sensibly</h3>
      <p>
        Start with the heatmap to see which sectors drive the day, then check gainers and losers for individual stories, and use the BhavCopy scan to filter by indicator. Always compare a mover with news for the company on the <Link href="/news">market news page</Link> and review the balance sheet with the <Link href="/fundamental-stock-analysis">fundamental stock analysis tool</Link> or the <Link href="/fundamental-analysis-ratios">financial ratios guide</Link>. For an overview of index construction see the <Link href="/nifty-equity-indices">Nifty equity indices explorer</Link>, and for the chart patterns behind many of these scans read the <Link href="/candlestick-patterns">candlestick patterns reference</Link>.
      </p>
      <p>
        Data comes from public market sources and can be delayed or revised, so verify prices with your broker before acting. Read the <Link href="/disclaimer">disclaimer</Link>: this is education and information, not investment advice.
      </p>
    </Prose>
  );
}
