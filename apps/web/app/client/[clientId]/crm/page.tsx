// Client-facing shell — route stub only. Waiting on the Auth extension
// point (lib/auth/get-current-actor.ts) before this can safely show a
// specific client's data without a login/password layer in front of it.
export default function ClientFacingCrmStub() {
  return (
    <div className="mx-auto max-w-md pt-20 text-center text-slate-600">
      <p>אזור הלקוח נמצא בבנייה — ימתין לשכבת ה-Auth (סיסמה ייעודית ללקוח) לפני שייפתח.</p>
    </div>
  );
}
