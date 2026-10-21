import Link from "next/link";
import { dayUTC, num, pct, usd } from "@/lib/snapshot";
import { Prose, Snapshot } from "./Prose";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

const px = (c: Any | undefined) => (c && num(c.price) != null ? `${usd(c.price)}${num(c.changePercent24h) != null ? `, ${pct(c.changePercent24h)} in 24 hours` : ""}` : "");
const pair = (p: Any | undefined) => (p?.symbol && num(p.priceChangePercent) != null ? `${p.symbol}/USDT (${pct(p.priceChangePercent)})` : "");

export function CryptoGuide({ data }: { data: Any | null }) {
  const coins = (data?.markets?.data as Any[] | undefined) ?? [];
  const btc = coins.find((c) => c.id === "bitcoin");
  const eth = coins.find((c) => c.id === "ethereum");
  const total = coins.reduce((s, c) => s + (num(c.marketCap) ?? 0), 0);
  const upCount = coins.filter((c) => (num(c.changePercent24h) ?? 0) > 0).length;
  const date = dayUTC(data?.timestamp);
  const topG = pair(data?.gainers?.data?.[0]);
  const topL = pair(data?.losers?.data?.[0]);
  const trend = data?.trending?.data?.[0] as Any | undefined;

  return (
    <Prose label="How to read the crypto dashboard" title="How to read the crypto dashboard">
      <p>
        This dashboard follows the cryptocurrency market with prices, market capitalisation and 24-hour changes for the largest coins, a heatmap of the top 50, the coins people are searching for, and the trading pairs that moved most on Binance. Everything in the tables is rendered on the server from the latest available data, and the refresh button reloads it in place. Cryptocurrencies trade around the clock, so unlike stock tables there is no opening or closing bell: the 24-hour change is measured over a rolling window.
      </p>

      {coins.length > 0 && (
        <Snapshot heading={`Today's snapshot${date ? ` — data timestamp ${date} (UTC)` : ""}`}>
          <p>
            {px(btc) && <>Bitcoin is listed at {px(btc)}. </>}
            {px(eth) && <>Ethereum is listed at {px(eth)}. </>}
            {total > 0 && <>The {coins.length} coins in the top table have a combined market capitalisation of {usd(total)}, and {upCount} of them are up over 24 hours. </>}
            {topG && <>The leading USDT pair gainer is {topG}. </>}
            {topL && <>The leading loser is {topL}. </>}
            {trend?.symbol && px(trend) && <>The first trending coin is {trend.name ?? trend.symbol} ({trend.symbol}) at {px(trend)}.</>}
          </p>
          <p>These sentences are generated from the dashboard data on the server. Prices move constantly and the values may already differ from the live market.</p>
        </Snapshot>
      )}

      <h3>Terms you will see</h3>
      <dl>
        <dt>Market capitalisation</dt>
        <dd>Price multiplied by circulating supply. It ranks coins by size, but it is only as reliable as the supply figure and says nothing about how much money could actually be sold at that price.</dd>
        <dt>24-hour volume</dt>
        <dd>The value traded in the last day. High volume suggests easier entry and exit; very low volume against a large market cap is a warning sign.</dd>
        <dt>7-day and 1-year change</dt>
        <dd>Longer windows that show whether a daily move is part of a trend or a short spike.</dd>
        <dt>ATH (all-time high) and 52-week range</dt>
        <dd>The highest price ever recorded and the yearly range. The distance from the high shows how far a coin has fallen from its peak, which is context rather than a prediction of recovery.</dd>
        <dt>Tiers in the heatmap</dt>
        <dd>The top 50 coins are grouped into mega, large, mid and small tiers by market cap. Tile size scales with value and colour shows the 24-hour change.</dd>
        <dt>USDT pair</dt>
        <dd>A market quoted in Tether, a dollar-pegged stablecoin. The gainers, losers, most active and highest volume tables use Binance USDT pairs.</dd>
        <dt>Trending</dt>
        <dd>Coins attracting unusual search interest. Attention is not the same as quality, and trending coins are often volatile.</dd>
      </dl>

      <h3>Reading the data carefully</h3>
      <p>
        The pairs that top the gainers list are frequently small, illiquid tokens, so a large percentage move may involve very little money. Compare the percentage change with the trade count and the USD volume columns before reading anything into it. Prices differ between exchanges, and market data providers can revise figures. Crypto assets are volatile, may be unregulated in your jurisdiction and can lose most of their value, so only consider amounts you can afford to lose.
      </p>
      <p>
        If you are new to the subject, the <Link href="/understanding-crypto-complete-guide">complete cryptocurrency guide</Link> explains blockchains, wallets and risks in plain language. To see how crypto sits next to equities, compare it with the <Link href="/us-market">US market dashboard</Link> and the <Link href="/nse-data">NSE data page</Link>, and check the <Link href="/news">news page</Link> for events behind a move. Market data comes from public providers including CoinGecko and Binance. This page is for information only; read our <Link href="/disclaimer">disclaimer</Link>.
      </p>
    </Prose>
  );
}
