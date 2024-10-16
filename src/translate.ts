import "@std/dotenv/load";
import * as fs from "@std/fs";
import * as path from "@std/path";
import * as deepl from "deepl-node";
import subsrt from "subsrt-ts";
import type { ContentCaption } from "subsrt-ts/dist/types/handler.js";

const RJ_PATH = Deno.env.get("RJ_PATH") ?? "./queue";
const BAK_PATH = Deno.env.get("BAK_PATH") ?? "./backup";
const OUT_PATH = Deno.env.get("OUT_PATH") ?? "./output";
const CACHE_PATH = Deno.env.get("CACHE_PATH") ?? "./data/tlcache.json";
const EMPTY_PATH = Deno.env.get("EMPTY_PATH") ?? "./data/tlempty.json";
const SOURCE_LANG = Deno.env.get("SOURCE_LANG") as deepl.SourceLanguageCode;
const TARGET_LANG = Deno.env.get("TARGET_LANG") as deepl.TargetLanguageCode;
const DEEPL_API_KEY = Deno.env.get("DEEPL_API_KEY") ?? "";

const UNICODE_LANGUAGES = ["zh", "ja", "ko"];
const UNICODE_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
const COLORS = {
  WARN: "\x1b[33m%s\x1b[0m", // Yellow
  ERROR: "\x1b[31m%s\x1b[0m", // Red
};

const translator: deepl.Translator = await getTranslator();
const tlCache = new Map<string, deepl.TextResult>(Object.entries(fs.existsSync(CACHE_PATH) ? JSON.parse(Deno.readTextFileSync(CACHE_PATH)) : {}));
const tlEmpty = new Map<string, deepl.TextResult>();

interface TLCaption extends ContentCaption {
  source?: "cache" | "translated" | "untranslated";
  detectedSourceLang?: deepl.SourceLanguageCode;
  modified: boolean;
}

const translateCaptions = async (captions: TLCaption[]): Promise<TLCaption[]> => {
  const toTranslate = captions.filter((c) => c.source === "untranslated");
  if (!toTranslate.length) {
    console.log("No lines to translate.");
    return captions;
  }

  try {
    // Translate lines
    console.log(`Translating ${toTranslate.length} lines`);
    const results = await translator.translateText(toTranslate.map((c) => c.text.trim()), SOURCE_LANG ?? null, TARGET_LANG ?? "en-US");
    for (const idx in results) {
      const tlResult = results[idx];
      const oldText = toTranslate[idx].text.trim();
      if (!validateTranslation(oldText, tlResult)) {
        continue;
      }

      // If all validations passed, save result to cache
      const newText = tlResult.text?.trim() ?? "";
      tlCache.set(oldText, {
        text: newText,
        detectedSourceLang: tlResult.detectedSourceLang,
      } as deepl.TextResult);

      toTranslate[idx].source = "translated";
      toTranslate[idx].detectedSourceLang = tlResult.detectedSourceLang;
      toTranslate[idx].text = newText;
      toTranslate[idx].modified = true;
    }
    console.log(`Finished translation resulting in ${toTranslate.filter((c) => c.source === "translated").length} valid translations`);
  } catch (e) {
    console.error(COLORS.ERROR, e);
  }

  toTranslate.forEach((caption) => {
    const idx = captions.findIndex((c) => c.index === caption.index);
    if (idx >= 0) {
      captions[idx] = caption;
    } else {
      console.error(COLORS.ERROR, "Unable to find original caption for translated caption. Something went very wrong.");
      console.error(COLORS.ERROR, JSON.stringify(caption));
      console.error(COLORS.ERROR, JSON.stringify(captions));
    }
  });

  return captions;
};

const translateFile = async (file: string): Promise<void> => {
  // Read file contents
  console.log(`\nReading ${file}`);
  const content = Deno.readTextFileSync(path.join(RJ_PATH, file));
  const format = path.extname(file).substring(1);
  const srtData: TLCaption[] = subsrt.parse(content, { format, verbose: true }).map((caption) => {
    const tlCaption = caption as TLCaption;
    tlCaption.modified = false;

    const text = tlCaption.text?.trim();
    if (tlCaption.type !== "caption" || !text?.length || !shouldTranslate(text)) {
      return tlCaption;
    }

    const fromCache = tlCache.get(text);
    if (fromCache?.text?.length) {
      tlCaption.source = "cache";
      tlCaption.modified = tlCaption.text !== fromCache!.text;
      tlCaption.text = fromCache!.text;
      tlCaption.detectedSourceLang = fromCache!.detectedSourceLang;
      return tlCaption;
    }

    tlCaption.source = "untranslated";
    return tlCaption;
  });

  await translateCaptions(srtData);

  const hasModifiications = srtData.filter((c) => c.modified).length > 0;
  if (!hasModifiications) {
    console.log("No changes to file detected");
    return;
  }

  const translatedContents = subsrt.build(srtData, { format, verbose: true });
  backupAndWriteFile(file, translatedContents);
  console.log(`Completed file ${file}`);
};

const backupAndWriteFile = (file: string, content: string) => {
  const filePath = path.join(RJ_PATH, file);

  // Backup files
  const bakFilePath = path.join(BAK_PATH, file);
  const bakFolder = path.dirname(bakFilePath);
  if (!fs.existsSync(bakFolder)) {
    Deno.mkdirSync(bakFolder, { recursive: true });
  }
  Deno.copyFileSync(filePath, bakFilePath);

  // Write output
  const outFilePath = path.join(OUT_PATH, file);
  const outFolder = path.dirname(outFilePath);
  if (!fs.existsSync(outFolder)) {
    Deno.mkdirSync(outFolder, { recursive: true });
  }
  Deno.writeTextFileSync(outFilePath, content);

  // Update cache
  Deno.writeTextFileSync(CACHE_PATH, JSON.stringify(Object.fromEntries(tlCache), null, 2));
};

const updateEmptyTranslation = (key: string, value: deepl.TextResult) => {
  tlEmpty.set(key, value);
  Deno.writeTextFileSync(EMPTY_PATH, JSON.stringify(Object.fromEntries(tlEmpty), null, 2));
};

const shouldTranslate = (text: string, defaultIfNonUnicode: boolean = true): boolean => {
  if (UNICODE_LANGUAGES.includes(SOURCE_LANG?.toLowerCase())) {
    return UNICODE_REGEX.test(text);
  }
  return defaultIfNonUnicode;
};

const validateTranslation = (oldText: string, tlResult: deepl.TextResult): boolean => {
  const newText = tlResult.text?.trim() ?? "";

  // Validate detected source language
  const detectedSourceLang = tlResult.detectedSourceLang?.toLowerCase() ?? "";
  if (!detectedSourceLang.length) {
    console.warn(COLORS.WARN, `Skipped due to invalid detectedSourceLang: ${JSON.stringify(tlResult)}`);
    updateEmptyTranslation(oldText, tlResult);
    return false;
  }
  if (detectedSourceLang.startsWith(TARGET_LANG.substring(0, 2))) {
    console.warn(COLORS.WARN, `Skipped due to source lang being the same as target lang: ${JSON.stringify(tlResult)}`);
    updateEmptyTranslation(oldText, tlResult);
    return false;
  }
  if (SOURCE_LANG && !detectedSourceLang.startsWith(SOURCE_LANG.substring(0, 2))) {
    console.warn(COLORS.WARN, `Skipped due to source lang not matching desired source lang: ${JSON.stringify(tlResult)}`);
    updateEmptyTranslation(oldText, tlResult);
    return false;
  }

  // Validate translated text
  if (!newText.length) {
    console.warn(COLORS.WARN, `Skipped due to translation being empty: ${JSON.stringify(tlResult)}`);
    updateEmptyTranslation(oldText, tlResult);
    return false;
  }
  if (oldText === newText) {
    console.warn(COLORS.WARN, `Skipped due to result being unchanged: ${newText}`);
    updateEmptyTranslation(oldText, tlResult);
    return false;
  }
  if (shouldTranslate(newText, false)) {
    console.warn(COLORS.WARN, `Skipped due to result still containing untranslated characters: ${newText}`);
    updateEmptyTranslation(oldText, tlResult);
    return false;
  }

  return true;
};

async function getTranslator(): Promise<deepl.Translator> {
  try {
    const translator = new deepl.Translator(DEEPL_API_KEY);
    const usage = await translator.getUsage();
    if (!usage.anyLimitReached()) {
      return translator;
    }

    console.error(COLORS.ERROR, "Translation limit exceeded.");
    if (usage.character) {
      console.error(COLORS.ERROR, `Characters: ${usage.character.count} of ${usage.character.limit}`);
    }
    if (usage.document) {
      console.error(COLORS.ERROR, `Documents: ${usage.document.count} of ${usage.document.limit}`);
    }
  } catch (e: unknown) {
    const error = e as Error;
    console.error(COLORS.ERROR, `Error initializing translator: ${error.message}`);
    console.error(COLORS.ERROR, "Please ensure you have provided a valid DEEPL_API_KEY in the .env file");
  }
  alert("\nPress Enter to close...");
  Deno.exit(1);
}

const main = async () => {
  // Find list of subtitle files
  const data = Array.from(fs.expandGlobSync("**/*.{lrc,srt,vtt}", {
    root: RJ_PATH,
  })).map((walkEntry) => {
    const filePath = walkEntry.path.substring(path.resolve(RJ_PATH).length + 1);
    return {
      rjcode: filePath.match(/R.\d+/)?.[0] ?? path.dirname(filePath),
      filePath,
    };
  }).reduce((acc, cur) => {
    if (!acc[cur.rjcode]) {
      acc[cur.rjcode] = [];
    }
    acc[cur.rjcode].push(cur.filePath);
    return acc;
  }, {} as { [key: string]: Array<string> });

  console.log(`Found ${Object.keys(data).length} folder entries.`);
  for (const [rjcode, files] of Object.entries(data)) {
    console.log(`\nParsing ${rjcode}...`);
    for (const file of files) {
      try {
        await translateFile(file);
      } catch (e) {
        console.error(e);
        continue;
      }
    }
  }

  alert("\nFinished processing all files. Press Enter to close...");
};

main().catch((error) => {
  console.error(COLORS.ERROR, error);
  alert("\nPress Enter to close...");
});
