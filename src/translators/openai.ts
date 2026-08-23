import "@std/dotenv/load";
import { logger, TLResult, Translator } from "../common.ts";

class LLMTranslator implements Translator {
  readonly code = "LLM";

  private readonly endpoint = Deno.env.get("LLM_ENDPOINT") ?? "";
  private readonly model = Deno.env.get("LLM_MODEL") ?? "";
  private readonly apiKey = Deno.env.get("LLM_API_KEY") ?? "";
  private readonly systemPrompt = Deno.env.get("LLM_PARAM_PROMPT") ?? "";
  private readonly temperature = Deno.env.get("LLM_PARAM_TEMPERATURE") ?? "0.3";
  private readonly topP = Deno.env.get("LLM_PARAM_TOP_P") ?? "0.7";
  private readonly topK = Deno.env.get("LLM_PARAM_TOP_K") ?? "";
  private readonly repeatPen = Deno.env.get("LLM_PARAM_REPETITION_PENALTY") ?? "";

  private reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
  private reqBody: ReqBody = {};
  private initialized: boolean = false;

  // deno-lint-ignore require-await
  async init(): Promise<void> {
    try {
      if (!this.endpoint.length) {
        throw new Error("Chat Completions API endpoint not provided");
      }

      if (this.apiKey.length) {
        this.reqHeaders["Authorization"] = `Bearer ${this.apiKey}`;
      } else {
        logger.warn("No api key / auth token provided. Translation may fail if your service requires authentication.");
      }

      if (this.systemPrompt.length) {
        this.reqBody.messages = [{
          role: "system",
          content: this.systemPrompt,
        }];
      } else {
        throw new Error("No system prompt provided");
      }

      if (this.model.length) {
        this.reqBody.model = this.model;
      } else {
        logger.warn("No model provided. Translation may fail if a model is not already loaded.");
      }

      this.reqBody.temperature = parseFloat(this.temperature);
      if (isNaN(this.reqBody.temperature)) {
        throw new Error("Invalid temperature provided");
      }

      this.reqBody.top_p = parseFloat(this.topP);
      if (isNaN(this.reqBody.top_p)) {
        throw new Error("Invalid top_p provided");
      }

      if (this.topK.length) {
        this.reqBody.top_k = parseFloat(this.topK);
        if (isNaN(this.reqBody.top_k)) {
          logger.warn("Invalid top_k provided. Parameter will be ignored.");
          delete this.reqBody.top_k;
        }
      }

      if (this.repeatPen.length) {
        this.reqBody.repetition_penalty = parseFloat(this.repeatPen);
        if (isNaN(this.reqBody.repetition_penalty)) {
          logger.warn("Invalid repetition_penalty provided. Parameter will be ignored.");
          delete this.reqBody.repetition_penalty;
        }
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
    for (const line of lines) {
      try {
        this.reqBody.messages![1] = {
          role: "user",
          content: line,
        };

        const resp = await fetch(this.endpoint, {
          method: "POST",
          headers: this.reqHeaders,
          body: JSON.stringify(this.reqBody),
        });
        const respJson: LLMResult = await resp.json();

        const result: TLResult = {
          text: respJson?.choices?.[0]?.message?.content?.trim() ?? "",
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

type ReqBody = {
  model?: string;
  messages?: Message[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
};

type Message = {
  role: "system" | "user";
  content: string;
};

type LLMResult = {
  choices: {
    message: {
      content: string;
    };
  }[];
};

export default LLMTranslator;
