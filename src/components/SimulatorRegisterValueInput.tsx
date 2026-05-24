import { useEffect, useState } from "react";

export function SimulatorRegisterValueInput({
  value,
  disabled = false,
  compact = false,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  compact?: boolean;
  onCommit: (nextValue: string) => Promise<boolean> | boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  async function commit() {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const ok = await onCommit(draft);
      if (!ok) {
        setDraft(value);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`simulator-value-input ${compact ? "compact" : ""}`}>
      <input
        value={draft}
        disabled={disabled || busy}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          void commit();
        }}
        onBlur={() => {
          if (draft === value) return;
          void commit();
        }}
      />
      <button type="button" className="mini-button" disabled={disabled || busy} onClick={() => void commit()}>
        写入
      </button>
    </div>
  );
}
