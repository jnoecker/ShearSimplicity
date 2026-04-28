import { PhaseTag } from "./phase-tag";

export function EmptyState({
  title,
  body,
  phase,
}: {
  title: string;
  body: string;
  phase?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm">
      <div className="mx-auto max-w-md text-center">
        {phase && (
          <div className="mb-3 flex justify-center">
            <PhaseTag phase={phase} />
          </div>
        )}
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">{body}</p>
      </div>
    </div>
  );
}
