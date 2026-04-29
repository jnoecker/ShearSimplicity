"use client";

// global-error.tsx replaces the Next.js fallback 500 page entirely. Defining
// it (with its own <html> + <body>) keeps the build from auto-generating the
// pages-router /500 stub, which trips a known Next 15.5 bug where the stub
// imports next/document.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
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
        <h1 style={{ fontSize: 22, margin: 0 }}>Something went wrong</h1>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #0892a8",
            background: "white",
            color: "#0892a8",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
