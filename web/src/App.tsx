import { ArrowRight, ChevronDown, ChevronRight, LogOut, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { api, message } from "./api/client";
import type { Form, Session } from "./api/types";
import { ErrorNotice } from "./components/Dialog";
import { BrandMark, FormIcon } from "./components/Icons";
import { CreateFormDialog } from "./features/schema/SchemaDesigner";
import { Workspace } from "./features/workspace/Workspace";
export default function App() {
  const [session, setSession] = useState<Session | null>();
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .session()
      .then(setSession)
      .catch((e) => {
        if (e.status !== 401) {
          setError(message(e));
        }
        setSession(null);
      });
    const unauthenticated = () => setSession(null);
    window.addEventListener("formsw:unauthorized", unauthenticated);
    return () => window.removeEventListener("formsw:unauthorized", unauthenticated);
  }, []);
  if (session === undefined) {
    return (
      <div className="boot-screen">
        <BrandMark />
        <span>
          Opening your workspace<span className="blink">_</span>
        </span>
      </div>
    );
  }
  if (!session) {
    return <Login initialError={error} onSignedIn={setSession} />;
  }
  return <AuthenticatedApp session={session} onSignedOut={() => setSession(null)} />;
}
function AuthenticatedApp({ session, onSignedOut }: { session: Session; onSignedOut: () => void }) {
  const [forms, setForms] = useState<Form[]>([]);
  const [selected, setSelected] = useState(() => localStorage.getItem("formsw:last-form") ?? "");
  const [creating, setCreating] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(() => {
    api
      .forms()
      .then((next) => {
        setForms(next);
        setSelected((old) => (next.some((f) => f.id === old) ? old : (next.find((f) => f.kind === "standard")?.id ?? next[0]?.id ?? "")));
        setError("");
      })
      .catch((e) => setError(message(e)));
  }, []);
  useEffect(refresh, [refresh]);
  function select(form: Form) {
    if (!window.dispatchEvent(new Event("formsw:before-navigate", { cancelable: true }))) {
      return;
    }
    setSelected(form.id);
    localStorage.setItem("formsw:last-form", form.id);
  }
  const standard = forms.filter((f) => f.kind === "standard");
  const options = forms.filter((f) => f.kind === "options");
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="FormSoftware home">
          <BrandMark />
          <span>
            FORM
            <br />
            SOFTWARE<span className="brand-dot">_</span>
          </span>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">P</span>
          <div>
            <strong>{session.workspace.name}</strong>
            <span>Your space. In order.</span>
          </div>
        </div>
        <div className="sidebar-section-heading">
          <span>FORMS</span>
          <button className="icon-button" aria-label="Create form" onClick={() => setCreating(true)}>
            <Plus size={15} />
          </button>
        </div>
        <nav className="form-navigation" aria-label="Forms">
          {standard.map((form) => (
            <button
              key={form.id}
              className={`nav-item ${form.id === selected ? "selected" : ""}`}
              aria-current={form.id === selected ? "page" : undefined}
              onClick={() => select(form)}
            >
              <FormIcon icon={form.icon} />
              <span>{form.name}</span>
              <span className="nav-count">{form.record_count}</span>
              {form.id === selected && <span className="nav-selection-mark" />}
            </button>
          ))}
        </nav>
        <button className="add-form-link" onClick={() => setCreating(true)}>
          <Plus size={14} />
          New form
        </button>
        <div className="sidebar-rule" />
        <button className="configuration-toggle" onClick={() => setOptionsOpen(!optionsOpen)} aria-expanded={optionsOpen}>
          {optionsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>CONFIGURATION</span>
          <span className="configuration-count">{options.length}</span>
        </button>
        {optionsOpen && (
          <nav className="form-navigation option-navigation" aria-label="Option lists">
            {options.map((form) => (
              <button key={form.id} className={`nav-item ${form.id === selected ? "selected" : ""}`} onClick={() => select(form)}>
                <FormIcon icon={form.icon} />
                <span>{form.name}</span>
                <span className="nav-count">{form.record_count}</span>
              </button>
            ))}
          </nav>
        )}
        <div className="sidebar-note">
          <span className="corner-mark">┌</span>
          <p>
            A little structure.
            <br />A lot of possibility.
          </p>
          <span className="note-index">[ PERSONAL EDITION ]</span>
          <span className="corner-mark bottom">┘</span>
        </div>
        <footer className="sidebar-user">
          <div className="user-avatar">{session.user.username.slice(0, 2).toUpperCase()}</div>
          <div className="user-details">
            <strong>{session.user.username}</strong>
            <span>Workspace owner</span>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={() => {
              if (!window.dispatchEvent(new Event("formsw:before-navigate", { cancelable: true }))) {
                return;
              }
              void api
                .logout()
                .then(onSignedOut)
                .catch((e) => setError(message(e)));
            }}
          >
            <LogOut size={15} />
          </button>
        </footer>
      </aside>
      {error && (
        <div className="app-error">
          <ErrorNotice>
            {error}
            <button className="text-button" onClick={refresh}>
              Retry
            </button>
          </ErrorNotice>
        </div>
      )}
      {selected ? (
        <Workspace
          key={selected}
          formId={selected}
          forms={forms}
          session={session}
          onFormsChanged={refresh}
          onNavigateForm={(id) => {
            const form = forms.find((f) => f.id === id);
            if (form) {
              if (form.kind === "options") {
                setOptionsOpen(true);
              }
              select(form);
            }
          }}
        />
      ) : (
        <main className="welcome-workspace">
          <span className="eyebrow">A CLEAN SLATE</span>
          <h1>Make space for your everyday.</h1>
          <p>Start with a form. Shape it around the things you want to remember.</p>
          <button className="button primary" onClick={() => setCreating(true)}>
            <Plus size={16} />
            Create your first form
          </button>
        </main>
      )}
      {creating && (
        <CreateFormDialog
          onClose={() => setCreating(false)}
          onCreated={(schema) => {
            setCreating(false);
            select(schema.form);
            refresh();
          }}
        />
      )}
    </div>
  );
}
function Login({ initialError, onSignedIn }: { initialError: string; onSignedIn: (session: Session) => void }) {
  const [username, setUsername] = useState("owner");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  async function login() {
    setBusy(true);
    setError("");
    try {
      onSignedIn(await api.login(username, password));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-brand">
        <BrandMark />
        <span>FORM SOFTWARE</span>
      </div>
      <main className="login-card">
        <p className="eyebrow">PERSONAL WORKSPACE / 001</p>
        <h1>
          Everything in
          <br />
          its own place<span>.</span>
        </h1>
        <p className="login-description">Your work. Your worlds. The details in between.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void login();
          }}
        >
          {error && <ErrorNotice>{error}</ErrorNotice>}
          <div className="field-group">
            <label htmlFor="username">Username</label>
            <input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="field-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
          </div>
          <button className="button primary login-submit" disabled={busy}>
            {busy ? "Opening workspace…" : "Enter workspace"}
            <ArrowRight size={16} />
          </button>
        </form>
        <div className="login-card-footer">
          <span>STRUCTURE FOR THE EVERYDAY.</span>
          <span>v0.4.1</span>
        </div>
      </main>
      <footer className="login-footer">
        FormSoftware <span>/</span> A considered place for your records.
      </footer>
    </div>
  );
}
