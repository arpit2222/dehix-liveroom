import { AzureOpenAI } from "openai";

type AiProvider = "azure-openai" | "gemini";
type RequestedAiProvider = AiProvider | "auto";

type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GenerateAiTextOptions = {
  messages: AiMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  azureModel?: string;
};

type OpenAiCompatCreateParams = {
  model?: string;
  messages: AiMessage[];
  max_completion_tokens?: number;
  temperature?: number;
};

type GeminiPart = {
  text?: string;
};

type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    message?: string;
  };
};

const defaultGeminiModel = "gemini-2.5-flash";
const defaultGeminiBaseUrl = "https://generativelanguage.googleapis.com/v1beta";

function envValue(key: string): string | undefined {
  const value = process.env[key]?.trim();
  if (!value) return undefined;

  const placeholderValues = new Set([
    "placeholder",
    "your_azure_openai_key_here",
    "your_chat_model_deployment_name",
    "your_gemini_api_key_here",
  ]);

  if (placeholderValues.has(value) || value.includes("your-resource-name")) {
    return undefined;
  }

  return value;
}

function normalizeProvider(value?: string): RequestedAiProvider | null {
  if (!value) return "auto";
  const normalized = value.trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "auto") return "auto";
  if (normalized === "azure" || normalized === "azure-openai") return "azure-openai";
  if (normalized === "gemini" || normalized === "google-gemini" || normalized === "google") return "gemini";
  return null;
}

const endpoint = envValue("AZURE_OPENAI_ENDPOINT");
const apiKey = envValue("AZURE_OPENAI_API_KEY");
const apiVersion = envValue("AZURE_OPENAI_API_VERSION");
const deployment = envValue("AZURE_OPENAI_DEPLOYMENT");

const requiredAzureOpenAiEnv = {
  AZURE_OPENAI_ENDPOINT: endpoint,
  AZURE_OPENAI_API_KEY: apiKey,
  AZURE_OPENAI_API_VERSION: apiVersion,
  AZURE_OPENAI_DEPLOYMENT: deployment,
};

export const azureOpenAiDeployment = deployment ?? "placeholder";

export const missingOnlyAzureOpenAiEnvVars = Object.entries(requiredAzureOpenAiEnv)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const isOnlyAzureOpenAiEnabled = missingOnlyAzureOpenAiEnvVars.length === 0;

const geminiApiKey = envValue("GEMINI_API_KEY");
const geminiModel = envValue("GEMINI_MODEL") ?? defaultGeminiModel;
const geminiBaseUrl = (envValue("GEMINI_API_BASE_URL") ?? defaultGeminiBaseUrl).replace(/\/+$/, "");

export const missingGeminiEnvVars = geminiApiKey ? [] : ["GEMINI_API_KEY"];
export const isGeminiEnabled = missingGeminiEnvVars.length === 0;

const requestedProvider = normalizeProvider(process.env["AI_PROVIDER"]);

function pickAiProvider(): AiProvider | null {
  if (!requestedProvider) return null;
  if (requestedProvider === "azure-openai") return isOnlyAzureOpenAiEnabled ? "azure-openai" : null;
  if (requestedProvider === "gemini") return isGeminiEnabled ? "gemini" : null;
  if (isOnlyAzureOpenAiEnabled) return "azure-openai";
  if (isGeminiEnabled) return "gemini";
  return null;
}

export const activeAiProvider = pickAiProvider();
export const activeAiProviderLabel =
  activeAiProvider === "azure-openai" ? "Azure OpenAI" : activeAiProvider === "gemini" ? "Gemini" : "AI provider";

function providerMissingEnvVars(): string[] {
  if (!requestedProvider) return ["AI_PROVIDER"];
  if (requestedProvider === "azure-openai") return missingOnlyAzureOpenAiEnvVars;
  if (requestedProvider === "gemini") return missingGeminiEnvVars;
  if (activeAiProvider) return [];
  return [...missingOnlyAzureOpenAiEnvVars, ...missingGeminiEnvVars];
}

export const missingAiProviderEnvVars = providerMissingEnvVars();
export const isAiProviderEnabled = activeAiProvider !== null && requestedProvider !== null;

// Backward-compatible aliases for existing routes.
export const missingAzureOpenAiEnvVars = missingAiProviderEnvVars;
export const isAzureOpenAiEnabled = isAiProviderEnabled;

const azureOpenaiClient = new AzureOpenAI({
  apiKey: apiKey ?? "placeholder",
  endpoint: endpoint ?? "https://placeholder.openai.azure.com",
  apiVersion: apiVersion ?? "2024-10-21",
});

function geminiModelPath(model: string): string {
  const path = model.startsWith("models/") || model.startsWith("tunedModels/") ? model : `models/${model}`;
  return path.split("/").map(encodeURIComponent).join("/");
}

function toGeminiContents(messages: AiMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (const message of messages) {
    if (message.role === "system") continue;

    const role = message.role === "assistant" ? "model" : "user";
    const text = message.content.trim() || " ";
    const last = contents.at(-1);

    if (last?.role === role) {
      last.parts.push({ text });
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }

  if (contents.length > 0) {
    if (contents[0]?.role === "model") {
      contents.unshift({ role: "user", parts: [{ text: "Use the previous assistant message as conversation context." }] });
    }

    if (contents.at(-1)?.role === "model") {
      contents.push({ role: "user", parts: [{ text: "Continue from the previous assistant message." }] });
    }

    return contents;
  }

  const fallbackText = messages.map((message) => message.content).filter(Boolean).join("\n\n").trim();
  return [{ role: "user", parts: [{ text: fallbackText || "Respond to the request." }] }];
}

function toGeminiSystemInstruction(messages: AiMessage[]): { parts: GeminiPart[] } | undefined {
  const text = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");

  return text ? { parts: [{ text }] } : undefined;
}

function geminiErrorMessage(data: GeminiGenerateContentResponse, status: number): string {
  if (data.error?.message) return `Gemini request failed (${status}): ${data.error.message}`;
  return `Gemini request failed (${status})`;
}

async function generateGeminiText(options: GenerateAiTextOptions): Promise<string> {
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const generationConfig: Record<string, unknown> = {};
  if (options.maxOutputTokens) generationConfig["maxOutputTokens"] = options.maxOutputTokens;
  if (options.temperature !== undefined) generationConfig["temperature"] = options.temperature;

  const body: Record<string, unknown> = {
    contents: toGeminiContents(options.messages),
  };

  const systemInstruction = toGeminiSystemInstruction(options.messages);
  if (systemInstruction) body["systemInstruction"] = systemInstruction;
  if (Object.keys(generationConfig).length > 0) body["generationConfig"] = generationConfig;

  const response = await fetch(`${geminiBaseUrl}/${geminiModelPath(geminiModel)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": geminiApiKey,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as GeminiGenerateContentResponse;
  if (!response.ok) {
    throw new Error(geminiErrorMessage(data, response.status));
  }

  const content = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!content) {
    const reason = data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason;
    throw new Error(`Gemini returned an empty response${reason ? ` (${reason})` : ""}`);
  }

  return content;
}

async function generateAzureOpenAiText(options: GenerateAiTextOptions): Promise<string> {
  const completion = await azureOpenaiClient.chat.completions.create({
    model: options.azureModel ?? azureOpenAiDeployment,
    messages: options.messages,
    max_completion_tokens: options.maxOutputTokens,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  });

  return completion.choices[0]?.message?.content ?? "";
}

export async function generateAiText(options: GenerateAiTextOptions): Promise<string> {
  if (!activeAiProvider && !process.env["OPENAI_API_KEY"]) {
    throw new Error(
      "No AI provider is configured. Set OPENAI_API_KEY, Azure OpenAI variables, or GEMINI_API_KEY."
    );
  }

  let geminiError: Error | null = null;
  
  if (activeAiProvider === "gemini") {
    try {
      return await generateGeminiText(options);
    } catch (err) {
      console.warn("Gemini API failed, attempting fallback to ChatGPT...", err);
      geminiError = err as Error;
    }
  }

  // Fallback to Standard OpenAI if key exists
  if (process.env["OPENAI_API_KEY"]) {
    try {
      const { OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini", // fast fallback
        messages: options.messages,
        max_completion_tokens: options.maxOutputTokens,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      });
      return completion.choices[0]?.message?.content ?? "";
    } catch (fallbackErr) {
      console.error("ChatGPT fallback also failed:", fallbackErr);
      // If both fail, throw the original Gemini error
      throw geminiError ?? fallbackErr;
    }
  }

  // Fallback to Azure OpenAI if enabled
  if (isOnlyAzureOpenAiEnabled) {
    try {
      return await generateAzureOpenAiText(options);
    } catch (fallbackErr) {
       console.error("Azure OpenAI fallback also failed:", fallbackErr);
       throw geminiError ?? fallbackErr;
    }
  }

  if (geminiError) {
    throw geminiError;
  }

  return generateAzureOpenAiText(options);
}

export const azureOpenai = {
  chat: {
    completions: {
      create: async (params: OpenAiCompatCreateParams) => ({
        choices: [
          {
            message: {
              content: await generateAiText({
                messages: params.messages,
                maxOutputTokens: params.max_completion_tokens,
                temperature: params.temperature,
                azureModel: params.model,
              }),
            },
          },
        ],
      }),
    },
  },
};
