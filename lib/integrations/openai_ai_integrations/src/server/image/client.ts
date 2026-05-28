import fs from "node:fs";
import { AzureOpenAI, toFile } from "openai";
import { Buffer } from "node:buffer";

const imageDeployment = process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT ?? process.env.AZURE_OPENAI_DEPLOYMENT;

export const openai = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY ?? "placeholder",
  endpoint: process.env.AZURE_OPENAI_ENDPOINT ?? "https://placeholder.openai.azure.com",
  apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21",
});

/**
 * Generate an image and return as Buffer.
 * Uses the configured Azure OpenAI image deployment.
 */
export async function generateImageBuffer(
  prompt: string,
  size: "1024x1024" | "512x512" | "256x256" = "1024x1024"
): Promise<Buffer> {
  const response = await openai.images.generate({
    model: imageDeployment ?? "gpt-image-1",
    prompt,
    size,
  });
  const base64 = response.data[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

/**
 * Edit/combine multiple images into a composite.
 * Uses the configured Azure OpenAI image deployment.
 */
export async function editImages(
  imageFiles: string[],
  prompt: string,
  outputPath?: string
): Promise<Buffer> {
  const images = await Promise.all(
    imageFiles.map((file) =>
      toFile(fs.createReadStream(file), file, {
        type: "image/png",
      })
    )
  );

  const response = await openai.images.edit({
    model: imageDeployment ?? "gpt-image-1",
    image: images,
    prompt,
  });

  const imageBase64 = response.data[0]?.b64_json ?? "";
  const imageBytes = Buffer.from(imageBase64, "base64");

  if (outputPath) {
    fs.writeFileSync(outputPath, imageBytes);
  }

  return imageBytes;
}
