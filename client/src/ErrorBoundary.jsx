import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, lastWindowError: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep a console trail even in production.
    // eslint-disable-next-line no-console
    console.error("App crash:", error, info);
  }

  componentDidMount() {
    this._onError = (ev) => {
      const msg = ev?.message || ev?.error?.message || "Window error";
      const stack = ev?.error?.stack || "";
      this.setState({ lastWindowError: { msg, stack } });
    };
    this._onRej = (ev) => {
      const r = ev?.reason;
      const msg = r?.message || String(r || "Unhandled rejection");
      const stack = r?.stack || "";
      this.setState({ lastWindowError: { msg, stack } });
    };
    window.addEventListener("error", this._onError);
    window.addEventListener("unhandledrejection", this._onRej);
  }

  componentWillUnmount() {
    window.removeEventListener("error", this._onError);
    window.removeEventListener("unhandledrejection", this._onRej);
  }

  render() {
    const { error, lastWindowError } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ padding: "2rem", maxWidth: 900, margin: "0 auto", color: "var(--text)" }}>
        <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
        <p style={{ color: "var(--muted)" }}>
          The app crashed while loading this page. Copy the error below and send it to support.
        </p>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            background: "var(--bg-soft)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "1rem",
            overflow: "auto",
          }}
        >
          {String(error?.message || error)}
          {error?.stack ? `\n\n${error.stack}` : ""}
          {lastWindowError ? `\n\nWindow: ${lastWindowError.msg}\n${lastWindowError.stack || ""}` : ""}
        </pre>
      </div>
    );
  }
}

