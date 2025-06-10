import type { ContentCaption } from "subsrt-ts/dist/types/handler.js";
import { SourceLanguageCode, TargetLanguageCode } from "deepl-node";

export const COLORS = {
  WARN: "\x1b[33m%s\x1b[0m", // Yellow
  ERROR: "\x1b[31m%s\x1b[0m", // Red
};

export const logger = {
  // deno-lint-ignore no-explicit-any
  info: (...args: any[]) => console.log(...args),
  // deno-lint-ignore no-explicit-any
  warn: (...args: any[]) => console.warn(COLORS.WARN, ...args),
  // deno-lint-ignore no-explicit-any
  error: (...args: any[]) => console.error(COLORS.ERROR, ...args),
};

export type TranslatorCode = "DEEPL" | "LIBRE" | "LUNA";

export interface TLCaption extends ContentCaption {
  source?: "cache" | "translated" | "untranslated";
  translator: TranslatorCode;
  modified: boolean;
  detectedSourceLang?: SourceLanguageCode;
}

export type TLResult = {
  text: string;
  translator: TranslatorCode;
  detectedSourceLang?: SourceLanguageCode;
};

export interface Translator {
  readonly code: TranslatorCode;
  sourceLang?: string | SourceLanguageCode;
  targetLang?: string | TargetLanguageCode;

  init(): Promise<void>;
  translate(lines: string[]): Promise<TLResult[]>;
}
