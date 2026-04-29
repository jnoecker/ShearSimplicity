export function PhaseTag({ phase }: { phase: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
      {phase}
    </span>
  );
}
