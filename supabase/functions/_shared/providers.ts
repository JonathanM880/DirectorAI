import { KeyVaultService } from '../../../packages/types/index.ts';
import providersConfig from "./providers.json" with { type: "json" };

export interface ProviderConfig {
  id: string;
  type: string;
  baseUrl: string;
  model: string;
  apiKeyEnv?: string;
}

export interface GenerateTextOptions {
  userId?: string;
  keyVault?: KeyVaultService;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  systemPrompt?: string;
  messages?: { role: string; content: string }[];
}

export interface GenerateTextResult {
  content: string;
  model: string;
  tokensUsed: number;
}

export interface GenerateImageOptions {
  userId?: string;
  keyVault?: KeyVaultService;
  aspectRatio?: string;
}

export interface GenerateImageResult {
  id: string;
  url: string;
  prompt: string;
  model: string;
  createdAt: Date;
}

// Utility to convert ArrayBuffer to Base64 without external dependencies
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Resolves the API key checking user keyVault first, then falling back to Env
async function resolveApiKey(
  provider: ProviderConfig,
  userId?: string,
  keyVault?: KeyVaultService
): Promise<string> {
  if (userId && keyVault) {
    try {
      // Map standard provider ids to keyVault names if applicable
      let vaultKeyName = "";
      if (provider.id === "openrouter") vaultKeyName = "openrouter_api_key";
      else if (provider.id === "gemini" || provider.id === "gemini-image") vaultKeyName = "gemini_api_key";
      else if (provider.id === "groq") vaultKeyName = "groq_api_key";
      else if (provider.id === "cerebras") vaultKeyName = "cerebras_api_key";
      else if (provider.id === "huggingface") vaultKeyName = "huggingface_api_key";
      else if (provider.id === "pollinations") vaultKeyName = "pollinations_api_key";

      if (vaultKeyName) {
        const key = await keyVault.getKey(userId, vaultKeyName);
        if (key) return key;
      }
    } catch {
      // Ignore keyVault errors and fallback to env variables
    }
  }

  if (provider.apiKeyEnv) {
    const envKey = Deno.env.get(provider.apiKeyEnv);
    if (envKey) return envKey;
  }

  return "";
}

/**
 * Route and generate text using configured providers with automatic fallback.
 */
export async function generateText(
  prompt: string,
  options?: GenerateTextOptions
): Promise<GenerateTextResult> {
  const forceProvider = Deno.env.get("FORCE_TEXT_PROVIDER");
  let providers = providersConfig.text as ProviderConfig[];

  if (forceProvider) {
    console.log(`[Providers] Force text provider active: ${forceProvider}`);
    const filtered = providers.filter(p => p.id.toLowerCase() === forceProvider.toLowerCase());
    if (filtered.length > 0) {
      providers = filtered;
    } else {
      console.warn(`[Providers] Forced provider '${forceProvider}' not found in configuration. Using default list.`);
    }
  }

  const errors: Error[] = [];

  for (const provider of providers) {
    console.log(`[Providers] Attempting text generation with provider: ${provider.id} (${provider.model})`);

    try {
      const apiKey = await resolveApiKey(provider, options?.userId, options?.keyVault);
      if (provider.apiKeyEnv && !apiKey) {
        throw new Error(`API key environment variable '${provider.apiKeyEnv}' is not set/configured.`);
      }

      // Build standard OpenAI messages structure
      let messages = options?.messages;
      if (!messages) {
        messages = [];
        if (options?.systemPrompt) {
          messages.push({ role: 'system', content: options.systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });
      }

      // Configure a 30 second timeout for the request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          stream: !!options?.stream,
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Analyze response code to decide whether to fallback or throw immediately
      if (!response.ok) {
        const errorText = await response.text();
        const status = response.status;

        // Categorize errors:
        // 400 Bad Request: Indicates request payload or prompt validation failed. Fallback won't fix this.
        // 404 Not Found: Path or model name configuration error.
        if (status === 400 || status === 404) {
          throw new Error(`Fatal request error from ${provider.id} (HTTP ${status}): ${errorText}`);
        }

        // 401/403/402/429/5xx: Rate limits, auth/quota issues, or backend issues that warrant a fallback.
        throw new Error(`Provider transient error from ${provider.id} (HTTP ${status}): ${errorText}`);
      }

      if (options?.stream && options.onChunk) {
        let content = '';
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');

              for (const line of lines) {
                const cleanedLine = line.trim();
                if (cleanedLine.startsWith('data: ') && cleanedLine !== 'data: [DONE]') {
                  try {
                    const data = JSON.parse(cleanedLine.slice(6));
                    const text = data.choices?.[0]?.delta?.content || '';
                    content += text;
                    if (text) {
                      options.onChunk(text);
                    }
                  } catch {
                    // Ignore parse errors on incomplete stream chunks
                  }
                }
              }
            }
          } finally {
            reader.releaseLock();
          }
        }

        console.log(`[Providers] Text generation succeeded with provider: ${provider.id}`);
        return {
          content,
          model: provider.model,
          tokensUsed: Math.ceil(content.length / 4) // estimate
        };
      } else {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        const tokensUsed = data.usage?.total_tokens || Math.ceil(content.length / 4);

        console.log(`[Providers] Text generation succeeded with provider: ${provider.id}`);
        return {
          content,
          model: provider.model,
          tokensUsed
        };
      }

    } catch (err: any) {
      console.warn(`[Providers] Provider ${provider.id} failed:`, err.message);
      
      // If it's a fatal request error (not transient), propagate it immediately without fallback
      if (err.message.startsWith('Fatal request error')) {
        throw err;
      }
      
      errors.push(err);
      // Loop continues to try the next provider in priority order
    }
  }

  throw new Error(`All configured text providers failed. Errors: ${errors.map(e => e.message).join(' | ')}`);
}

/**
 * Route and generate image using configured providers with automatic fallback.
 */
export async function generateImage(
  prompt: string,
  options?: GenerateImageOptions
): Promise<GenerateImageResult> {
  const forceProvider = Deno.env.get("FORCE_IMAGE_PROVIDER");
  let providers = providersConfig.image as ProviderConfig[];

  if (forceProvider) {
    console.log(`[Providers] Force image provider active: ${forceProvider}`);
    const filtered = providers.filter(p => p.id.toLowerCase() === forceProvider.toLowerCase());
    if (filtered.length > 0) {
      providers = filtered;
    } else {
      console.warn(`[Providers] Forced provider '${forceProvider}' not found in configuration. Using default list.`);
    }
  }

  const errors: Error[] = [];

  for (const provider of providers) {
    console.log(`[Providers] Attempting image generation with provider: ${provider.id}`);

    try {
      const apiKey = await resolveApiKey(provider, options?.userId, options?.keyVault);
      if (provider.apiKeyEnv && !apiKey) {
        throw new Error(`API key environment variable '${provider.apiKeyEnv}' is not set/configured.`);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout for images

      let imageUrl = '';

      if (provider.type === 'pollinations') {
        const key = apiKey || Deno.env.get('POLLINATIONS_API_KEY');
        if (!key) {
          throw new Error('POLLINATIONS_API_KEY no está configurada');
        }
        const url = `${provider.baseUrl}/${encodeURIComponent(prompt)}?key=${key}`;
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Pollinations API failed with status HTTP ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);
        const mimeType = response.headers.get('content-type') || 'image/png';
        imageUrl = `data:${mimeType};base64,${base64}`;

      } else if (provider.type === 'gemini-native') {
        const url = `${provider.baseUrl}?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          if (response.status === 400 || response.status === 404) {
            throw new Error(`Fatal request error from Gemini (HTTP ${response.status}): ${errorText}`);
          }
          throw new Error(`Gemini API failed with status HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const imagePart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
        if (!imagePart) {
          throw new Error('Gemini API returned no image data: ' + JSON.stringify(data));
        }

        const mimeType = imagePart.inlineData.mimeType || 'image/png';
        imageUrl = `data:${mimeType};base64,${imagePart.inlineData.data}`;

      } else if (provider.type === 'huggingface') {
        const url = `${provider.baseUrl}/${provider.model}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({ inputs: prompt }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          if (response.status === 400 || response.status === 404) {
            throw new Error(`Fatal request error from Hugging Face (HTTP ${response.status}): ${errorText}`);
          }
          throw new Error(`Hugging Face API failed with status HTTP ${response.status}: ${errorText}`);
        }

        const buffer = await response.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);
        const mimeType = response.headers.get('content-type') || 'image/jpeg';
        imageUrl = `data:${mimeType};base64,${base64}`;

      } else {
        clearTimeout(timeoutId);
        throw new Error(`Unsupported provider type: ${provider.type}`);
      }

      console.log(`[Providers] Image generation succeeded with provider: ${provider.id}`);
      return {
        id: crypto.randomUUID(),
        url: imageUrl,
        prompt,
        model: provider.model,
        createdAt: new Date()
      };

    } catch (err: any) {
      console.warn(`[Providers] Provider ${provider.id} failed:`, err.message);
      
      if (err.message.startsWith('Fatal request error')) {
        throw err;
      }
      
      errors.push(err);
    }
  }

  throw new Error(`All configured image providers failed. Errors: ${errors.map(e => e.message).join(' | ')}`);
}
