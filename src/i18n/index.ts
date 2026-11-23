import { useApp } from "../lib/store";
import { ar } from "./ar";
import { de } from "./de";
import { en, type MessageKey, type Messages } from "./en";
import { es } from "./es";
import { fa } from "./fa";
import { fr } from "./fr";
import { pl } from "./pl";
import { ptBR } from "./pt-BR";
import { ru } from "./ru";
import { tr } from "./tr";
import { zhCN } from "./zh-CN";

export type Locale = "en" | "es" | "pt-BR" | "fr" | "de" | "ru" | "pl" | "tr" | "zh-CN" | "ar" | "fa";

/** Ordered as the language picker shows them; names are each language's own. */
export const LOCALES: ReadonlyArray<{ code: Locale; name: string; rtl: boolean }> = [
  { code: "en", name: "English", rtl: false },
  { code: "es", name: "Español", rtl: false },
  { code: "pt-BR", name: "Português (Brasil)", rtl: false },
  { code: "fr", name: "Français", rtl: false },
  { code: "de", name: "Deutsch", rtl: false },
  { code: "ru", name: "Русский", rtl: false },
  { code: "pl", name: "Polski", rtl: false },
  { code: "tr", name: "Türkçe", rtl: false },
  { code: "zh-CN", name: "简体中文", rtl: false },
  { code: "ar", name: "العربية", rtl: true },
  { code: "fa", name: "فارسی", rtl: true },
];

export const MESSAGES: Record<Locale, Messages> = { en, es, "pt-BR": ptBR, fr, de, ru, pl, tr, "zh-CN": zhCN, ar, fa };

export type Params = Record<string, string | number>;
export type T = (key: MessageKey, params?: Params) => string;

export function resolveLocale(value: string | null | undefined): Locale {
  return LOCALES.find((l) => l.code === value)?.code ?? "en";
}

export function isRtl(locale: Locale): boolean {
  return LOCALES.find((l) => l.code === locale)?.rtl ?? false;
}

/** BCP 47 tag for Intl, with Latin digits so dates match the HUD's numbers. */
export function intlTag(locale: Locale): string {
  return locale === "ar" || locale === "fa" ? `${locale}-u-nu-latn` : locale;
}

export function makeT(locale: Locale): T {
  const dict = MESSAGES[locale];
  return (key, params) => {
    const raw = dict[key] ?? en[key];
    const filled = params ? raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : raw;
    // Keep a number and its unit on one line.
    return filled.replace(/(\d) (ms|MB|s|GHz)(?=$|[\s.,;:)!?،؛])/g, "$1 $2");
  };
}

const cache = new Map<Locale, T>();
function tFor(locale: Locale): T {
  let t = cache.get(locale);
  if (!t) {
    t = makeT(locale);
    cache.set(locale, t);
  }
  return t;
}

export function useLocale(): Locale {
  return useApp((s) => resolveLocale(s.settings?.language));
}

export function useT(): T {
  return tFor(useLocale());
}

export type { MessageKey, Messages };
