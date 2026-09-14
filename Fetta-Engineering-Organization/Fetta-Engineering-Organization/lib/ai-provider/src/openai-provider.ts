import OpenAI from "openai";
import type { ModelProvider, ModelMessage, ModelResponse, ModelConfig } from "./types";

export class OpenAIProvider implements ModelProvider {
  private client: OpenAI;
  private modelName: string;

  constructor(config: ModelConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.modelName = config.model;
  }

  async complete(messages: ModelMessage[]): Promise<ModelResponse> {
    const response = await this.client.chat.completions.create({
      model: this.modelName,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: 0.7,
      max_tokens: 4096,
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error("No completion choice returned from model");
    }

    return {
      content: choice.message.content ?? "",
      finishReason: choice.finish_reason === "stop" ? "stop" : 
                    choice.finish_reason === "length" ? "length" : "error",
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined,
    };
  }

  getName(): string {
    return `openai:${this.modelName}`;
  }
}
