import type { ModelProvider, ModelConfig } from "./types";
import { OpenAIProvider } from "./openai-provider";

/**
 * Create a model provider from environment variables
 */
export function createProvider(): ModelProvider {
  const provider = process.env.MODEL_PROVIDER ?? "openai";
  const baseUrl = process.env.MODEL_BASE_URL;
  const apiKey = process.env.MODEL_API_KEY;
  const model = process.env.MODEL_NAME ?? "gpt-4";

  if (!baseUrl) {
    throw new Error("MODEL_BASE_URL environment variable is required");
  }

  if (!apiKey) {
    throw new Error("MODEL_API_KEY environment variable is required");
  }

  const config: ModelConfig = {
    provider: provider as "openai" | "anthropic" | "local",
    baseUrl,
    apiKey,
    model,
  };

  switch (provider) {
    case "openai":
    case "local": // Local runtime uses OpenAI-compatible API
      return new OpenAIProvider(config);
    case "anthropic":
      // For now, use OpenAI provider for Anthropic via compatibility layer
      // A dedicated Anthropic provider can be added later
      return new OpenAIProvider(config);
    default:
      throw new Error(`Unsupported model provider: ${provider}`);
  }
}

/**
 * Create a provider from explicit configuration
 */
export function createProviderFromConfig(config: ModelConfig): ModelProvider {
  switch (config.provider) {
    case "openai":
    case "local":
      return new OpenAIProvider(config);
    case "anthropic":
      return new OpenAIProvider(config);
    default:
      throw new Error(`Unsupported model provider: ${config.provider}`);
  }
}
