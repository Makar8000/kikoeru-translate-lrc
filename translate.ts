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
const UNICODE_REGEX = UNICODE_LANGUAGES.includes(SOURCE_LANG?.toLowerCase())
  ? /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/
  : /./;
const translator: deepl.Translator = await getTranslator();

const tlCache = new Map<string, deepl.TextResult>(Object.entries(fs.existsSync(CACHE_PATH) ? JSON.parse(Deno.readTextFileSync(CACHE_PATH)) : {}));
const tlEmpty = new Map<string, deepl.TextResult>();

const translateFile = async (file: string) => {
  // Read file contents
  console.log(`\nReading ${file}`);
  const content = Deno.readTextFileSync(path.join(RJ_PATH, file));
  const format = path.extname(file).substring(1);
  const srtData = subsrt.parse(content, { format, verbose: true });
  let hasModifiications = false;
  for (const idx in srtData) {
    // Parse line
    const text = (srtData[idx] as ContentCaption).text?.trim();
    if (srtData[idx].type !== "caption" || !UNICODE_REGEX.test(text)) {
      continue;
    }

    // Translate line
    let tlResult = tlCache.get(text);
    let fromCache = true;
    if (!tlResult?.text?.length) {
      try {
        console.log(`Translating: ${text}`);
        tlResult = await translator.translateText(text, SOURCE_LANG ?? null, TARGET_LANG ?? "en-US");
        if (tlResult?.text?.trim()?.length) {
          tlCache.set(text, {
            text: tlResult.text.trim(),
            detectedSourceLang: tlResult.detectedSourceLang,
          } as deepl.TextResult);
          fromCache = false;
        }
        console.log(`Result: ${tlResult?.text?.trim()}`);
      } catch (e) {
        console.error(e);
        continue;
      }
    }

    // Check detected source language
    const tlText = tlResult?.text?.trim();
    const detectedSourceLang = tlResult?.detectedSourceLang?.toLowerCase();
    if (detectedSourceLang.startsWith(TARGET_LANG.substring(0, 2))) {
      console.log(`Skipped due to source lang being the same as target lang: ${JSON.stringify(tlResult)}`);
      updateEmptyTranslation(text, tlResult);
      continue;
    }
    if (!fromCache && SOURCE_LANG && !detectedSourceLang.startsWith(SOURCE_LANG.substring(0, 2))) {
      console.log(`Skipped due to source lang not matching desired source lang: ${JSON.stringify(tlResult)}`);
      updateEmptyTranslation(text, tlResult);
      continue;
    }

    // Validate translated text
    if (!tlText?.length) {
      console.log(`Skipped due to translation being empty: ${JSON.stringify(tlResult)}`);
      updateEmptyTranslation(text, tlResult);
      continue;
    }
    if (tlText === text) {
      console.log(`Skipped due to result being unchanged: ${text}`);
      updateEmptyTranslation(text, tlResult);
      continue;
    }
    if (UNICODE_REGEX.test(tlText)) {
      console.log(`Skipped due to result still containing untranslated characters: ${tlText}`);
      updateEmptyTranslation(text, tlResult);
      continue;
    }

    // Update data with result
    srtData[idx].text = tlText;
    hasModifiications = true;
  }

  if (!hasModifiications) {
    console.log("No changes to file detected");
    return;
  }

  const translatedContents = subsrt.build(srtData, { format, verbose: true });
  backupAndWriteFile(file, translatedContents);
  console.log(`Finished file ${file}`);
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

async function getTranslator(): Promise<deepl.Translator> {
  try {
    const translator = new deepl.Translator(DEEPL_API_KEY);
    const usage = await translator.getUsage();
    if (!usage.anyLimitReached()) {
      return translator;
    }

    console.error("\x1b[31m%s\x1b[0m", "Translation limit exceeded.");
    if (usage.character) {
      console.error("\x1b[31m%s\x1b[0m", `Characters: ${usage.character.count} of ${usage.character.limit}`);
    }
    if (usage.document) {
      console.error("\x1b[31m%s\x1b[0m", `Documents: ${usage.document.count} of ${usage.document.limit}`);
    }
  } catch (e: unknown) {
    const error = e as Error;
    console.error("\x1b[31m%s\x1b[0m", `Error initializing translator: ${error.message}`);
    console.error("\x1b[31m%s\x1b[0m", "Please ensure you have provided a valid DEEPL_API_KEY in the .env file");
  }
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
};

main();
