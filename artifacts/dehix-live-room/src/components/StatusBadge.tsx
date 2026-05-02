interface Props {
  status: "verified" | "disputed" | "revoked";
  className?: string;
}

const STATUS_CONFIG = {
  verified: { label: "Verified", className: "bg-emerald-950/60 text-emerald-400 border-emerald-800/50" },
  disputed: { label: "Disputed", className: "bg-amber-950/60 text-amber-400 border-amber-800/50" },
  revoked: { label: "Revoked", className: "bg-red-950/60 text-red-400 border-red-800/50" },
};

export function StatusBadge({ status, className = "" }: Props) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.verified;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${cfg.className} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {cfg.label}
    </span>
  );
}
