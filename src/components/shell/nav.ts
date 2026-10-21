import { IconBook, IconCoin, IconGlobe, IconHome, IconIndia, IconNews, IconTarget } from "@/components/ui/icons";

export const NAV = [
  { href: "/", label: "Dashboard", short: "Home", Icon: IconHome },
  { href: "/news", label: "News", short: "News", Icon: IconNews },
  { href: "/nse-data", label: "Indian Market", short: "India", Icon: IconIndia },
  { href: "/us-market", label: "US Market", short: "US", Icon: IconGlobe },
  { href: "/crypto", label: "Crypto", short: "Crypto", Icon: IconCoin },
  { href: "/recommendations", label: "Recommendations", short: "Picks", Icon: IconTarget },
  { href: "/learning", label: "Learning", short: "Learn", Icon: IconBook },
] as const;

export const isActive = (href: string, pathname: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
