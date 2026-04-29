// Form primitives that render the Tresses design system. Each one is a thin
// wrapper around `.ss-*` classes — pages don't need to know the class names,
// they just compose <Field>/<Input>/<Button>/<Card>.

interface FieldProps {
  label: string;
  name: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

export function Field({ label, name, hint, error, children }: FieldProps) {
  return (
    <div className="ss-field">
      <label htmlFor={name}>{label}</label>
      {children}
      {hint && !error && <p className="ss-field-hint">{hint}</p>}
      {error && <p className="ss-field-error">{error}</p>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  // Inputs/selects/textareas inherit shape from .ss-field input/select/textarea
  // — the className escape hatch is rarely needed. Keep it forwarded for the
  // few places that want a width override.
  return <input {...props} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return <textarea {...props} />;
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement>,
) {
  return <select {...props} />;
}

export function Checkbox({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="ss-checkbox">
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary";
  },
) {
  const { variant = "primary", className, ...rest } = props;
  const palette =
    variant === "primary" ? "ss-btn ss-btn-primary" : "ss-btn ss-btn-ghost";
  return (
    <button
      {...rest}
      className={`${palette}${className ? " " + className : ""}`}
    />
  );
}

export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <div className="ss-form-error">{message}</div>;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  action,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="ss-page-head-row">
      <header className="ss-page-head">
        {eyebrow && <div className="ss-page-eyebrow">{eyebrow}</div>}
        <h2 className="ss-page-title">{title}</h2>
        {description && <p className="ss-page-sub">{description}</p>}
      </header>
      {action && <div className="ss-page-head-action">{action}</div>}
    </div>
  );
}

export function Card({
  children,
  className,
  title,
  meta,
  noPadding,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  meta?: string;
  // Some lists want a flush card (e.g. tables) — toggle this and the inner
  // padding goes away.
  noPadding?: boolean;
}) {
  return (
    <div
      className={`ss-card${noPadding ? " is-flush" : ""}${className ? " " + className : ""}`}
    >
      {(title || meta) && (
        <div className="ss-card-head">
          {title && <h3 className="ss-card-title">{title}</h3>}
          {meta && <span className="ss-card-meta">{meta}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
