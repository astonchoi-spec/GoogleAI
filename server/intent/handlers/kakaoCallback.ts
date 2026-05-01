import type { Context } from "telegraf";
import { handleFileCallback } from "./fileCallback.ts";

export async function handleKakaoCallback(ctx: Context): Promise<void> {
  await handleFileCallback(ctx);
}
