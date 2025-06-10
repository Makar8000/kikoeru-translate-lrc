import "@std/dotenv/load";
import { logger, TLResult, Translator } from "../common.ts";

class LibreTranslator implements Translator {
  readonly code = "LIBRE";

  private readonly endpoint = Deno.env.get("LIBRE_ENDPOINT") ?? "http://127.0.0.1:5000/";
  readonly sourceLang = Deno.env.get("LIBRE_SOURCE_LANG") ?? "auto";
  readonly targetLang = Deno.env.get("LIBRE_TARGET_LANG") ?? "en";
  private initialized: boolean = false;

  async init(): Promise<void> {
    try {
      const langEndpoint = new URL("/languages", this.endpoint);
      const resp = await fetch(langEndpoint);
      const respJson = await resp.json();
      if (!respJson.length) {
        throw new Error("No supported langauges found");
      }
      if (this.sourceLang === "auto") {
        this.initialized = true;
        return;
      }

      // deno-lint-ignore no-explicit-any
      const source = respJson.find((l: any) => l.code?.toLowerCase() === this.sourceLang.toLowerCase());
      if (!source?.targets?.length) {
        throw new Error(`Invalid source language \"${this.sourceLang}\"`);
      }
      if (!source.targets.find((t: string) => t?.toLowerCase() === this.targetLang.toLowerCase())) {
        throw new Error(`Invalid target language \"${this.targetLang}\". Please visit ${langEndpoint.href} for a list of supported language codes.`);
      }
      this.initialized = true;
      return;
    } catch (e: unknown) {
      const error = e as Error;
      logger.error(`Error initializing translator!`);
      logger.error(error.message);
    }
    alert("\nPress Enter to close...");
    Deno.exit(1);
  }

  async translate(lines: string[]): Promise<TLResult[]> {
    if (!this.initialized) {
      await this.init();
    }

    const results: TLResult[] = [];
    const url = new URL("/translate", this.endpoint);
    for (const line of lines) {
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            q: line,
            source: this.sourceLang,
            target: this.targetLang,
          }),
        });
        const respJson = await resp.json();
        const result: TLResult = {
          text: respJson?.translatedText?.trim() ?? "",
          translator: this.code,
        };
        results.push(result);
      } catch (e) {
        logger.error(e);
        results.push({
          text: "",
          translator: this.code,
        });
      }
    }
    return results;
  }
}

export default LibreTranslator;
