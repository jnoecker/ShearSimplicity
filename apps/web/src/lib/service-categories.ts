// Map a service category name (free-text, set by the salon) to one of the
// fixed visual "kinds" the calendar uses for color coding. Keep this on the
// web side until/unless we promote `kind` to a real schema field — the salon
// can rename a category and the matcher still finds the right bucket.

export type CategoryKind =
  | "color"
  | "cut"
  | "styling"
  | "treat"
  | "bridal"
  | "block";

interface Pattern {
  kind: CategoryKind;
  match: RegExp;
}

const PATTERNS: ReadonlyArray<Pattern> = [
  { kind: "color", match: /color|balayage|highlight|gloss|tint/i },
  { kind: "cut", match: /cut|trim|barber|shave|beard/i },
  { kind: "styling", match: /style|blowout|blow.?dry|braid|updo (?!bridal)/i },
  { kind: "treat", match: /toner|treat|olaplex|condition|mask|keratin/i },
  { kind: "bridal", match: /bridal|wedding|special/i },
];

export function categoryKind(input: {
  categoryName?: string | null;
  serviceName?: string | null;
}): CategoryKind {
  // Category name wins when present — that's what the salon tagged the
  // service as. Fall back to the service name itself, since salons don't
  // always categorize.
  for (const source of [input.categoryName, input.serviceName]) {
    if (!source) continue;
    for (const p of PATTERNS) {
      if (p.match.test(source)) return p.kind;
    }
  }
  // No match: treat as a generic cut so it still picks up a real color
  // rather than the "blocked" hatched style.
  return "cut";
}
