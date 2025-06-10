import "@std/dotenv/load";
import * as fs from "@std/fs";
import * as path from "@std/path";
import * as deepl from "deepl-node";

const INPUT_PATH = Deno.env.get("TLFIX_PATH") ?? "./data/tlfix.json";
const OUT_PATH = getOutputPath();
const TARGET_LANG = Deno.env.get("DEEPL_TARGET_LANG") as deepl.TargetLanguageCode;
const DEEPL_API_KEY = Deno.env.get("DEEPL_API_KEY") ?? "";
const translator: deepl.Translator = await getTranslator();

const tlInput = new Map<string, deepl.TextResult>(Object.entries(fs.existsSync(INPUT_PATH) ? JSON.parse(Deno.readTextFileSync(INPUT_PATH)) : {}));

const main = async () => {
  for (const [text, data] of tlInput) {
    try {
      console.log(`Translating: ${text}`);
      const sourceLang = data.detectedSourceLang?.length ? data.detectedSourceLang : null;
      const tlResult = await translator.translateText(text, sourceLang, TARGET_LANG ?? "en-US");
      if (tlResult?.text?.trim()?.length) {
        tlInput.set(text, {
          text: tlResult.text.trim(),
          detectedSourceLang: tlResult.detectedSourceLang,
        } as deepl.TextResult);
      }
      console.log(`Result: ${tlResult?.text?.trim()}`);
    } catch (e) {
      console.error(e);
    }
  }

  Deno.writeTextFileSync(OUT_PATH, JSON.stringify(Object.fromEntries(tlInput), null, 2));
};

function getOutputPath(): string {
  const input = path.parse(INPUT_PATH);
  return path.resolve(input.dir, `${input.name}-translated${input.ext}`);
}

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

main();
