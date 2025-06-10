import "@std/dotenv/load";
import { logger, TLResult, Translator } from "../common.ts";

class LunaTranslator implements Translator {
  readonly code = "LUNA";

  private readonly endpoint = Deno.env.get("LUNA_ENDPOINT") ?? "http://127.0.0.1:2333/";
  private readonly translator = Deno.env.get("LUNA_TRANSLATOR") ?? "";
  private translatorId: string = "";
  private initialized: boolean = false;

  async init(): Promise<void> {
    try {
      const tlEndpoint = new URL("/api/list/translator", this.endpoint);
      const resp = await fetch(tlEndpoint);
      const respJson = await resp.json();
      if (!respJson.length) {
        throw new Error("No supported langauges found");
      }
      if (!this.translator?.length) {
        this.initialized = true;
        return;
      }

      // deno-lint-ignore no-explicit-any
      const tl = respJson.find((t: any) => t.name?.toLowerCase() === this.translator.toLowerCase());
      if (!tl?.id?.length) {
        throw new Error(
          `Invalid translator \"${this.translator}\". Please visit ${tlEndpoint.href} for a list of enabled translators. You must configure these yourself in LunaTranslator.`,
        );
      }
      this.translatorId = tl.id;
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
    for (const line of lines) {
      try {
        const url = new URL("/api/translate", this.endpoint);
        url.searchParams.set("text", line);
        if (this.translatorId?.length) {
          url.searchParams.set("id", this.translatorId);
        }
        const resp = await fetch(url);
        const respJson = await resp.json();
        const result: TLResult = {
          text: respJson?.result?.trim() ?? "",
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

export default LunaTranslator;
