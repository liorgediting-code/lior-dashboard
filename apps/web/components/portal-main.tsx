"use client";

import { usePathname } from "next/navigation";

/**
 * The portal's content frame. Every tab reads best in a narrow column except
 * the CRM, which is a spreadsheet-style grid (think Airtable): it gets the
 * whole window width, so wide column layouts are not squeezed into a box.
 */
export function PortalMain({ children }: { children: React.ReactNode }) {
  const isCrm = /^\/client\/[^/]+\/crm\/?$/.test(usePathname() ?? "");

  return <main className={`mx-auto animate-in ${isCrm ? "w-full max-w-none px-4 py-4" : "max-w-5xl p-6"}`}>{children}</main>;
}
