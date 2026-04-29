import Link from "next/link";

// Explicit not-found page so Next doesn't fall back to its built-in /404
// prerender, which trips a known Html-import error under typedRoutes in
// Next 15.5.x.
export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 12,
        fontFamily: "system-ui, sans-serif",
        background: "#f3fbfd",
        color: "#0f2630",
      }}
    >
      <h1 style={{ fontSize: 22, margin: 0 }}>Page not found</h1>
      <Link href="/" style={{ color: "#0892a8" }}>
        Back to dashboard
      </Link>
    </div>
  );
}
