import { describeDeadline } from "@/lib/format";

const STATUS_CLASS: Record<ReturnType<typeof describeDeadline>["status"], string> = {
  rolling: "bg-slate-100 text-slate-700",
  open: "bg-emerald-100 text-emerald-800",
  "closing-soon": "bg-amber-100 text-amber-800",
  today: "bg-amber-200 text-amber-900",
  closed: "bg-rose-100 text-rose-800",
};

export function DeadlinePill({ deadline }: { deadline: string | null }) {
  const state = describeDeadline(deadline);
  return (
    <span
      className={`badge ${STATUS_CLASS[state.status]}`}
      title={deadline ? `Application deadline: ${deadline}` : "No fixed deadline"}
    >
      {state.label}
    </span>
  );
}
