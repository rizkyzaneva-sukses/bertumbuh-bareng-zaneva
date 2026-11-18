"use client";
import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";
const ORDER: Mode[] = ["system", "light", "dark"];
const ICON: Record<Mode, string> = { system: "🖥️", light: "☀️", dark: "🌙" };
const LABEL: Record<Mode, string> = { system: "Ikuti sistem", light: "Mode terang", dark: "Mode gelap" };

export function applyTheme(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themeMode = mode;
  const meta = document.querySelector('meta[name="theme-color"][data-dyn]');
  if (meta) meta.setAttribute("content", dark ? "#1a1511" : "#fbf6ee");
}

export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    const saved = (localStorage.getItem("bbz-theme") as Mode) || "system";
    setMode(saved);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => (localStorage.getItem("bbz-theme") || "system") === "system" && applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const next = () => {
    const m = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(m);
    localStorage.setItem("bbz-theme", m);
    applyTheme(m);
  };
  return (
    <button className={withLabel ? "btn ghost" : "btn ghost theme-btn"} onClick={next} aria-label={`Tema: ${LABEL[mode]}. Klik untuk ganti.`} title={LABEL[mode]} data-testid="theme-toggle">
      <span aria-hidden>{ICON[mode]}</span>
      {withLabel && <span>{LABEL[mode]}</span>}
    </button>
  );
}
