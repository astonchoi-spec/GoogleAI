/**
 * Built-in LLM helper — delegates to the multi-engine caller.
 */
import { LLMCaller } from "../llm/caller.ts";

const caller = new LLMCaller(
  undefined,
  process.env.GEMINI_API_KEY,
  process.env.OPENAI_API_KEY,
  process.env.ANTHROPIC_API_KEY
);

export async function invokeLLM(message: string): Promise<string> {
  const response = await caller.call("gemini", "flash", [
    { role: "user", content: message },
  ]);
  return response.content;
}
