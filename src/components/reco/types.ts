export type Reco = {
  _id?: string;
  symbol?: string;
  tradeType?: string;
  status?: string;
  term?: string;
  entryPrice?: number | null;
  stopLoss?: number | null;
  exitPrice?: number | null;
  ltp?: number | null;
  upsidePotential?: number | null;
  reason?: string;
  breakoutType?: string[];
  timeline?: { target?: string; value?: string | number; status?: string }[];
  addedDate?: string;
  addedBy?: { name?: string };
  advisor?: { _id?: string; displayName?: string; advisorType?: string } | null;
};

export type RecoPage = { success: boolean; error?: string; data?: Reco[]; page: number; pages: number; total: number };

export const BREAKOUT_LABELS: Record<string, string> = {
  V_SHAPE: "V-Shape", DOUBLE_BOTTOM: "Double Bottom", CUP_HANDLE: "Cup & Handle", BULL_FLAG: "Bull Flag",
  CONSOLIDATION: "Consolidation", BREAKOUT_RESISTANCE: "Resistance BO", REVERSAL: "Reversal", MOMENTUM: "Momentum",
};
export const TERM_LABEL: Record<string, string> = { INTRADAY: "Intraday", SHORT_TERM: "Short Term", MEDIUM_TERM: "Medium Term", LONG_TERM: "Long Term" };
export const ADVISOR_LABEL: Record<string, string> = { sebi_registered: "SEBI Registered", education_institute: "Education Institute", independent_advisor: "Independent Advisor" };
