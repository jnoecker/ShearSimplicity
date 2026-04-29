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
    <div className="ss-card ss-empty-card">
      <div className="ss-empty-inner">
        {phase && (
          <div className="ss-empty-tag">
            <PhaseTag phase={phase} />
          </div>
        )}
        <h2 className="ss-empty-title">{title}</h2>
        <p className="ss-empty-body">{body}</p>
      </div>
    </div>
  );
}
