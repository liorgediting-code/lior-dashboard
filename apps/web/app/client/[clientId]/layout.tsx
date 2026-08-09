export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-indigo-50/40">
      <div className="border-b border-indigo-100 bg-indigo-950 py-3 text-center text-sm font-medium text-indigo-100">
        הפורטל האישי שלך · LiorEdits
      </div>
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}
