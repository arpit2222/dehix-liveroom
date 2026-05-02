interface Props {
  score: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function ReputationRing({ score, size = 60, strokeWidth = 5, className = "" }: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(score / 1000, 0), 1);
  const dashOffset = circumference * (1 - progress);

  const color =
    score >= 800
      ? "#a78bfa"
      : score >= 500
      ? "#818cf8"
      : score >= 200
      ? "#6366f1"
      : "#4b5563";

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(262 25% 16%)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <span
        className="absolute text-center font-mono font-semibold"
        style={{ fontSize: size < 50 ? 9 : size < 70 ? 11 : 13, color }}
      >
        {score}
      </span>
    </div>
  );
}
