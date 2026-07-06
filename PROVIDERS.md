# AI Provider Configuration System

This project uses an abstract multi-provider system with automatic fallback routing for text and image generation. All provider settings are configured in a single JSON file without needing to modify source code.

Configuration File Path: `supabase/functions/_shared/providers.json`

---

## 📖 How it Works

1. **Ordering & Priority:** The system attempts to call providers in the exact order they are listed in `providers.json` (from top to bottom).
2. **Automatic Fallback:** If a provider fails due to transient issues (Rate limits 429, Quota/Credits exhausted 401/403/402, Server down 5xx, or timeouts), it automatically logs the failure and attempts the next provider in the list.
3. **Fatal Client Errors:** If a provider returns a `400 Bad Request` or `404 Not Found`, the system immediately propagates the error without falling back, as these indicate malformed prompts, invalid parameters, or configuration errors.

---

## 🛠️ Configuring Providers

To modify, reorder, or add a provider, edit `supabase/functions/_shared/providers.json`.

### 1. Text Providers (`text` array)

All text providers must be compatible with the OpenAI format (`/chat/completions` endpoint).

**Fields to complete:**
* `id` *(string)*: Unique identifier (e.g., `"groq"`, `"openrouter"`).
* `type` *(string)*: Must be `"openai"`.
* `baseUrl` *(string)*: The base URL of the API (without the `/chat/completions` suffix).
* `model` *(string)*: The exact identifier of the model to use.
* `apiKeyEnv` *(string, optional)*: The name of the environment variable containing the API key (e.g., `"GROQ_API_KEY"`).

**Example entry:**
```json
{
  "id": "my-new-provider",
  "type": "openai",
  "baseUrl": "https://api.myprovider.com/v1",
  "model": "cool-text-model-v2",
  "apiKeyEnv": "MY_PROVIDER_API_KEY"
}
```

---

### 2. Image Providers (`image` array)

Image providers support different integration types.

**Available Types:**
* `"pollinations"`: Standard URL-based endpoint. **Requires an API key** (`POLLINATIONS_API_KEY`).
  * *Required fields:* `id`, `type` (`"pollinations"`), `baseUrl`, `model`, `apiKeyEnv`.
* `"gemini-native"`: Used for Google Gemini Imagen/Image endpoints (`generateContent`).
  * *Required fields:* `id`, `type` (`"gemini-native"`), `baseUrl`, `model`, `apiKeyEnv`.
  * *Active model:* `gemini-3.1-flash-lite-image`.
* `"huggingface"`: Used to call Hugging Face Inference API models (like FLUX).
  * *Required fields:* `id`, `type` (`"huggingface"`), `baseUrl`, `model`, `apiKeyEnv`.
  * *Base URL:* `https://router.huggingface.co/hf-inference/models`.

**Example Hugging Face entry:**
```json
{
  "id": "flux-hf",
  "type": "huggingface",
  "baseUrl": "https://router.huggingface.co/hf-inference/models",
  "model": "black-forest-labs/FLUX.1-schnell",
  "apiKeyEnv": "HF_API_KEY"
}
```

---

## 🧪 Testing and Debugging

You can force the application to use a specific provider for testing without editing the `providers.json` configuration file by setting these environment variables:

* **Force Text Provider:** Set `FORCE_TEXT_PROVIDER=provider_id` (e.g., `FORCE_TEXT_PROVIDER=groq`).
* **Force Image Provider:** Set `FORCE_IMAGE_PROVIDER=provider_id` (e.g., `FORCE_IMAGE_PROVIDER=pollinations`).

These can be configured in your local `.env` or in Supabase secrets.
