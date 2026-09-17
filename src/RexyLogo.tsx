/** Two nested traces form an R; the outgoing diagonal echoes an event ribbon. */
export default function RexyLogo({ className = 'logo', size = 28 }: {
  className?: string;
  size?: number;
}) {
  return <span className={className}>
    <svg className="rexy-mark" width={size} height={size} viewBox="0 0 36 36"
         fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
         strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M6 30V6h13l9 9-9 9H6" />
      <path d="M10 30V10h7l5 5-5 5h-7M17 24l6 6" />
      <path className="rexy-mark-accent" d="m23 20 8 10" />
    </svg>
    <span>Rexy</span>
  </span>;
}
