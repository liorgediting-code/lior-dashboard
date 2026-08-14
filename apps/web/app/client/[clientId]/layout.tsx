export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="border-b border-blue-900/40 bg-gradient-to-r from-blue-950 via-blue-900 to-blue-950 py-3 text-center text-sm font-medium text-blue-100">
        הפורטל האישי שלך · LiorEdits
      </div>
      <main className="mx-auto max-w-5xl p-6 animate-in">{children}</main>
    </div>
  );
}
