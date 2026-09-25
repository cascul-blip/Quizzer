import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { DEFAULT_TIME_LIMIT, MAX_OPTIONS, MIN_OPTIONS, TF_OPTIONS, TIME_LIMITS, newId } from "../../shared/quiz-constants.ts";
import type { Question, Quiz, QuizSettings, QuizSummary } from "../../shared/quiz-schema.ts";
import { Shape, Toast, optionColor } from "../shared/ui.tsx";

// ---------- api ----------

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      message = (await res.json()).error ?? message;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

interface Info {
  version: string;
  dataDir: string;
  port: number;
  joinUrl: string;
  mcp: { httpUrl: string; stdioCommand: string[] };
}

function openHost(quizId?: string) {
  window.open(quizId ? `/host?quiz=${encodeURIComponent(quizId)}` : "/host", "quizzer-host");
}

// ---------- routing ----------

function useHashRoute(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

function App() {
  const hash = useHashRoute();
  const [toast, setToast] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    fetch("/api/info").then((r) => r.status === 403 && setForbidden(true));
  }, []);

  if (forbidden) {
    return (
      <div class="forbidden">
        <h1>Admin is only available on the host computer</h1>
        <p>
          Open <code>http://localhost:{location.port || 80}/admin</code> on the computer running Quizzer.
        </p>
      </div>
    );
  }

  const edit = hash.match(/^#\/edit\/(.+)$/);
  return (
    <>
      {edit ? <Editor id={decodeURIComponent(edit[1]!)} notify={setToast} /> : <Library notify={setToast} />}
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

// ---------- library ----------

function Library({ notify }: { notify: (m: string) => void }) {
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const load = () =>
    api<QuizSummary[]>("/api/quizzes")
      .then(setQuizzes)
      .catch((e) => notify(e.message));

  useEffect(() => {
    load();
    api<Info>("/api/info").then(setInfo, () => {});
    // Agents may edit quizzes via MCP while this page is open.
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  async function create() {
    const title = prompt("Quiz title:");
    if (!title?.trim()) return;
    try {
      const q = await api<Quiz>("/api/quizzes", jsonInit("POST", { title: title.trim() }));
      location.hash = `#/edit/${q.id}`;
    } catch (e) {
      notify((e as Error).message);
    }
  }

  async function importFile(file: File) {
    try {
      const data = JSON.parse(await file.text());
      const q = await api<Quiz>(
        "/api/quizzes",
        jsonInit("POST", { title: data.title, description: data.description, settings: data.settings, questions: data.questions }),
      );
      notify(`Imported "${q.title}"`);
      load();
    } catch (e) {
      notify(`Import failed: ${(e as Error).message}`);
    }
  }

  async function duplicate(id: string) {
    try {
      await api("/api/quizzes/" + encodeURIComponent(id) + "/duplicate", { method: "POST" });
      load();
    } catch (e) {
      notify((e as Error).message);
    }
  }

  async function remove(q: QuizSummary) {
    if (!confirm(`Delete "${q.title}"? This cannot be undone.`)) return;
    try {
      await api("/api/quizzes/" + encodeURIComponent(q.id), { method: "DELETE" });
      load();
    } catch (e) {
      notify((e as Error).message);
    }
  }

  return (
    <div class="page">
      <header class="page-head">
        <div>
          <h1 class="brand">Quizzer</h1>
          <p class="sub">Your quizzes. Host one to put it on the big screen.</p>
        </div>
        <div class="actions">
          <button class="btn" onClick={() => openHost()}>
            Open host screen
          </button>
          <button class="btn" onClick={() => importRef.current?.click()}>
            Import JSON
          </button>
          <button class="btn primary" onClick={create}>
            + New quiz
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void importFile(f);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </header>

      {quizzes === null ? (
        <p class="empty">Loading…</p>
      ) : quizzes.length === 0 ? (
        <div class="empty">
          <p>No quizzes yet.</p>
          <p>
            Create one with <b>+ New quiz</b>, import a JSON file, or ask an AI agent connected over MCP (see below).
          </p>
        </div>
      ) : (
        <ul class="quiz-grid">
          {quizzes.map((q) => (
            <li key={q.id} class={`quiz-card ${q.error ? "broken" : ""}`}>
              <div class="quiz-card-body">
                <h2>{q.title}</h2>
                {q.error ? (
                  <p class="error-text">Can't read this file: {q.error}</p>
                ) : (
                  <>
                    {q.description && <p class="desc">{q.description}</p>}
                    <p class="meta">
                      {q.questionCount} question{q.questionCount === 1 ? "" : "s"} · updated {new Date(q.updatedAt).toLocaleString()}
                    </p>
                  </>
                )}
              </div>
              <div class="quiz-card-actions">
                {!q.error && (
                  <>
                    <button class="btn primary" disabled={q.questionCount === 0} onClick={() => openHost(q.id)}>
                      ▶ Host
                    </button>
                    <a class="btn" href={`#/edit/${encodeURIComponent(q.id)}`}>
                      Edit
                    </a>
                    <button class="btn" onClick={() => duplicate(q.id)}>
                      Duplicate
                    </button>
                    <a class="btn" href={`/api/quizzes/${encodeURIComponent(q.id)}`} download={`${q.id}.json`}>
                      Export
                    </a>
                  </>
                )}
                <button class="btn danger" onClick={() => remove(q)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {info && <InfoPanel info={info} notify={notify} />}
    </div>
  );
}

function shellQuote(arg: string): string {
  return /^[\w@%+=:,./\\-]+$/.test(arg) ? arg : `"${arg.replace(/(["\\$`])/g, "\\$1")}"`;
}

function InfoPanel({ info, notify }: { info: Info; notify: (m: string) => void }) {
  const stdio = `claude mcp add quizzer -- ${info.mcp.stdioCommand.map(shellQuote).join(" ")}`;
  const http = `claude mcp add --transport http quizzer ${info.mcp.httpUrl}`;
  const [cmd, ...args] = info.mcp.stdioCommand;
  const desktop = JSON.stringify({ mcpServers: { quizzer: { command: cmd, args } } }, null, 2);
  const copy = (text: string) =>
    navigator.clipboard?.writeText(text).then(
      () => notify("Copied"),
      () => notify("Copy failed, select the text instead"),
    );
  return (
    <section class="info">
      <h2>Connect an AI agent (MCP)</h2>
      <p>
        Agents can list, create, edit and delete quizzes. Use the <b>stdio</b> command (works even when Quizzer isn't running) or the <b>HTTP</b>{" "}
        endpoint while it's running.
      </p>
      <Snippet label="Claude Code (stdio)" text={stdio} onCopy={copy} />
      <Snippet label="Claude Code (HTTP, while running)" text={http} onCopy={copy} />
      <Snippet label="Claude Desktop / other clients (JSON config)" text={desktop} onCopy={copy} />
      <p class="meta">
        Data folder: <code>{info.dataDir}</code> · Players join at <code>{info.joinUrl}</code> · v{info.version}
      </p>
    </section>
  );
}

function Snippet({ label, text, onCopy }: { label: string; text: string; onCopy: (t: string) => void }) {
  return (
    <div class="snippet">
      <div class="snippet-head">
        <span>{label}</span>
        <button class="btn tiny" onClick={() => onCopy(text)}>
          Copy
        </button>
      </div>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  );
}

// ---------- editor ----------

type Draft = { title: string; description: string; settings: QuizSettings; questions: Question[] };

const toDraft = (q: Quiz): Draft => ({ title: q.title, description: q.description, settings: q.settings, questions: q.questions });

function blankQuestion(type: Question["type"], taken: Set<string>): Question {
  let id: string;
  do id = "q" + newId(5);
  while (taken.has(id));
  return type === "true_false"
    ? { id, type, text: "", timeLimitSec: DEFAULT_TIME_LIMIT, options: [...TF_OPTIONS], correct: [0] }
    : { id, type, text: "", timeLimitSec: DEFAULT_TIME_LIMIT, options: ["", "", "", ""], correct: [] };
}

function questionIssues(q: Question): string[] {
  const issues: string[] = [];
  if (!q.text.trim()) issues.push("Question text is empty");
  if (q.options.some((o) => !o.trim())) issues.push("Fill in every answer option (or remove empty ones)");
  if (q.correct.length === 0) issues.push("Mark at least one correct answer");
  return issues;
}

function Editor({ id, notify }: { id: string; notify: (m: string) => void }) {
  const [saved, setSaved] = useState<Quiz | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api<Quiz>(`/api/quizzes/${encodeURIComponent(id)}`)
      .then((q) => {
        setSaved(q);
        setDraft(toDraft(q));
      })
      .catch((e) => setLoadError(e.message));
  }, [id]);

  const dirty = useMemo(() => !!saved && !!draft && JSON.stringify(toDraft(saved)) !== JSON.stringify(draft), [saved, draft]);
  const issueCount = draft ? draft.questions.reduce((n, q) => n + questionIssues(q).length, 0) + (draft.title.trim() ? 0 : 1) : 0;

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save(): Promise<boolean> {
    if (!draft) return false;
    setSaving(true);
    try {
      const q = await api<Quiz>(`/api/quizzes/${encodeURIComponent(id)}`, jsonInit("PUT", draft));
      setSaved(q);
      setDraft(toDraft(q));
      notify("Saved");
      return true;
    } catch (e) {
      notify(`Not saved: ${(e as Error).message}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (dirty && issueCount === 0) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (loadError) {
    return (
      <div class="page">
        <a href="#/">← All quizzes</a>
        <p class="error-text">{loadError}</p>
      </div>
    );
  }
  if (!draft) return <div class="page">Loading…</div>;

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setQ = (i: number, q: Question) => set({ questions: draft.questions.map((x, j) => (j === i ? q : x)) });
  const taken = new Set(draft.questions.map((q) => q.id));

  function move(i: number, delta: number) {
    const qs = [...draft!.questions];
    const j = i + delta;
    if (j < 0 || j >= qs.length) return;
    [qs[i], qs[j]] = [qs[j]!, qs[i]!];
    set({ questions: qs });
  }

  return (
    <div class="page editor">
      <header class="editor-bar">
        <a
          href="#/"
          onClick={(e) => {
            if (dirty && !confirm("Discard unsaved changes?")) e.preventDefault();
          }}
        >
          ← All quizzes
        </a>
        <div class="spacer" />
        <span class={`save-state ${dirty ? "dirty" : ""}`}>
          {issueCount > 0 ? `${issueCount} thing${issueCount === 1 ? "" : "s"} to fix` : dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <button
          class="btn"
          disabled={draft.questions.length === 0}
          onClick={async () => {
            if (dirty && !(issueCount === 0 && (await save()))) return notify("Save your changes before hosting");
            openHost(id);
          }}
        >
          ▶ Host
        </button>
        <button class="btn primary" disabled={!dirty || saving || issueCount > 0} onClick={save} title="Ctrl+S">
          {saving ? "Saving…" : "Save"}
        </button>
      </header>

      <section class="quiz-meta">
        <label class="field">
          <span>Title</span>
          <input class="title-input" value={draft.title} maxLength={120} onInput={(e) => set({ title: e.currentTarget.value })} />
        </label>
        <label class="field">
          <span>Description (optional)</span>
          <textarea rows={2} maxLength={1000} value={draft.description} onInput={(e) => set({ description: e.currentTarget.value })} />
        </label>
        <div class="toggles">
          <label>
            <input
              type="checkbox"
              checked={draft.settings.shuffleQuestions}
              onChange={(e) => set({ settings: { ...draft.settings, shuffleQuestions: e.currentTarget.checked } })}
            />
            Shuffle question order each game
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.settings.shuffleAnswers}
              onChange={(e) => set({ settings: { ...draft.settings, shuffleAnswers: e.currentTarget.checked } })}
            />
            Shuffle answer order each game
          </label>
        </div>
      </section>

      <ol class="questions">
        {draft.questions.map((q, i) => (
          <QuestionEditor
            key={q.id}
            q={q}
            index={i}
            count={draft.questions.length}
            onChange={(nq) => setQ(i, nq)}
            onMove={(d) => move(i, d)}
            onDuplicate={() => {
              const copy = { ...structuredClone(q), id: blankQuestion(q.type, taken).id };
              const qs = [...draft.questions];
              qs.splice(i + 1, 0, copy);
              set({ questions: qs });
            }}
            onDelete={() => {
              if (q.text.trim() && !confirm("Delete this question?")) return;
              set({ questions: draft.questions.filter((_, j) => j !== i) });
            }}
            notify={notify}
          />
        ))}
      </ol>

      <div class="add-row">
        <button class="btn" onClick={() => set({ questions: [...draft.questions, blankQuestion("multiple_choice", taken)] })}>
          + Multiple choice
        </button>
        <button class="btn" onClick={() => set({ questions: [...draft.questions, blankQuestion("true_false", taken)] })}>
          + True / False
        </button>
      </div>
    </div>
  );
}

function QuestionEditor(props: {
  q: Question;
  index: number;
  count: number;
  onChange: (q: Question) => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  notify: (m: string) => void;
}) {
  const { q, index, count, onChange, notify } = props;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const issues = questionIssues(q);
  const multi = q.correct.length > 1;

  function setType(type: Question["type"]) {
    if (type === q.type) return;
    if (type === "true_false") onChange({ ...q, type, options: [...TF_OPTIONS], correct: [0] });
    else onChange({ ...q, type, options: ["", "", "", ""], correct: [] });
  }

  function toggleCorrect(i: number) {
    if (q.type === "true_false") return onChange({ ...q, correct: [i] });
    const set = new Set(q.correct);
    if (set.has(i)) set.delete(i);
    else set.add(i);
    onChange({ ...q, correct: [...set].sort((a, b) => a - b) });
  }

  function removeOption(i: number) {
    const options = q.options.filter((_, j) => j !== i);
    const correct = q.correct.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c));
    onChange({ ...q, options, correct });
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const { ref } = await api<{ ref: string }>("/api/media", { method: "POST", headers: { "content-type": file.type }, body: file });
      onChange({ ...q, image: ref });
    } catch (e) {
      notify(`Image upload failed: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <li class="q-card">
      <div class="q-card-head">
        <span class="q-num">Q{index + 1}</span>
        <select value={q.type} onChange={(e) => setType(e.currentTarget.value as Question["type"])} aria-label="Question type">
          <option value="multiple_choice">Multiple choice</option>
          <option value="true_false">True / False</option>
        </select>
        <label class="inline">
          ⏱
          <select value={q.timeLimitSec} onChange={(e) => onChange({ ...q, timeLimitSec: Number(e.currentTarget.value) })} aria-label="Time limit">
            {[...new Set([...TIME_LIMITS, q.timeLimitSec])]
              .sort((a, b) => a - b)
              .map((t) => (
                <option key={t} value={t}>
                  {t} s
                </option>
              ))}
          </select>
        </label>
        <div class="spacer" />
        <button class="icon" title="Move up" aria-label="Move up" disabled={index === 0} onClick={() => props.onMove(-1)}>
          ↑
        </button>
        <button class="icon" title="Move down" aria-label="Move down" disabled={index === count - 1} onClick={() => props.onMove(1)}>
          ↓
        </button>
        <button class="icon" title="Duplicate" aria-label="Duplicate question" onClick={props.onDuplicate}>
          ⧉
        </button>
        <button class="icon danger" title="Delete" aria-label="Delete question" onClick={props.onDelete}>
          🗑
        </button>
      </div>

      <textarea
        class="q-text-input"
        rows={2}
        maxLength={300}
        placeholder="Type your question…"
        value={q.text}
        onInput={(e) => onChange({ ...q, text: e.currentTarget.value })}
      />

      <div class="image-row">
        {q.image ? (
          <div class="thumb">
            <img src={`/${q.image}`} alt="" />
            <button class="btn tiny" onClick={() => onChange({ ...q, image: undefined })}>
              Remove image
            </button>
          </div>
        ) : (
          <button class="btn tiny" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? "Uploading…" : "🖼 Add image"}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f) void upload(f);
            e.currentTarget.value = "";
          }}
        />
      </div>

      <div class="options">
        {q.options.map((opt, i) => {
          const c = optionColor(q.type, i);
          const isCorrect = q.correct.includes(i);
          return (
            <div key={i} class={`option opt-${c} ${isCorrect ? "correct" : ""}`}>
              <Shape index={c} />
              {q.type === "true_false" ? (
                <span class="tf-label">{opt}</span>
              ) : (
                <input
                  value={opt}
                  maxLength={120}
                  placeholder={`Answer ${i + 1}`}
                  onInput={(e) => onChange({ ...q, options: q.options.map((o, j) => (j === i ? e.currentTarget.value : o)) })}
                />
              )}
              <label class="correct-toggle" title={q.type === "true_false" ? "Correct answer" : "Counts as correct"}>
                <input
                  type={q.type === "true_false" ? "radio" : "checkbox"}
                  name={`correct-${q.id}`}
                  checked={isCorrect}
                  onChange={() => toggleCorrect(i)}
                />
                <span>✓</span>
              </label>
              {q.type === "multiple_choice" && q.options.length > MIN_OPTIONS && (
                <button class="opt-remove" title="Remove answer" aria-label={`Remove answer ${i + 1}`} onClick={() => removeOption(i)}>
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div class="q-foot">
        {q.type === "multiple_choice" && q.options.length < MAX_OPTIONS && (
          <button class="btn tiny" onClick={() => onChange({ ...q, options: [...q.options, ""] })}>
            + Add answer
          </button>
        )}
        {multi && <span class="note">{q.correct.length} correct answers: picking any of them counts.</span>}
        {issues.length > 0 && <span class="issues">⚠ {issues.join(" · ")}</span>}
      </div>
    </li>
  );
}

render(<App />, document.getElementById("app")!);
