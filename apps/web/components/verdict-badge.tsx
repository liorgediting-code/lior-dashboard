const classByVerdict: Record<string, string> = {
  WINNER: "badge-winner",
  SUSPECT: "badge-suspect",
  KILL: "badge-kill",
  INSUFFICIENT_DATA: "badge-insufficient",
};

const labelByVerdict: Record<string, string> = {
  WINNER: "WINNER",
  SUSPECT: "SUSPECT",
  KILL: "KILL",
  INSUFFICIENT_DATA: "נתונים לא מספיקים",
};

export function VerdictBadge({ verdict }: { verdict: string }) {
  return <span className={`badge ${classByVerdict[verdict] ?? "badge-insufficient"}`}>{labelByVerdict[verdict] ?? verdict}</span>;
}
