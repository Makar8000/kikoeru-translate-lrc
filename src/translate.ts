import "@std/dotenv/load";
import * as fs from "@std/fs";
import * as path from "@std/path";
import subsrt from "subsrt-ts";
import { logger, TLCaption, TLResult, Translator, TranslatorCode } from "./common.ts";
import DeepLTranslator from "./translators/deepl.ts";
import LibreTranslator from "./translators/libre.ts";
import LunaTranslator from "./translators/luna.ts";

const RJ_PATH = Deno.env.get("RJ_PATH") ?? "./queue";
const BAK_PATH = Deno.env.get("BAK_PATH") ?? "./backup";
const OUT_PATH = Deno.env.get("OUT_PATH") ?? "./output";
const CACHE_PATH = Deno.env.get("CACHE_PATH") ?? "./data/tlcache.json";
const EMPTY_PATH = Deno.env.get("EMPTY_PATH") ?? "./data/tlempty.json";
const TRANSLATOR: TranslatorCode = (Deno.env.get("TRANSLATOR") ?? "DEEPL") as TranslatorCode;

const UNICODE_LANGUAGES = ["zh", "ja", "ko"];
const UNICODE_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;

const translator: Translator = await getTranslator();
const tlCache = new Map<string, TLResult>(Object.entries(fs.existsSync(CACHE_PATH) ? JSON.parse(Deno.readTextFileSync(CACHE_PATH)) : {}));
const tlEmpty = new Map<string, TLResult>();

const translateCaptions = async (captions: TLCaption[]): Promise<TLCaption[]> => {
  const toTranslate = captions.filter((c) => c.source === "untranslated");
  if (!toTranslate.length) {
    logger.info("No lines to translate.");
    return captions;
  }

  try {
    // Translate lines
    logger.info(`Translating ${toTranslate.length} lines`);
    const results = await translator.translate(toTranslate.map((c) => c.text.trim()));
    for (const idx in results) {
      const tlResult = results[idx];
      const oldText = toTranslate[idx].text.trim();
      if (!validateTranslation(oldText, tlResult)) {
        continue;
      }

      // If all validations passed, save result to cache
      tlCache.set(oldText, tlResult);

      toTranslate[idx].source = "translated";
      toTranslate[idx].text = tlResult.text;
      toTranslate[idx].modified = true;
      toTranslate[idx].translator = tlResult.translator;
      if (tlResult.detectedSourceLang) {
        toTranslate[idx].detectedSourceLang = tlResult.detectedSourceLang;
      }
    }
    logger.info(`Finished translation resulting in ${toTranslate.filter((c) => c.source === "translated").length} valid translations`);
  } catch (e) {
    logger.error(e);
  }

  toTranslate.forEach((caption) => {
    const idx = captions.findIndex((c) => c.index === caption.index);
    if (idx >= 0) {
      captions[idx] = caption;
    } else {
      logger.error("Unable to find original caption for translated caption. Something went very wrong.");
      logger.error(JSON.stringify(caption));
      logger.error(JSON.stringify(captions));
    }
  });

  return captions;
};

const translateFile = async (file: string): Promise<void> => {
  // Read file contents
  logger.info(`\nReading ${file}`);
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
    if (fromCache?.text?.length && fromCache?.translator === translator.code) {
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
    logger.info("No changes to file detected");
    return;
  }

  const translatedContents = subsrt.build(srtData, { format, verbose: true });
  backupAndWriteFile(file, translatedContents);
  logger.info(`Completed file ${file}`);
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

const updateEmptyTranslation = (key: string, value: TLResult) => {
  tlEmpty.set(key, value);
  Deno.writeTextFileSync(EMPTY_PATH, JSON.stringify(Object.fromEntries(tlEmpty), null, 2));
};

const shouldTranslate = (text: string, defaultIfNonUnicode: boolean = true): boolean => {
  if (!translator.sourceLang) {
    return UNICODE_REGEX.test(text);
  } else if (UNICODE_LANGUAGES.includes(translator.sourceLang.toLowerCase())) {
    return UNICODE_REGEX.test(text);
  }
  return defaultIfNonUnicode;
};

const validateTranslation = (oldText: string, tlResult: TLResult): boolean => {
  const logWarn = (reason: string) => {
    logger.warn(`Skipped a translation for reason: ${reason}\nOriginal Text: ${oldText}\nTL Output: ${JSON.stringify(tlResult)}`);
  };

  const isValid = (() => {
    // Validate detected source language
    const detectedSourceLang = tlResult.detectedSourceLang?.toLowerCase() ?? "";
    if (detectedSourceLang.length) {
      if (translator.targetLang && detectedSourceLang.startsWith(translator.targetLang.substring(0, 2))) {
        logWarn("Detected source lang is the same as target lang");
        return false;
      }
      if (translator.sourceLang && !detectedSourceLang.startsWith(translator.sourceLang.substring(0, 2))) {
        logWarn("Detected source lang does not match desired source lang");
        return false;
      }
    }

    // Validate translated text
    const newText = tlResult.text?.trim() ?? "";
    if (!newText.length) {
      logWarn("Translated text is empty");
      return false;
    }
    if (oldText === newText) {
      logWarn("Translated text and untranslated text are the same");
      return false;
    }
    if (shouldTranslate(newText, false)) {
      logWarn("Translated text still contains untranslated characters");
      return false;
    }

    return true;
  })();

  if (!isValid) {
    updateEmptyTranslation(oldText, tlResult);
  }

  return isValid;
};

async function getTranslator(): Promise<Translator> {
  let tl: Translator;
  switch (TRANSLATOR) {
    case "DEEPL": {
      tl = new DeepLTranslator();
      break;
    }
    case "LIBRE": {
      tl = new LibreTranslator();
      break;
    }
    case "LUNA": {
      tl = new LunaTranslator();
      break;
    }
    default: {
      logger.error(`Error initializing translator: ${TRANSLATOR}. This is not a valid translator. Please see readme for details`);
      alert("\nPress Enter to close...");
      Deno.exit(1);
    }
  }
  await tl.init();
  return tl;
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

  logger.info(`Found ${Object.keys(data).length} folder entries.`);
  for (const [rjcode, files] of Object.entries(data)) {
    logger.info(`\nParsing ${rjcode}...`);
    for (const file of files) {
      try {
        await translateFile(file);
      } catch (e) {
        logger.error(e);
        continue;
      }
    }
  }

  alert("\nFinished processing all files. Press Enter to close...");
};

main().catch((error) => {
  logger.error(error);
  alert("\nPress Enter to close...");
});
