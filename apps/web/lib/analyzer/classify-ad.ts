import { SINGLE_AD_MIN_SPEND_FOR_KILL, ADSET_ZERO_LEAD_KILL_SPEND } from "./thresholds";

export type AnalyzerVerdict = "KILL" | "SUSPECT" | "WINNER" | "INSUFFICIENT_DATA";

export interface AdClassificationInput {
  spend: number;
  leads: number;
  /** null when leads = 0 */
  cpl: number | null;
  maxCpl: number;
}

export interface AdClassificationResult {
  verdict: AnalyzerVerdict;
  reason: string;
  recommendedAction: string;
}

/**
 * Pure, deterministic (no AI, no I/O) implementation of the SOP's per-ad
 * classification:
 *
 *   KILL (single ad):   spend >= SINGLE_AD_MIN_SPEND_FOR_KILL AND cpl > 2*maxCpl
 *   SUSPECT:             maxCpl < cpl <= 2*maxCpl  -> continue one more week only
 *   WINNER:               cpl <= maxCpl
 *
 * Whole-ad-set zero-lead kills are handled separately by
 * classifyAdSetZeroLeads, since that verdict applies to every ad in the set
 * regardless of its individual numbers.
 */
export function classifyAd(input: AdClassificationInput): AdClassificationResult {
  const { spend, leads, cpl, maxCpl } = input;

  if (leads === 0 || cpl === null) {
    if (spend >= SINGLE_AD_MIN_SPEND_FOR_KILL) {
      return {
        verdict: "KILL",
        reason: `0 לידים אחרי ₪${spend} spend (סף: ₪${SINGLE_AD_MIN_SPEND_FOR_KILL})`,
        recommendedAction: "להעביר לתור הריגה",
      };
    }
    return {
      verdict: "INSUFFICIENT_DATA",
      reason: `0 לידים, spend ₪${spend} עדיין מתחת לסף ₪${SINGLE_AD_MIN_SPEND_FOR_KILL}`,
      recommendedAction: "להמתין לעוד נתונים לפני קביעה",
    };
  }

  if (spend >= SINGLE_AD_MIN_SPEND_FOR_KILL && cpl > 2 * maxCpl) {
    return {
      verdict: "KILL",
      reason: `CPL ₪${cpl.toFixed(2)} > פי 2 מ-max_CPL (₪${maxCpl.toFixed(2)}) אחרי ₪${spend} spend`,
      recommendedAction: "להעביר לתור הריגה",
    };
  }

  if (cpl > maxCpl && cpl <= 2 * maxCpl) {
    return {
      verdict: "SUSPECT",
      reason: `CPL ₪${cpl.toFixed(2)} בין max_CPL (₪${maxCpl.toFixed(2)}) לפי 2 ממנו`,
      recommendedAction: "להמשיך שבוע נוסף בלבד ואז להעריך מחדש",
    };
  }

  if (cpl <= maxCpl) {
    return {
      verdict: "WINNER",
      reason: `CPL ₪${cpl.toFixed(2)} <= max_CPL (₪${maxCpl.toFixed(2)})`,
      recommendedAction: "לשקול הגדלת תקציב / שכפול",
    };
  }

  // cpl > 2*maxCpl but spend hasn't reached the kill threshold yet
  return {
    verdict: "INSUFFICIENT_DATA",
    reason: `CPL ₪${cpl.toFixed(2)} גבוה אך spend ₪${spend} מתחת לסף ה-KILL (₪${SINGLE_AD_MIN_SPEND_FOR_KILL})`,
    recommendedAction: "להמתין לעוד spend לפני קביעה",
  };
}

export interface AdSetAggregate {
  totalSpend: number;
  totalLeads: number;
}

/** KILL (whole ad set): leads == 0 AND spend >= ADSET_ZERO_LEAD_KILL_SPEND */
export function classifyAdSetZeroLeads(input: AdSetAggregate): AdClassificationResult | null {
  if (input.totalLeads === 0 && input.totalSpend >= ADSET_ZERO_LEAD_KILL_SPEND) {
    return {
      verdict: "KILL",
      reason: `סט מודעות שלם עם 0 לידים אחרי ₪${input.totalSpend} spend (סף: ₪${ADSET_ZERO_LEAD_KILL_SPEND})`,
      recommendedAction: "להעביר את כל המודעות בסט לתור הריגה",
    };
  }
  return null;
}
