import { createClientFromForm } from "@/lib/actions/clients";

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">לקוח חדש</h1>
      <form action={createClientFromForm} className="space-y-6">
        <div className="card space-y-4">
          <h2 className="font-semibold">פרטי לקוח</h2>
          <div>
            <label className="label" htmlFor="name">
              שם העסק
            </label>
            <input className="input" id="name" name="name" required />
          </div>
          <div>
            <label className="label" htmlFor="business_type">
              סוג עסק
            </label>
            <select className="input" id="business_type" name="business_type">
              <option value="local_service">שירות מקומי</option>
              <option value="ecommerce">איקומרס</option>
              <option value="coaching_consulting">קואצ׳ינג / ייעוץ</option>
              <option value="real_estate">נדל״ן</option>
              <option value="clinic_medical">מרפאה / רפואי</option>
              <option value="other">אחר</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="phone">
              טלפון ליצירת קשר
            </label>
            <input className="input" id="phone" name="phone" />
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold">נתוני SOP (למילוי בשיחת האסטרטגיה)</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="deal_price_avg">
                מחיר עסקה ממוצע (₪)
              </label>
              <input className="input" id="deal_price_avg" name="deal_price_avg" type="number" step="any" />
            </div>
            <div>
              <label className="label" htmlFor="close_rate_pct">
                אחוז סגירה (%)
              </label>
              <input className="input" id="close_rate_pct" name="close_rate_pct" type="number" step="any" />
            </div>
            <div>
              <label className="label" htmlFor="monthly_revenue">
                הכנסה חודשית (₪)
              </label>
              <input className="input" id="monthly_revenue" name="monthly_revenue" type="number" step="any" />
            </div>
            <div>
              <label className="label" htmlFor="deals_per_month">
                עסקאות בחודש
              </label>
              <input className="input" id="deals_per_month" name="deals_per_month" type="number" step="any" />
            </div>
            <div>
              <label className="label" htmlFor="price_range_low">
                טווח מחיר נמוך (₪)
              </label>
              <input className="input" id="price_range_low" name="price_range_low" type="number" step="any" />
            </div>
            <div>
              <label className="label" htmlFor="price_range_high">
                טווח מחיר גבוה (₪)
              </label>
              <input className="input" id="price_range_high" name="price_range_high" type="number" step="any" />
            </div>
            <div>
              <label className="label" htmlFor="profit_ratio">
                יחס רווחיות (ברירת מחדל 5)
              </label>
              <input className="input" id="profit_ratio" name="profit_ratio" type="number" step="any" defaultValue={5} />
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold">תמונת מצב לפני הליווי (Baseline)</h2>
          <p className="text-sm text-slate-500">
            נלכד פעם אחת עכשיו כדי שנוכל להראות ללקוח כמה הוא השתפר. עלות לעסקה תחושב אוטומטית מעלות ליד ואחוז סגירה.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="baseline_leads_per_month">
                לידים בחודש
              </label>
              <input className="input" id="baseline_leads_per_month" name="baseline_leads_per_month" type="number" step="any" />
            </div>
            <div>
              <label className="label" htmlFor="baseline_avg_cost_per_lead">
                עלות ליד ממוצעת (₪)
              </label>
              <input className="input" id="baseline_avg_cost_per_lead" name="baseline_avg_cost_per_lead" type="number" step="any" />
            </div>
            <div>
              <label className="label" htmlFor="baseline_revenue">
                הכנסה (₪)
              </label>
              <input className="input" id="baseline_revenue" name="baseline_revenue" type="number" step="any" />
            </div>
            <div>
              <label className="label" htmlFor="baseline_close_rate_pct">
                אחוז סגירה (%)
              </label>
              <input className="input" id="baseline_close_rate_pct" name="baseline_close_rate_pct" type="number" step="any" />
            </div>
            <div>
              <label className="label" htmlFor="baseline_product_price">
                מחיר המוצר (₪)
              </label>
              <input className="input" id="baseline_product_price" name="baseline_product_price" type="number" step="any" />
            </div>
          </div>
        </div>

        <button type="submit" className="btn btn-primary">
          צור לקוח
        </button>
      </form>
    </div>
  );
}
