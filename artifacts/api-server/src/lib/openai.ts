import { AzureOpenAI } from "openai";

const endpoint = process.env["AZURE_OPENAI_ENDPOINT"];
const apiKey = process.env["AZURE_OPENAI_API_KEY"];
const apiVersion = process.env["AZURE_OPENAI_API_VERSION"];
const deployment = process.env["AZURE_OPENAI_DEPLOYMENT"];

const requiredAzureOpenAiEnv = {
  AZURE_OPENAI_ENDPOINT: endpoint,
  AZURE_OPENAI_API_KEY: apiKey,
  AZURE_OPENAI_API_VERSION: apiVersion,
  AZURE_OPENAI_DEPLOYMENT: deployment,
};

export const missingAzureOpenAiEnvVars = Object.entries(requiredAzureOpenAiEnv)
  .filter(([, value]) => !value || value === "placeholder")
  .map(([key]) => key);

export const isAzureOpenAiEnabled = missingAzureOpenAiEnvVars.length === 0;

export const azureOpenAiDeployment = deployment ?? "placeholder";

export const azureOpenai = new AzureOpenAI({
  apiKey: apiKey ?? "placeholder",
  endpoint: endpoint ?? "https://placeholder.openai.azure.com",
  apiVersion: apiVersion ?? "2024-10-21",
});
