import type { SVGProps } from "react";

const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
type P = SVGProps<SVGSVGElement>;

export const IconHome = (p: P) => <svg {...base} {...p}><rect x="3" y="3" width="8" height="10" rx="2" /><rect x="13" y="3" width="8" height="6" rx="2" /><rect x="13" y="11" width="8" height="10" rx="2" /><rect x="3" y="15" width="8" height="6" rx="2" /></svg>;
export const IconNews = (p: P) => <svg {...base} {...p}><path d="M4 5h12v14H6a2 2 0 0 1-2-2V5z" /><path d="M16 9h4v8a2 2 0 0 1-2 2h-2" /><path d="M7.5 9h5M7.5 12.5h5M7.5 16h3" /></svg>;
export const IconIndia = (p: P) => <svg {...base} {...p}><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 15l3-4 3 2 5-7" /></svg>;
export const IconGlobe = (p: P) => <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" /></svg>;
export const IconCoin = (p: P) => <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M14.5 9.2c-.4-.8-1.3-1.2-2.5-1.2-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.2 0-2.1-.4-2.5-1.2M12 6v2M12 16v2" /></svg>;
export const IconTarget = (p: P) => <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></svg>;
export const IconBook = (p: P) => <svg {...base} {...p}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z" /><path d="M4 19a2 2 0 0 1 2-2h13" /></svg>;
export const IconSearch = (p: P) => <svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
export const IconMore = (p: P) => <svg {...base} {...p}><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></svg>;
export const IconSun = (p: P) => <svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
export const IconMoon = (p: P) => <svg {...base} {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>;
export const IconArrow = (p: P) => <svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
