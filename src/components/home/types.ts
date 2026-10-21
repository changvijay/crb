/* Loose shapes for the report JSON produced by the Express backend (read as-is, never mocked). */
export type Dict = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Report = Dict & {
  generatedAt?: string;
  overallMarketSummary?: Dict;
  globalMarketSnapshot?: Dict;
  events?: Dict[];
  disclaimer?: string;
};

export type TechnicalData = Dict & { nifty50?: Dict; bankNifty?: Dict; sensex?: Dict; optionChain?: Dict };

export type ReportEntry = { id: string; title?: string; generatedAt: string; report: Report; meta?: Dict; technicalData?: TechnicalData };

export type RecentReports = {
  success: boolean;
  error?: string;
  hasReports: boolean;
  reports: ReportEntry[];
  latestReport?: { report: Report; meta?: Dict; technicalData?: TechnicalData };
};

export type SevenDay = {
  success: boolean;
  nifty50?: { days: Dict[] };
  bankNifty?: { days: Dict[] };
  sensex?: { days: Dict[] };
};
