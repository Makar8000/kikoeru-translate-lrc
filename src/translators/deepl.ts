import "@std/dotenv/load";
import * as deepl from "deepl-node";
import { logger, TLResult, Translator } from "../common.ts";

class DeepLTranslator implements Translator {
  readonly code = "DEEPL";

  private translator: deepl.Translator | null = null;
  private readonly apiKey = Deno.env.get("DEEPL_API_KEY") ?? "";
  readonly sourceLang = Deno.env.get("DEEPL_SOURCE_LANG") as deepl.SourceLanguageCode;
  readonly targetLang = Deno.env.get("DEEPL_TARGET_LANG") as deepl.TargetLanguageCode;

  async init(): Promise<void> {
    try {
      this.translator = new deepl.Translator(this.apiKey);
      const usage = await this.translator.getUsage();
      if (!usage.anyLimitReached()) {
        return;
      }

      logger.error("Translation limit exceeded.");
      if (usage.character) {
        logger.error(`Characters: ${usage.character.count} of ${usage.character.limit}`);
      }
      if (usage.document) {
        logger.error(`Documents: ${usage.document.count} of ${usage.document.limit}`);
      }
    } catch (e: unknown) {
      const error = e as Error;
      logger.error(`Error initializing translator: ${error.message}`);
      logger.error("Please ensure you have provided a valid DEEPL_API_KEY in the .env file");
    }
    alert("\nPress Enter to close...");
    Deno.exit(1);
  }

  async translate(lines: string[]): Promise<TLResult[]> {
    if (this.translator === null) {
      await this.init();
    }

    const results = await this.translator!.translateText(lines, this.sourceLang ?? null, this.targetLang ?? "en-US");
    const ret = results.map((r) => ({
      text: r.text?.trim(),
      translator: this.code,
      detectedSourceLang: r.detectedSourceLang,
    } as TLResult));
    return ret;
  }
}

export default DeepLTranslator;
