import { Nav } from "@/components/nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <Nav />
      <main className="min-h-screen flex-1 p-6">{children}</main>
    </div>
  );
}
