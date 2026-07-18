import React, { useEffect, useMemo, useState } from "react";

export interface EnumOption {
  value: string;
  label: string;
  keywords?: string;
}

export function exactEnumOption(options: EnumOption[], draft: string): EnumOption | undefined {
  const normalized = draft.trim().toLowerCase();
  return options.find((option) =>
    option.value.toLowerCase() === normalized || option.label.toLowerCase() === normalized);
}

function optionText(node: React.ReactNode): string {
  return React.Children.toArray(node).map((child) => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (React.isValidElement(child)) return optionText((child.props as { children?: React.ReactNode }).children);
    return "";
  }).join("");
}

export function EnumOmnibox({
  value,
  options,
  onChange,
  ariaLabel,
  title,
  disabled = false,
  style,
  inputStyle,
}: {
  value: string;
  options: EnumOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  title?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
}) {
  const selected = options.find((option) => option.value === value);
  const optionsKey = options.map((option) => `${option.value}\u0000${option.label}`).join("\u0001");
  const [draft, setDraft] = useState(selected?.label ?? value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(options.find((option) => option.value === value)?.label ?? value);
    setError("");
  }, [value, optionsKey]);

  const filtered = useMemo(() => {
    const query = draft.trim().toLowerCase();
    if (!query || selected?.label === draft) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(query)
      || option.value.toLowerCase().includes(query)
      || option.keywords?.toLowerCase().includes(query));
  }, [draft, options, selected?.label]);

  useEffect(() => setActive(0), [draft]);

  const pick = (option: EnumOption) => {
    setDraft(option.label);
    setError("");
    setOpen(false);
    if (option.value !== value) onChange(option.value);
  };

  const commit = () => {
    const exact = exactEnumOption(options, draft);
    if (exact) {
      pick(exact);
      return true;
    }
    setDraft(selected?.label ?? value);
    setError(`Unsupported value: ${draft.trim() || "empty"}`);
    setOpen(false);
    return false;
  };

  return (
    <div style={{ position: "relative", minWidth: 0, ...style }}>
      <input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-invalid={!!error}
        value={draft}
        title={title}
        disabled={disabled}
        readOnly={disabled}
        onFocus={() => !disabled && setOpen(true)}
        onChange={(event) => { setDraft(event.target.value); setError(""); setOpen(true); }}
        onBlur={() => window.setTimeout(() => { if (open) commit(); }, 120)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((index) => Math.min(filtered.length - 1, index + 1)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
          else if (event.key === "Enter") { event.preventDefault(); const option = filtered[active]; if (open && option) pick(option); else commit(); }
          else if (event.key === "Escape") { event.preventDefault(); setDraft(selected?.label ?? value); setError(""); setOpen(false); (event.currentTarget as HTMLInputElement).blur(); }
        }}
        style={{ width: "100%", minWidth: 0, boxSizing: "border-box", fontSize: 11, opacity: 1, ...(disabled ? { color: "#4a5568", background: "#edf2f7", cursor: "not-allowed" } : {}), ...inputStyle }}
      />
      {open && !disabled && (
        <div role="listbox" style={{ position: "absolute", zIndex: 40, left: 0, right: 0, top: "100%", maxHeight: 150, overflowY: "auto", border: "1px solid #4a5568", background: "#1f252c", boxShadow: "0 6px 18px rgba(0,0,0,0.35)" }}>
          {filtered.length ? filtered.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={index === active}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(option)}
              style={{ display: "block", width: "100%", border: 0, borderRadius: 0, padding: "5px 7px", textAlign: "left", fontSize: 10.5, color: "#edf2f7", background: index === active ? "#34404d" : "transparent", cursor: "pointer" }}
            >
              {option.label}
            </button>
          )) : <div style={{ padding: "5px 7px", fontSize: 10, color: "#fc8181" }}>No valid option</div>}
        </div>
      )}
      {error && <div role="alert" style={{ marginTop: 2, fontSize: 9, lineHeight: 1.2, color: "#fc8181" }}>{error}</div>}
    </div>
  );
}

export function SelectOmnibox({
  value,
  children,
  onChange,
  disabled,
  style,
  title,
  ...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value"> & { value: string | number }) {
  const options = React.Children.toArray(children).flatMap((child): EnumOption[] => {
    if (!React.isValidElement(child) || child.type !== "option") return [];
    const option = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
    const optionValue = String(option.value ?? option.children ?? "");
    const label = option.label ?? (optionText(option.children) || optionValue);
    return [{ value: optionValue, label }];
  });
  const current = String(value);
  if (!options.some((option) => option.value === current)) options.unshift({ value: current, label: current });
  const ariaLabel = props["aria-label"] ?? title ?? "Select option";
  return (
    <EnumOmnibox
      value={current}
      options={options}
      ariaLabel={ariaLabel}
      title={title}
      disabled={disabled}
      onChange={(next) => onChange?.({ target: { value: next }, currentTarget: { value: next } } as unknown as React.ChangeEvent<HTMLSelectElement>)}
      style={{ flex: style?.flex, width: style?.width, minWidth: style?.minWidth, marginLeft: style?.marginLeft }}
      inputStyle={style}
    />
  );
}
