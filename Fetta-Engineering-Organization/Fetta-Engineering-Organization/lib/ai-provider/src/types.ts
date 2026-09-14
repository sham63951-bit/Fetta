export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelResponse {
  content: string;
  finishReason: "stop" | "length" | "error";
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ModelProvider {
  /**
   * Complete a chat conversation
   */
  complete(messages: ModelMessage[]): Promise<ModelResponse>;

  /**
   * Get the provider name for logging
   */
  getName(): string;
}

export interface ModelConfig {
  provider: "openai" | "anthropic" | "local";
  baseUrl: string;
  apiKey: string;
  model: string;
}
