import OpenAI from "openai";

const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];

export const isOpenAiEnabled = !!(apiKey && apiKey !== "placeholder" && baseURL);

export const openai = new OpenAI({ baseURL, apiKey: apiKey ?? "placeholder" });
