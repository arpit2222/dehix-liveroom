interface Props {
  isOnline: boolean;
  className?: string;
}

export function OnlineIndicator({ isOnline, className = "" }: Props) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${className} ${isOnline ? "bg-green-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-gray-600"}`}>
      {isOnline && (
        <span className="absolute inline-block w-2 h-2 rounded-full bg-green-400 animate-ping opacity-75" />
      )}
    </span>
  );
}
