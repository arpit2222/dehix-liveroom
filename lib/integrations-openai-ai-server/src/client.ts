import { AzureOpenAI } from "openai";

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const apiVersion = process.env.AZURE_OPENAI_API_VERSION;

if (!endpoint) {
  throw new Error(
    "AZURE_OPENAI_ENDPOINT must be set for Azure OpenAI.",
  );
}

if (!apiKey) {
  throw new Error(
    "AZURE_OPENAI_API_KEY must be set for Azure OpenAI.",
  );
}

if (!apiVersion) {
  throw new Error("AZURE_OPENAI_API_VERSION must be set for Azure OpenAI.");
}

export const azureOpenAiDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;

export const openai = new AzureOpenAI({
  apiKey,
  endpoint,
  apiVersion,
});
