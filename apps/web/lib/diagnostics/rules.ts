/**
 * The diagnostic ruleset: what "broken" means at each gate of the funnel.
 *
 * Deliberately free of Supabase, `server-only` and React so the whole thing
 * is unit-testable in isolation — same split as lib/metrics/campaign-stats.ts.
 * The DB read lives in ./fetch.ts, the evaluation in ./engine.ts.
 */

/** The lever an operator should pull, not the symptom they should stare at. */
export type RecommendedAction = "creative" | "copy" | "targeting" | "landing_page" | "new_variations" | "offer_or_pricing";

export type RuleId =
  | "high_frequency_fatigue"
  | "low_hook_rate"
  | "low_cpm_efficiency"
  | "low_hold_rate"
  | "low_ctr"
  | "high_cpc_good_ctr"
  | "low_lp_conversion"
  | "good_funnel_bad_roas";

/**
 * Where in the funnel a rule sits. `cross` rules are not gates — they can
 * fire at any depth and are always evaluated, because "the creative burned
 * out" explains a decline that no single gate does.
 */
export type Stage = 1 | 2 | 3 | 4 | "cross";

export type DiagnosticRule = {
  id: RuleId;
  stage: Stage;
  labelHe: string;
  /** Human-readable formula, shown in the UI so a number is never unexplained. */
  formulaHe: string;
  diagnosisHe: string;
  recommendedAction: RecommendedAction;
  actionDetailHe: string;
  /**
   * Funnel order. The lowest priority that fired is the primary bottleneck:
   * the earliest thing that is broken, because fixing a later gate while an
   * earlier one leaks is wasted work. Fatigue is 0 — it invalidates every
   * reading below it, so it outranks the funnel itself.
   */
  priority: number;
  /** Which threshold key this rule reads, if any. `good_funnel_bad_roas` compares against the campaign's own target CPA instead. */
  thresholdKey: ThresholdKey | null;
  /** True when the metric FAILING means "above the threshold" rather than "below" it. */
  higherIsWorse: boolean;
};

export type ThresholdKey =
  | "hook_rate"
  | "hold_rate"
  | "ctr_link_click"
  | "cpc_account_multiple"
  | "landing_page_conversion_rate"
  | "frequency"
  | "cpm_account_multiple";

export type Thresholds = Record<ThresholdKey, number> & {
  /** Below any of these a campaign is `insufficient_data`, not `healthy` — see engine.ts. */
  min_impressions: number;
  min_spend: number;
  min_days_active: number;
};

/**
 * Spec defaults. A B2B lead-gen campaign and an e-commerce campaign fail at
 * genuinely different numbers, so every one of these is overridable per
 * client (table `diagnostic_thresholds`) — these are only the starting point.
 */
export const DEFAULT_THRESHOLDS: Thresholds = {
  hook_rate: 0.2,
  hold_rate: 0.3,
  ctr_link_click: 0.01,
  cpc_account_multiple: 1.5,
  landing_page_conversion_rate: 0.1,
  frequency: 3.5,
  cpm_account_multiple: 1.4,
  min_impressions: 1000,
  min_spend: 50,
  min_days_active: 3,
};

export const RULES: DiagnosticRule[] = [
  {
    id: "high_frequency_fatigue",
    stage: "cross",
    labelHe: "עייפות קריאייטיב (Ad Fatigue)",
    formulaHe: "תדירות = חשיפות ÷ הגעה",
    diagnosisHe: "אותו קהל רואה את המודעה יותר מדי פעמים. הביצועים יורדים כי הקריאייטיב נשרף, לא כי הוא חלש מטבעו.",
    recommendedAction: "new_variations",
    actionDetailHe:
      "הכניסו וריאציה חדשה (לא לשנות את הקיימת) — קופי חדש או קריאייטיב חדש, הרחיבו קהל, ושקלו להגדיר מחדש Campaign Budget Optimization.",
    priority: 0,
    thresholdKey: "frequency",
    higherIsWorse: true,
  },
  {
    id: "low_hook_rate",
    stage: 1,
    labelHe: "לא עוצרים על המודעה (Hook חלש)",
    formulaHe: "Hook Rate = צפיות 3 שניות ÷ חשיפות",
    diagnosisHe: "הקריאייטיב לא עוצר גלילה. הבעיה בשנייה הראשונה־שנייה, לא בקופי.",
    recommendedAction: "creative",
    actionDetailHe:
      "שנו פריים פתיחה, הוסיפו תנועה בשניות הראשונות, נוכחות של בן אדם/פנים, וטקסט חזק על המסך ב־2 השניות הראשונות.",
    priority: 1,
    thresholdKey: "hook_rate",
    higherIsWorse: false,
  },
  {
    id: "low_cpm_efficiency",
    stage: "cross",
    labelHe: "CPM גבוה מהרגיל בחשבון",
    formulaHe: "CPM = הוצאה ÷ חשיפות × 1000",
    diagnosisHe: "Quality/Relevance Ranking נמוך — המערכת «לא אוהבת» את המודעה יחסית לתחרות, ולכן גובה עליה יותר.",
    recommendedAction: "creative",
    actionDetailHe: "לרוב פתרון קריאייטיבי. לפעמים טירגוט צר מדי שמייצר תחרות פנימית בין הקבוצות שלכם.",
    priority: 1.5,
    thresholdKey: "cpm_account_multiple",
    higherIsWorse: true,
  },
  {
    id: "low_hold_rate",
    stage: 1,
    labelHe: "עוצרים אבל לא נשארים (Hold חלש)",
    formulaHe: "Hold Rate = צפיות 50% ÷ צפיות 3 שניות",
    diagnosisHe: "ה־Hook עובד אבל הסיפור או הקצב לא מחזיקים. יש פער בין ההבטחה בהתחלה לבין התוכן.",
    recommendedAction: "creative",
    actionDetailHe: "קצרו את האורך, חדדו את הקצב, וודאו שההבטחה מהשניות הראשונות ממשיכה להתפתח ולא נעצרת.",
    priority: 2,
    thresholdKey: "hold_rate",
    higherIsWorse: false,
  },
  {
    id: "low_ctr",
    stage: 2,
    labelHe: "עוצרים אבל לא לוחצים (CTR חלש)",
    formulaHe: "CTR = קליקים על לינק ÷ חשיפות",
    diagnosisHe: "הקריאייטיב תפס תשומת לב אבל הקופי או ה־CTA לא משכנעים ללחוץ.",
    recommendedAction: "copy",
    actionDetailHe: "בדקו את הכותרת, את ההבטחה בטקסט, את בהירות ה־CTA, ואת ההתאמה של הקופי לכאב הספציפי של הקהל.",
    priority: 3,
    thresholdKey: "ctr_link_click",
    higherIsWorse: false,
  },
  {
    id: "high_cpc_good_ctr",
    stage: 2,
    labelHe: "CTR תקין אבל CPC גבוה",
    formulaHe: "CPC = הוצאה ÷ קליקים על לינק",
    diagnosisHe: "התחרות על הקהל הזה גבוהה, או שהטירגוט רחב/צר מדי. זו לא בעיית קריאייטיב ולא בעיית קופי.",
    recommendedAction: "targeting",
    actionDetailHe: "בדקו Audience Overlap, הרחיבו או צמצמו את הקהל, ובדקו Placement Breakdown.",
    priority: 4,
    thresholdKey: "cpc_account_multiple",
    higherIsWorse: true,
  },
  {
    id: "low_lp_conversion",
    stage: 3,
    labelHe: "מגיעים לעמוד אבל לא ממירים",
    formulaHe: "המרה בעמוד = המרות ÷ קליקים על לינק",
    diagnosisHe:
      "הבעיה לא במודעה בכלל — הקליק קורה, אבל העמוד לא סוגר. או פער בין ההבטחה במודעה למה שהעמוד נותן, או עמוד איטי/לא ברור.",
    recommendedAction: "landing_page",
    actionDetailHe:
      "בדקו זמן טעינה, התאמת מסר בין המודעה לעמוד (message match), טופס ארוך מדי, וחוסר אמון (עדויות והוכחה חברתית).",
    priority: 5,
    thresholdKey: "landing_page_conversion_rate",
    higherIsWorse: false,
  },
  {
    id: "good_funnel_bad_roas",
    stage: 4,
    labelHe: "כל המשפך תקין אבל ה־CPA לא משתלם",
    formulaHe: "CPA = הוצאה ÷ המרות",
    diagnosisHe: "הבעיה כלכלית, לא תפעולית — עלות הרכישה גבוהה מהמחיר שהעסק יכול לשלם. המודעה עצמה עובדת כמו שצריך.",
    recommendedAction: "offer_or_pricing",
    actionDetailHe: "אל תיגעו במודעה. בדקו AOV, אפסייל, את מחיר ההצעה — או קבלו שה־CAC הזה תקין ביחס ל־LTV של הלקוח.",
    priority: 6,
    thresholdKey: null,
    higherIsWorse: true,
  },
];

export const RULES_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));

/** Ordered by funnel position, which is also the order the UI lists them in. */
export const RULES_IN_PRIORITY_ORDER = [...RULES].sort((a, b) => a.priority - b.priority);

export const ACTION_LABELS_HE: Record<RecommendedAction, string> = {
  creative: "קריאייטיב",
  copy: "קופי",
  targeting: "טירגוט",
  landing_page: "עמוד נחיתה",
  new_variations: "וריאציות חדשות",
  offer_or_pricing: "הצעה / תמחור",
};

export const THRESHOLD_LABELS_HE: Record<ThresholdKey | "min_impressions" | "min_spend" | "min_days_active", string> = {
  hook_rate: "Hook Rate מינימלי",
  hold_rate: "Hold Rate מינימלי",
  ctr_link_click: "CTR מינימלי",
  cpc_account_multiple: "CPC מקסימלי (× ממוצע החשבון)",
  landing_page_conversion_rate: "המרה בעמוד נחיתה מינימלית",
  frequency: "תדירות מקסימלית",
  cpm_account_multiple: "CPM מקסימלי (× ממוצע החשבון)",
  min_impressions: "מינימום חשיפות לאבחון",
  min_spend: "מינימום הוצאה לאבחון",
  min_days_active: "מינימום ימי פעילות לאבחון",
};

/** Which threshold keys are ratios shown as percentages, vs. plain multipliers/counts. */
export const PERCENT_THRESHOLDS: ThresholdKey[] = ["hook_rate", "hold_rate", "ctr_link_click", "landing_page_conversion_rate"];
