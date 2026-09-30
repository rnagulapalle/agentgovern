export function LoopMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="m16 3 11 6.5v13L16 29 5 22.5v-13L16 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m5 9.5 11 6.4 11-6.4M16 15.9v13"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M10.5 6.2 21.5 12.7v6.5L16 22.5l-5.5-3.3v-6.5l11-6.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="15.9" r="2.15" fill="currentColor" />
    </svg>
  );
}
