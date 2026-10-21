"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { api, ApiError } from "@/lib/api";

type Ok = { success: boolean; error?: string };
type Report = { _id: string; title: string; generatedAt: string; eventsCount: number; isPublished: boolean };
type Pagination = { page: number; pages: number; total: number };
type Ev = {
  eventNumber: number; title: string; detailedSummary: string; historicalComparison?: string; category: string;
  expectedImpact: string; impactSeverity: string; verificationStatus?: string; estimatedImpactPercent?: string;
  sourceReliability?: string; newsDate?: string; affectedMarkets?: string[];
};
type Reco = { _id: string; symbol: string; tradeType: string; entryPrice: number; exitPrice: number; stopLoss: number; term: string; status: string; addedDate?: string };

const SENTIMENTS = ["Bullish", "Mildly Bullish", "Neutral", "Mildly Bearish", "Bearish"];
const CATEGORIES = ["Geopolitical", "Domestic Market", "Global Market", "Technical Analysis", "Corporate Action", "Analyst View", "Economic Data", "Policy"];
const IMPACTS = ["Positive", "Negative", "Neutral"];
const SEVERITIES = ["Low", "Moderate", "High", "Critical"];
const VERIFICATIONS = ["Unverified", "Confirmed", "Official Source"];
const RELIABILITY = ["Medium", "High", "Low"];
const BREAKOUTS = ["V_SHAPE", "DOUBLE_BOTTOM", "CUP_HANDLE", "BULL_FLAG", "CONSOLIDATION", "BREAKOUT_RESISTANCE", "REVERSAL", "MOMENTUM"];

const field = "w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">{label}</span>
      {children}
    </label>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : "Request failed");

export function AdminApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const say = useCallback((kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 6000);
  }, []);

  // Session check: the admin token lives in an httpOnly cookie, so ask the server by making a cheap authed call.
  useEffect(() => {
    api("/admin/reports?page=1&limit=1").then(() => setAuthed(true), () => setAuthed(false));
  }, []);

  return (
    <main className="container-x section">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Control room</p>
          <h1 className="display text-4xl">Admin</h1>
        </div>
        {authed && (
          <button
            className="btn btn-ghost"
            onClick={async () => {
              await api("/admin/logout", { method: "POST", body: "{}" }).catch(() => null);
              setAuthed(false);
            }}
          >
            Sign out
          </button>
        )}
      </div>
      {toast && (
        <div role="status" className={`card mb-4 !py-3 text-sm ${toast.kind === "ok" ? "up" : "down"}`}>
          {toast.text}
        </div>
      )}
      {authed === null && <div className="skeleton h-40" />}
      {authed === false && <Login onDone={() => setAuthed(true)} />}
      {authed && <Dashboard say={say} onExpired={() => setAuthed(false)} />}
    </main>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api("/admin/login", { method: "POST", body: JSON.stringify({ password: pwd }) });
      setPwd("");
      onDone();
    } catch (x) {
      setErr(msg(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="card mx-auto max-w-md space-y-4">
      <h2 className="section-title">Sign in</h2>
      <Field label="Admin password">
        <input type="password" autoComplete="current-password" required value={pwd} onChange={(e) => setPwd(e.target.value)} className={field} />
      </Field>
      {err && <p className="down text-sm" role="alert">{err}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

function Dashboard({ say, onExpired }: { say: (k: "ok" | "err", t: string) => void; onExpired: () => void }) {
  const [tab, setTab] = useState<"reports" | "ops" | "recos">("reports");
  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      onExpired();
      say("err", "Session expired. Please sign in again.");
    } else say("err", msg(e));
  }, [onExpired, say]);

  return (
    <div className="space-y-5">
      <div className="seg" role="tablist">
        {([["reports", "Reports"], ["ops", "Data jobs"], ["recos", "Trade recommendations"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "reports" && <Reports say={say} fail={fail} />}
      {tab === "ops" && <Ops say={say} fail={fail} />}
      {tab === "recos" && <Recos say={say} fail={fail} />}
    </div>
  );
}

type Ctx = { say: (k: "ok" | "err", t: string) => void; fail: (e: unknown) => void };

function Reports({ say, fail }: Ctx) {
  const [rows, setRows] = useState<Report[] | null>(null);
  const [pg, setPg] = useState<Pagination>({ page: 1, pages: 1, total: 0 });
  const [gen, setGen] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const [events, setEvents] = useState<{ id: string; title: string } | null>(null);

  const load = useCallback(async (page = 1) => {
    try {
      const d = await api<Ok & { reports: Report[]; pagination: Pagination }>(`/admin/reports?page=${page}&limit=10`);
      setRows(d.reports);
      setPg(d.pagination);
    } catch (e) {
      fail(e);
    }
  }, [fail]);
  useEffect(() => { const t = setTimeout(() => load(1), 0); return () => clearTimeout(t); }, [load]);

  async function generate() {
    setGen(true);
    try {
      const d = await api<Ok & { reportId?: string }>("/admin/generate-report", { method: "POST", body: "{}" });
      if (!d.success) throw new Error(d.error);
      say("ok", `Report generated (ID ${d.reportId}).`);
      load(1);
    } catch (e) { fail(e); } finally { setGen(false); }
  }
  async function togglePublish(id: string) {
    try {
      const d = await api<Ok & { message?: string }>(`/admin/reports/${id}/publish`, { method: "PATCH", body: "{}" });
      if (!d.success) throw new Error(d.error);
      say("ok", d.message ?? "Updated");
      load(pg.page);
    } catch (e) { fail(e); }
  }
  async function remove() {
    if (!del) return;
    try {
      const d = await api<Ok>(`/admin/reports/${del}`, { method: "DELETE" });
      if (!d.success) throw new Error(d.error);
      say("ok", "Report deleted.");
      setDel(null);
      load(pg.page);
    } catch (e) { fail(e); }
  }

  return (
    <section className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">Daily market report</h2>
          <p className="muted text-sm">Generating takes 1–3 minutes. Total reports: <span className="num">{pg.total}</span></p>
        </div>
        <button className="btn btn-primary" onClick={generate} disabled={gen}>{gen ? "Generating… (1–3 min)" : "Generate report"}</button>
      </div>
      <div className="card overflow-x-auto !p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="muted text-left text-[11px] uppercase tracking-wider">
            <tr><th className="p-3">Title</th><th className="p-3">Generated</th><th className="p-3">Events</th><th className="p-3">Status</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan={5} className="p-6"><div className="skeleton h-8" /></td></tr>}
            {rows?.length === 0 && <tr><td colSpan={5} className="muted p-6 text-center">No reports yet.</td></tr>}
            {rows?.map((r) => (
              <tr key={r._id} className="border-t border-[var(--line)]">
                <td className="p-3 font-semibold">{r.title}</td>
                <td className="p-3">{new Date(r.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="num p-3">{r.eventsCount}</td>
                <td className="p-3"><span className={`chip ${r.isPublished ? "chip-up" : "chip-warn"}`}>{r.isPublished ? "Published" : "Draft"}</span></td>
                <td className="flex flex-wrap justify-end gap-2 p-3">
                  <button className="btn btn-ghost !py-1.5" onClick={() => setEdit(r._id)}>Edit</button>
                  <button className="btn btn-ghost !py-1.5" onClick={() => togglePublish(r._id)}>{r.isPublished ? "Unpublish" : "Publish"}</button>
                  <button className="btn btn-ghost !py-1.5 down" onClick={() => setDel(r._id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pg.pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button className="btn btn-ghost" disabled={pg.page <= 1} onClick={() => load(pg.page - 1)}>← Prev</button>
          <span className="num">{pg.page} / {pg.pages}</span>
          <button className="btn btn-ghost" disabled={pg.page >= pg.pages} onClick={() => load(pg.page + 1)}>Next →</button>
        </div>
      )}

      {edit && <EditReport id={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(pg.page); }} onEvents={(t) => { setEvents({ id: edit, title: t }); setEdit(null); }} say={say} fail={fail} />}
      {events && <EventsModal id={events.id} title={events.title} onClose={() => setEvents(null)} say={say} fail={fail} />}
      <Modal open={!!del} onClose={() => setDel(null)} title="Delete report?">
        <p className="mb-5 text-sm">This permanently removes the report and its events. It cannot be undone.</p>
        <div className="flex gap-3">
          <button className="btn btn-ghost" onClick={() => setDel(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={remove}>Delete</button>
        </div>
      </Modal>
    </section>
  );
}

function EditReport({ id, onClose, onSaved, onEvents, say, fail }: { id: string; onClose: () => void; onSaved: () => void; onEvents: (title: string) => void } & Ctx) {
  const [f, setF] = useState<{ title: string; sentiment: string; ta: string; io: string; disc: string } | null>(null);
  useEffect(() => {
    api<Ok & { report?: { reportTitle?: string; disclaimer?: string; overallMarketSummary?: { sentimentIndicator?: string; technicalAnalysis?: string; intradayOutlook?: string } } }>(`/admin/reports/${id}`)
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        const r = d.report, s = r?.overallMarketSummary;
        setF({ title: r?.reportTitle ?? "", sentiment: s?.sentimentIndicator ?? "Neutral", ta: s?.technicalAnalysis ?? "", io: s?.intradayOutlook ?? "", disc: r?.disclaimer ?? "" });
      })
      .catch((e) => { fail(e); onClose(); });
  }, [id, fail, onClose]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    try {
      const d = await api<Ok>(`/admin/reports/${id}`, {
        method: "PUT",
        body: JSON.stringify({ report: { reportTitle: f.title, overallMarketSummary: { sentimentIndicator: f.sentiment, technicalAnalysis: f.ta, intradayOutlook: f.io }, disclaimer: f.disc } }),
      });
      if (!d.success) throw new Error(d.error);
      say("ok", "Report updated.");
      onSaved();
    } catch (x) { fail(x); }
  }
  const set = (k: keyof NonNullable<typeof f>) => (e: { target: { value: string } }) => setF((p) => p && { ...p, [k]: e.target.value });

  return (
    <Modal open onClose={onClose} title="Edit report" wide>
      {!f ? <div className="skeleton h-40" /> : (
        <form onSubmit={save} className="space-y-4">
          <Field label="Title"><input className={field} required value={f.title} onChange={set("title")} /></Field>
          <Field label="Sentiment">
            <select className={field} value={f.sentiment} onChange={set("sentiment")}>{SENTIMENTS.map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
          <Field label="Technical analysis"><textarea rows={4} className={field} value={f.ta} onChange={set("ta")} /></Field>
          <Field label="Intraday outlook"><textarea rows={4} className={field} value={f.io} onChange={set("io")} /></Field>
          <Field label="Disclaimer"><textarea rows={3} className={field} value={f.disc} onChange={set("disc")} /></Field>
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary">Save changes</button>
            <button type="button" className="btn btn-ghost" onClick={() => onEvents(f.title)}>Manage events</button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

const blankEv = { title: "", detailedSummary: "", historicalComparison: "", category: "", expectedImpact: "", impactSeverity: "", verificationStatus: "Unverified", estimatedImpactPercent: "", sourceReliability: "Medium", newsDate: "", markets: "" };

function EventsModal({ id, title, onClose, say, fail }: { id: string; title: string; onClose: () => void } & Ctx) {
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [form, setForm] = useState<(typeof blankEv & { n?: number }) | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<Ok & { events: Ev[] }>(`/admin/reports/${id}/events`);
      if (!d.success) throw new Error(d.error);
      setEvents(d.events ?? []);
    } catch (e) { fail(e); }
  }, [id, fail]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const errs: string[] = [];
    if (form.title.trim().length < 10) errs.push("Title must be at least 10 characters");
    if (form.detailedSummary.trim().length < 20) errs.push("Summary must be at least 20 characters");
    if (!form.expectedImpact || !form.impactSeverity || !form.category) errs.push("Category, impact and severity are required");
    if (errs.length) return say("err", errs.join("; "));
    const { n, markets, ...rest } = form;
    const event = { ...rest, title: rest.title.trim(), detailedSummary: rest.detailedSummary.trim(), affectedMarkets: markets.split(",").map((m) => m.trim()).filter(Boolean) };
    try {
      const d = await api<Ok>(n ? `/admin/reports/${id}/events/${n}` : `/admin/reports/${id}/events`, { method: n ? "PUT" : "POST", body: JSON.stringify({ event }) });
      if (!d.success) throw new Error(d.error);
      say("ok", n ? "Event updated." : "Event added.");
      setForm(null);
      load();
    } catch (x) { fail(x); }
  }
  async function remove(ev: Ev) {
    if (!window.confirm(`Delete event "${ev.title}"? This cannot be undone.`)) return;
    try {
      const d = await api<Ok>(`/admin/reports/${id}/events/${ev.eventNumber}`, { method: "DELETE" });
      if (!d.success) throw new Error(d.error);
      say("ok", "Event deleted.");
      load();
    } catch (x) { fail(x); }
  }
  const set = (k: keyof typeof blankEv) => (e: { target: { value: string } }) => setForm((p) => p && { ...p, [k]: e.target.value });
  const sel = (k: keyof typeof blankEv, opts: string[], ph?: string) => (
    <select className={field} value={form?.[k] ?? ""} onChange={set(k)}>{ph && <option value="">{ph}</option>}{(form?.[k] && !opts.includes(form[k] as string) ? [form[k] as string, ...opts] : opts).map((o) => <option key={o}>{o}</option>)}</select>
  );

  return (
    <Modal open onClose={onClose} title={`Events — ${title || "Untitled report"}`} wide>
      <div className="space-y-4">
        {!form && <button className="btn btn-primary" onClick={() => setForm({ ...blankEv, newsDate: new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) })}>Add event</button>}
        {form && (
          <form onSubmit={save} className="card space-y-3">
            <h4 className="font-semibold">{form.n ? `Edit event #${form.n}` : "New event"}</h4>
            <Field label="Title"><input className={field} value={form.title} onChange={set("title")} /></Field>
            <Field label="Detailed summary"><textarea rows={3} className={field} value={form.detailedSummary} onChange={set("detailedSummary")} /></Field>
            <Field label="Historical comparison"><textarea rows={2} className={field} value={form.historicalComparison} onChange={set("historicalComparison")} /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Category">{sel("category", CATEGORIES, "Select")}</Field>
              <Field label="Impact">{sel("expectedImpact", IMPACTS, "Select")}</Field>
              <Field label="Severity">{sel("impactSeverity", SEVERITIES, "Select")}</Field>
              <Field label="Verification">{sel("verificationStatus", VERIFICATIONS)}</Field>
              <Field label="Source reliability">{sel("sourceReliability", RELIABILITY)}</Field>
              <Field label="Est. impact %"><input className={field} value={form.estimatedImpactPercent} onChange={set("estimatedImpactPercent")} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="News date"><input className={field} value={form.newsDate} onChange={set("newsDate")} /></Field>
              <Field label="Affected markets (comma separated)"><input className={field} value={form.markets} onChange={set("markets")} /></Field>
            </div>
            <div className="flex gap-3"><button className="btn btn-primary">Save event</button><button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button></div>
          </form>
        )}
        {events === null && <div className="skeleton h-24" />}
        {events?.length === 0 && <p className="muted py-6 text-center text-sm">No events yet.</p>}
        {events?.map((ev) => (
          <div key={ev.eventNumber} className="card !p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="chip num">#{ev.eventNumber}</span><span className="chip">{ev.category}</span>
              <span className={`chip ${ev.expectedImpact === "Positive" ? "chip-up" : ev.expectedImpact === "Negative" ? "chip-down" : ""}`}>{ev.expectedImpact} · {ev.impactSeverity}</span>
              <span className="chip">{ev.verificationStatus || "Unverified"}</span>
            </div>
            <h5 className="font-semibold">{ev.title}</h5>
            <p className="muted mt-1 text-sm">{ev.detailedSummary.slice(0, 200)}{ev.detailedSummary.length > 200 ? "…" : ""}</p>
            <div className="mt-3 flex gap-2">
              <button className="btn btn-ghost !py-1.5" onClick={() => setForm({ title: ev.title, detailedSummary: ev.detailedSummary, historicalComparison: ev.historicalComparison ?? "", category: ev.category, expectedImpact: ev.expectedImpact, impactSeverity: ev.impactSeverity, verificationStatus: ev.verificationStatus ?? "Unverified", estimatedImpactPercent: ev.estimatedImpactPercent ?? "", sourceReliability: ev.sourceReliability ?? "Medium", newsDate: ev.newsDate ?? "", markets: (ev.affectedMarkets ?? []).join(", "), n: ev.eventNumber })}>Edit</button>
              <button className="btn btn-ghost down !py-1.5" onClick={() => remove(ev)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function Job({ title, desc, label, path, confirm, render, say, fail, after }: {
  title: string; desc: string; label: string; path: string; confirm?: string;
  render: (d: Record<string, any>) => string; // eslint-disable-line @typescript-eslint/no-explicit-any
  after?: () => void;
} & Ctx) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState("");
  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setOut("Running… this can take a few minutes.");
    try {
      const d = await api<Ok & Record<string, unknown>>(path, { method: "POST", body: "{}" });
      if (!d.success) throw new Error(d.error);
      setOut(render(d));
      say("ok", `${title}: done`);
      after?.();
    } catch (e) { setOut(`Error: ${msg(e)}`); fail(e); } finally { setBusy(false); }
  }
  return (
    <div className="card space-y-3">
      <div><h3 className="font-semibold">{title}</h3><p className="muted text-sm">{desc}</p></div>
      <button className="btn btn-ghost" onClick={run} disabled={busy}>{busy ? "Working…" : label}</button>
      {out && <p className="num text-xs leading-relaxed text-[var(--ink-2)]" aria-live="polite">{out}</p>}
    </div>
  );
}

function Ops({ say, fail }: Ctx) {
  const [status, setStatus] = useState<string>("");
  const check = useCallback(async () => {
    try {
      const d = await api<Ok & { status: { symbolsInDB: number; tempFilesCount: number; mode: string; latestCalcDate?: string; lastCalculatedAt?: string } }>("/admin/bhavcopy/status");
      if (!d.success) throw new Error(d.error);
      const s = d.status;
      setStatus(`${s.symbolsInDB.toLocaleString()} symbols · ${s.tempFilesCount}/60 temp files · mode ${s.mode} · latest ${s.latestCalcDate ?? "—"} · calculated ${s.lastCalculatedAt ? new Date(s.lastCalculatedAt).toLocaleString("en-IN") : "—"}`);
    } catch (e) { fail(e); }
  }, [fail]);
  useEffect(() => { const t = setTimeout(check, 0); return () => clearTimeout(t); }, [check]);
  const c = { say, fail };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="card md:col-span-2"><p className="eyebrow">BhavCopy status</p><p className="num mt-1 text-sm">{status || "Loading…"}</p></div>
      <Job {...c} title="Price band hitters" desc="Fetch from NSE and save to MongoDB." label="Sync price bands" path="/admin/nse/price-band-hitters/sync"
        render={(d: any) => `Synced ${d.sync?.count} stocks at ${new Date(d.sync?.fetchedAt).toLocaleString("en-IN")}`} />
      <Job {...c} title="BhavCopy sync" desc="Download the latest CSV and recompute indicators." label="Sync BhavCopy" path="/admin/bhavcopy/sync" after={check}
        render={(d: any) => `Mode ${d.result?.mode} · ${d.result?.totalSymbols} symbols · ${d.result?.totalStored} updated · latest ${d.result?.latestDate}${d.result?.errors?.length ? ` · ${d.result.errors.length} errors` : ""}`} />
      <Job {...c} title="BhavCopy full reset" desc="Deletes all BhavCopy records and temp files, then re-downloads 60 trading days (2–3 min)." label="Reset & resync" path="/admin/bhavcopy/reset" after={check}
        confirm="Full reset: delete all BhavCopy records from MongoDB, clear temp files and re-download the last 60 trading days (~2–3 minutes). Continue?"
        render={(d: any) => `Reset complete · ${d.result?.totalSymbols} symbols · ${d.result?.totalStored} updated · ${d.result?.dates?.length ?? 0} dates · latest ${d.result?.latestDate}`} />
      <Job {...c} title="Trade price sync" desc="Update open trade recommendations from the latest BhavCopy." label="Sync trade prices" path="/admin/trade-recommendations/sync-prices"
        render={(d: any) => `BhavCopy ${d.dateStr} · open ${d.totalOpen} · updated ${d.updated} · success ${d.successCount} · failed ${d.failedCount} · LTP-only ${d.ltpOnly}${d.notFound?.length ? ` · not in BhavCopy: ${d.notFound.join(", ")}` : ""}`} />
      <Job {...c} title="Weekly email" desc="Send the unsent recommendations broadcast to subscribers." label="Send weekly emails" path="/admin/email/send-weekly"
        confirm="Send the weekly recommendation email to subscribers now?"
        render={(d: any) => `Sent ${d.summary?.sent} / ${d.summary?.toSend} (${d.summary?.failed} failed)`} />
    </section>
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

const blankReco = { symbol: "", tradeType: "", entryPrice: "", exitPrice: "", ltp: "", stopLoss: "", upsidePotential: "", term: "", status: "OPEN", visible_status: "VIEW_TO_ALL", reference: "", userId: "", userName: "", addedDate: "", reason: "" };

function Recos({ say, fail }: Ctx) {
  const [list, setList] = useState<Reco[] | null>(null);
  const [f, setF] = useState(blankReco);
  const [breakout, setBreakout] = useState<string[]>([]);
  const [tl, setTl] = useState<{ target: string; value: string; status: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<Ok & { data: Reco[] }>("/admin/trade-recommendations?limit=15&page=1");
      setList(d.data ?? []);
    } catch (e) { fail(e); }
  }, [fail]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const nums = ["entryPrice", "exitPrice", "ltp", "stopLoss", "upsidePotential"] as const;
    if (!f.symbol.trim() || !f.tradeType || !f.term || f.reason.trim().length <= 5 || nums.some((k) => f[k] === "" || Number.isNaN(Number(f[k])))) {
      return say("err", "Please fill in all required fields.");
    }
    setBusy(true);
    try {
      const payload = {
        symbol: f.symbol.trim().toUpperCase(), tradeType: f.tradeType, entryPrice: Number(f.entryPrice), exitPrice: Number(f.exitPrice), ltp: Number(f.ltp),
        stopLoss: Number(f.stopLoss), upsidePotential: Number(f.upsidePotential), term: f.term, status: f.status, visible_status: f.visible_status,
        reference: f.reference.trim(), addedBy: { userId: f.userId.trim(), name: f.userName.trim() }, addedDate: f.addedDate || new Date().toISOString().slice(0, 10),
        breakoutType: breakout, reason: f.reason.trim(), timeline: tl.map((t) => ({ target: t.target.trim(), value: t.value.trim(), status: t.status })).filter((t) => t.target || t.value),
      };
      const d = await api<Ok & { data?: { symbol: string } }>("/admin/trade-recommendations", { method: "POST", body: JSON.stringify(payload) });
      if (!d.success) throw new Error(d.error);
      say("ok", `Recommendation for ${d.data?.symbol ?? payload.symbol} saved.`);
      setF(blankReco); setBreakout([]); setTl([]);
      load();
    } catch (x) { fail(x); } finally { setBusy(false); }
  }
  async function remove(r: Reco) {
    if (!window.confirm(`Delete the ${r.symbol} recommendation?`)) return;
    try {
      const d = await api<Ok>(`/admin/trade-recommendations/${r._id}`, { method: "DELETE" });
      if (!d.success) throw new Error(d.error);
      say("ok", "Deleted.");
      load();
    } catch (x) { fail(x); }
  }
  const set = (k: keyof typeof blankReco) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const num = (k: keyof typeof blankReco, label: string) => <Field label={`${label} *`}><input type="number" step="0.01" min="0" className={field} value={f[k]} onChange={set(k)} /></Field>;

  return (
    <section className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <form onSubmit={submit} className="card space-y-3" noValidate>
        <h2 className="section-title">Add recommendation</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Symbol *"><input className={`${field} uppercase`} value={f.symbol} onChange={set("symbol")} placeholder="RELIANCE" /></Field>
          <Field label="Trade type *"><select className={field} value={f.tradeType} onChange={set("tradeType")}><option value="">Select</option><option>BUY</option><option>SELL</option></select></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">{num("entryPrice", "Entry")}{num("exitPrice", "Exit")}{num("ltp", "LTP")}{num("stopLoss", "Stop loss")}{num("upsidePotential", "Upside %")}
          <Field label="Term *"><select className={field} value={f.term} onChange={set("term")}><option value="">Select</option>{["SHORT_TERM", "MEDIUM_TERM", "LONG_TERM", "INTRADAY"].map((t) => <option key={t}>{t}</option>)}</select></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status"><select className={field} value={f.status} onChange={set("status")}>{["OPEN", "WATCHLIST", "PARTIAL", "CLOSED", "CANCELLED"].map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Visibility"><select className={field} value={f.visible_status} onChange={set("visible_status")}>{["VIEW_TO_ALL", "PRO_MEMBER", "PRO_PLUS_MEMBER"].map((t) => <option key={t}>{t}</option>)}</select></Field>
        </div>
        <Field label="Reference URL"><input type="url" className={field} value={f.reference} onChange={set("reference")} placeholder="https://" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Added by — ID"><input className={field} value={f.userId} onChange={set("userId")} /></Field>
          <Field label="Added by — name"><input className={field} value={f.userName} onChange={set("userName")} /></Field>
          <Field label="Added date"><input type="date" className={field} value={f.addedDate} onChange={set("addedDate")} /></Field>
        </div>
        <div>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Breakout type</span>
          <div className="flex flex-wrap gap-2">
            {BREAKOUTS.map((b) => (
              <button type="button" key={b} aria-pressed={breakout.includes(b)} className={`chip ${breakout.includes(b) ? "chip-gold" : ""}`} onClick={() => setBreakout((p) => (p.includes(b) ? p.filter((x) => x !== b) : [...p, b]))}>{b.replaceAll("_", " ")}</button>
            ))}
          </div>
        </div>
        <Field label="Reason *"><textarea rows={3} className={field} value={f.reason} onChange={set("reason")} /></Field>
        <div className="space-y-2">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Timeline targets</span>
          {tl.map((t, i) => (
            <div key={i} className="flex gap-2">
              <input className={`${field} !w-20`} placeholder={`T${i + 1}`} value={t.target} onChange={(e) => setTl((p) => p.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))} />
              <input className={field} placeholder="Value" value={t.value} onChange={(e) => setTl((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
              <select className={`${field} !w-32`} value={t.status} onChange={(e) => setTl((p) => p.map((x, j) => (j === i ? { ...x, status: e.target.value } : x)))}><option value="pending">Pending</option><option value="completed">Completed</option><option value="missed">Missed</option></select>
              <button type="button" className="btn btn-ghost down" aria-label="Remove target" onClick={() => setTl((p) => p.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost" onClick={() => setTl((p) => [...p, { target: "", value: "", status: "pending" }])}>Add target</button>
        </div>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save recommendation"}</button>
      </form>

      <div className="card space-y-3 self-start">
        <div className="flex items-center justify-between"><h2 className="section-title">Recent</h2><button className="btn btn-ghost !py-1.5" onClick={load}>Refresh</button></div>
        {list === null && <div className="skeleton h-24" />}
        {list?.length === 0 && <p className="muted text-sm">None yet.</p>}
        {list?.map((r) => (
          <div key={r._id} className="stat flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold">{r.symbol} <span className={`chip ${r.tradeType === "BUY" ? "chip-up" : "chip-down"}`}>{r.tradeType}</span></div>
              <div className="num muted text-xs">{r.entryPrice} → {r.exitPrice} · SL {r.stopLoss} · {r.status}</div>
            </div>
            <button className="btn btn-ghost down !py-1.5" onClick={() => remove(r)}>Delete</button>
          </div>
        ))}
      </div>
    </section>
  );
}
