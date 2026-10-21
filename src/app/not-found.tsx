import Link from "next/link";

export const metadata = { title: { absolute: "404 — Page Not Found | Chang Research Base (CRB)" }, robots: { index: false } };

export default function NotFound() {
  return (
    <div className="container-x grid min-h-[70vh] place-items-center py-16 text-center">
      <div className="rise max-w-xl">
        <p className="display text-[clamp(90px,18vw,180px)] leading-none"><span className="grad-text">404</span></p>
        <h1 className="display mt-2 text-4xl">Page not found</h1>
        <p className="mt-4 text-[15.5px] leading-7 text-[var(--ink-2)]">The page you&apos;re looking for doesn&apos;t exist or has been moved. Head back to the dashboard for AI-powered market analysis.</p>
        <nav aria-label="Navigation" className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn btn-primary">Go to Dashboard</Link>
          <Link href="/news" className="btn btn-ghost">Market News</Link>
          <Link href="/fundamental-indicators" className="btn btn-ghost">Fundamentals</Link>
        </nav>
      </div>
    </div>
  );
}
