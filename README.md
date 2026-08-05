# LiorEdits — דשבורד ניהול לקוחות

Next.js 14 (App Router, TypeScript) + Supabase (Postgres, local dev) monorepo.
כל 7 השלבים מהספק בנויים: פרופיל לקוח + missions, campaign connector + מנתח
מודעות דטרמיניסטי, CRM אוטומטי + לולאת CPL, SOP gates, MCP server, WhatsApp
automation builder, ו-AI Insights panel.

## מבנה

```
apps/web/            Next.js app (כל ה-UI, server actions, API routes)
apps/mcp-server/      שרת MCP לחיבור Claude Code (ראה apps/mcp-server/README.md)
packages/shared/      טיפוסים משותפים (domain types + Database type ל-supabase-js)
supabase/             migrations + seed.sql
```

## הרצה מקומית — צעד ראשון (עדיין לא בוצע במכונה הזו)

Docker ו-Supabase CLI **לא מותקנים** כרגע. כדי להריץ בפועל:

```bash
brew install --cask docker
brew install supabase/tap/supabase
```

פתח את Docker Desktop פעם אחת (כדי שה-daemon יעלה), ואז:

```bash
supabase start
```

זה ידפיס `API URL`, `anon key` ו-`service_role key`. העתק אותם ל-`.env.local`
(העתק קודם מ-`.env.example`):

```bash
cp .env.example apps/web/.env.local
```

עדכן שם את `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` לפי הפלט של `supabase start`.

`SESSION_SECRET` (חתימת עוגיות ההתחברות של פורטל הלקוחות) מגיע ריק בכוונה —
חובה לייצר ערך אקראי חדש לפני כל העלאה לפרודקשן, עם `openssl rand -hex 32`.

## הרצת האפליקציה

```bash
npm install
npm run dev
```

פתח http://localhost:3000 — יש נתוני דמו (`supabase/seed.sql`, נטען אוטומטית
ע"י `supabase db reset`) עם 3 לקוחות לדוגמה שממחישים WINNER/SUSPECT/KILL
במנתח המודעות.

## בדיקות

```bash
npm run typecheck   # כל ה-workspaces
npm run test         # יחידה על lib/analyzer/classify-ad.ts
npm run build --workspace=apps/web
```

## מה "חי" ומה "בנוי אך לא ניתן לאימות בלי credentials"

כברירת מחדל `META_USE_MOCK=true` ו-`GREEN_API_USE_MOCK=true` — כל הזרימה
עובדת מקצה לקצה עם נתונים מדומים. כדי לחבר בפועל:

- **Meta Ads**: הגדר `META_USE_MOCK=false`, הדבק Meta System User Token בעמוד
  `/settings`, ולאחר מכן קבע Ad Account ID לכל לקוח בעמוד העריכה שלו
- **Green API (WhatsApp)**: `GREEN_API_TOKEN` / `GREEN_API_USE_MOCK=false`
- **Telegram alerts**: `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`
- **AI Insights**: `ANTHROPIC_API_KEY`

## Cron

הראוטים ב-`/api/cron/*` מוגנים בסוד משותף (header `x-cron-secret`, ערכו
מוגדר ב-`CRON_SECRET`). יש לתזמן אותם חיצונית (n8n / Make / Vercel Cron):

- `POST /api/cron/daily-ad-sync` — יומי
- `POST /api/cron/monthly-cpl-recalc` — חודשי
- `POST /api/cron/alerts-check` — כל כמה שעות
- `POST /api/cron/whatsapp-automation-tick` — כל כמה דקות

## MCP Server

ראה [apps/mcp-server/README.md](apps/mcp-server/README.md).

## Auth

עדיין לא הוטמע בסבב הזה (בכוונה — ראה `apps/web/lib/auth/get-current-actor.ts`
לנקודת ההרחבה). אין להעלות לפרודקשן לפני שמוסיפים שכבת Auth.
