import { AzureOpenAI } from "openai";

const endpoint = process.env["AZURE_OPENAI_ENDPOINT"];
const apiKey = process.env["AZURE_OPENAI_API_KEY"];
const apiVersion = process.env["AZURE_OPENAI_API_VERSION"];
const deployment = process.env["AZURE_OPENAI_DEPLOYMENT"];

export const isAzureOpenAiEnabled = !!(
  apiKey &&
  apiKey !== "placeholder" &&
  endpoint &&
  apiVersion &&
  deployment
);

export const azureOpenAiDeployment = deployment ?? "placeholder";

export const azureOpenai = new AzureOpenAI({
  apiKey: apiKey ?? "placeholder",
  endpoint: endpoint ?? "https://placeholder.openai.azure.com",
  apiVersion: apiVersion ?? "2024-10-21",
});
