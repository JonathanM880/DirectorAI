# Backend Documentation — DirectorAI

## ¿Por qué dos Edge Functions?

DirectorAI tiene **dos edge functions principales desplegadas en Supabase** porque cada una resuelve un problema fundamentalmente distinto con requisitos opuestos de seguridad, entrada/salida y ciclo de vida.

| Aspecto | `scheduler` | `gen-ai-studio` |
|---------|-------------|-----------------|
| **Quién lo invoca** | `pg_cron` (cada 1 minuto) | El frontend (usuario autenticado) |
| **Autenticación** | `CRON_SECRET` o bypass en dev | `auth.getUser()` + JWT del usuario |
| **Rol de DB** | `service_role` (bypass RLS) | Usuario autenticado + `service_role` para Vault |
| **Output** | JSON síncrono | `text/event-stream` (streaming) |
| **Tolerancia a fallos** | Alta (batch, retry, audit log) | Baja (responde directo al usuario) |
| **Duración** | Corta (< 30s por tick) | Puede ser larga (streaming de AI) |

Separarlas permite:

1. **Escalar independientemente** — si el scheduler está procesando 100 posts, no bloquea a un usuario generando AI.
2. **Segregar responsabilidades** — el scheduler usa `service_role` (es crítico que pueda hacer todo), mientras `gen-ai-studio` valúa al usuario primero.
3. **Mantener el código limpio** — cada función tiene un propósito único y archivos propios.

---

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Project                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   PostgreSQL                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │   │
│  │  │ scheduled_   │  │  audit_log   │  │  post_     │ │   │
│  │  │ posts        │  │  (immutable) │  │  metrics   │ │   │
│  │  └──────┬───────┘  └──────────────┘  └────────────┘ │   │
│  │         │                                            │   │
│  │  ┌──────▼───────┐  ┌──────────────┐  ┌────────────┐ │   │
│  │  │  channels    │  │  assets      │  │  vault     │ │   │
│  │  └──────────────┘  └──────────────┘  └────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                            │
│  ┌──────────────────┐    ┌──────────────────────┐          │
│  │  Edge Functions   │    │                      │          │
│  │                   │    │                      │          │
│  │  ┌──────────┐    │    │  Frontend (Angular)  │          │
│  │  │scheduler │◄───┤    │                      │          │
│  │  │ (cron)   │    │    │  ┌────────────────┐  │          │
│  │  └──────────┘    │    │  │ Gen AI Studio  │──┼────────► │
│  │                   │    │  │ (User-facing)  │  │          │
│  │  ┌──────────┐    │    │  └────────────────┘  │          │
│  │  │gen-ai-   │◄───┼────┤                      │          │
│  │  │studio    │    │    └──────────────────────┘          │
│  │  └──────────┘    │                                      │
│  │                   │                                      │
│  │  ┌──────────┐    │                                      │
│  │  │metrics-  │◄───┤ (cron, polls Telegram)              │
│  │  │poller    │    │                                      │
│  │  └──────────┘    │                                      │
│  └──────────────────┘                                      │
│                                                            │
│  ┌──────────────────────────────────────────────────┐      │
│  │  Shared Services (_shared/)                      │      │
│  │  GenAIService · KeyVaultService · MetricsService │      │
│  │  AuthService · AssetStorage · RetryEngine        │      │
│  │  AlertService · Publisher (Telegram) · Providers │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## Edge Functions en Detalle

### 1. `scheduler` — Motor de Publicación

**Archivo**: `supabase/functions/scheduler/index.ts` (745 líneas)

**Invocación**: Cada 1 minuto vía `pg_cron` → `pg_net.http_post()`.

**Flujo de ejecución** (`runTick`):

1. **Resetear posts zombies** → Posts atascados en estado `publishing` por >5 min se revierten a `scheduled`.
2. **Fetch de posts debidos** → Consulta `scheduled_posts WHERE status = 'scheduled' AND scheduled_at <= now()` (límite 100).
3. **Procesar cada post**:
   - Optimistic lock: `UPDATE ... SET status = 'publishing' WHERE status = 'scheduled'`
   - Resolver bot token: environment variable → Supabase Vault
   - Publicar a Telegram Bot API
   - Actualizar estado: `published` | `retrying` (con exponential backoff) | `failed`
   - Escribir en `audit_log` (inmutable)

**Resolución de tokens**: Prioridad 1) `TELEGRAM_BOT_TOKEN` global en env, 2) Vault per-user via `vault_get_secret`.

**Mecanismo antiduplicados**: El optimistic lock (`WHERE status = 'scheduled'`) previene que dos workers concurrentes publiquen el mismo post.

---

### 2. `gen-ai-studio` — Gateway de AI

**Archivo**: `supabase/functions/gen-ai-studio/index.ts` (126 líneas)

**Invocación**: Desde el frontend Angular con JWT del usuario.

**Autenticación**:
1. Crea cliente Supabase con el token del usuario (`Authorization` header).
2. Llama a `supabaseClient.auth.getUser()` para validar.
3. Verifica que `payload.userId` coincida con `user.id` (previene spoofing).

**Acciones**:

| Acción | Método | Descripción |
|--------|--------|-------------|
| `streamGenerate` | `genAI.streamGenerate()` | Streaming de texto AI vía SSE |
| `brainstorm` | `genAI.brainstorm()` | Genera ideas creativas |
| `parseCampaign` | `genAI.parseCampaign()` | Parsea campañas desde texto libre |
| `generateImage` | `genAI.generateImage()` | Genera imágenes con AI |

**Streaming**: Usa `TransformStream` + `text/event-stream` para enviar tokens en tiempo real al frontend.

**Servicios utilizados**:
- `GenAIServiceImpl` → Texto/Imagen vía OpenRouter + Gemini
- `KeyVaultServiceImpl` → API keys desde Vault
- `AssetStorageServiceImpl` → Guardar imágenes generadas en Storage
- `MockBillingService` → Límites de uso (temporal hasta que Dev 3 lo implemente)

---

### 3. `metrics-poller` — Recolección de Métricas

**Archivo**: `supabase/functions/metrics-poller/index.ts` (127 líneas)

**Invocación**: Cron job, protegido con `CRON_SECRET`.

**Flujo**:
1. Busca posts publicados en Telegram en los últimos 7 días.
2. Obtiene tokens de Telegram desde `channels.credentials`.
3. Llama a `getUpdates` de Telegram API.
4. Ingesta métricas vía `MetricsServiceImpl` → tabla `post_metrics`.

---

## Servicios Compartidos (`_shared/`)

| Servicio | Archivo | Propósito |
|----------|---------|-----------|
| `GenAIServiceImpl` | `gen-ai.service.ts` | Generación de texto/imagen vía OpenRouter/Gemini |
| `KeyVaultServiceImpl` | `key-vault.service.ts` | CRUD de secretos en Supabase Vault |
| `AssetStorageServiceImpl` | `asset-storage.service.ts` | Upload/delete/signed URLs en Storage |
| `MetricsServiceImpl` | `metrics.service.ts` | Ingesta y consulta de métricas de engagement |
| `AuthServiceImpl` | `auth.service.ts` | SignUp, SignIn, OAuth, session management |
| `AlertServiceImpl` | `alert.service.ts` | Notificaciones y real-time subscriptions |
| `RetryEngine` | `retry-engine.ts` | Políticas de retry con exponential backoff |
| `SocialMediaPublisher` | `publisher/social-media-publisher.interface.ts` | Interfaz abstracta de publicación multiplataforma |
| `TelegramPublisher` | `publisher/telegram.publisher.ts` | Implementación Telegram Bot API |
| `Providers` | `providers.ts` | Router de AI providers con fallback automático |

---

## Base de Datos

El esquema completo de PostgreSQL está documentado en:

> **[DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)**

Incluye:
- 8 tablas principales (`users_profile`, `channels`, `assets`, `recurrence_rules`, `scheduled_posts`, `audit_log`, `notifications`, `post_metrics`)
- 4 Vault RPCs
- Políticas RLS para tenant isolation
- 6 índices de performance
- Triggers de inmutabilidad y auto-actualización
- Configuración del cron job `directorai-publish-cron`
- Storage policies para el bucket `assets`

---

## Telegram Publisher

La publicación a Telegram soporta estos endpoints vía Bot API:

| Tipo | Endpoint | Payload |
|------|----------|---------|
| Texto | `sendMessage` | `{ text, parse_mode: 'Markdown', disable_web_page_preview }` |
| Foto | `sendPhoto` | `{ photo, caption }` |
| Video | `sendVideo` | `{ video, caption }` |
| Audio | `sendAudio` | `{ audio, caption }` |
| Documento | `sendDocument` | `{ document, caption }` |

**Manejo de errores**:
- `401` → `INVALID_TOKEN` (no retry)
- `5xx` → `NETWORK_ERROR` (retryable)
- `4xx` → `CONTENT_REJECTED` (no retry)
- Timeout/DNS → `NETWORK_ERROR` (retryable)

**Formateo**: HTML escaping de `&`, `<`, `>` para Markdown de Telegram.

---

## Retry Engine

Política de exponential backoff para posts que fallan con error transitorio:

```
backoff = min(RETRY_BACKOFF_BASE_MS × 2^attempt, RETRY_BACKOFF_MAX_MS)
        = min(60_000 × 2^attempt, 3_600_000)
```

Intentos: `attempt 0 → 1 min`, `attempt 1 → 2 min`, `attempt 2 → 4 min`, ..., max 1 hora.

El límite de reintentos por post es `max_retries` (default: 3).

---

## AI Providers

Configuración en `_shared/providers.json`:

**Texto**: Groq (LLaMA), Cerebras, OpenRouter (o3-mini), Gemini, HuggingFace
**Imagen**: OpenRouter (Stable Diffusion), Pollinations, Gemini

Fallback automático: si el primary falla, se prueba el siguiente en la lista.

---

## Variables de Entorno Requeridas

| Variable | Dónde se usa |
|----------|-------------|
| `SUPABASE_URL` | Todas las edge functions |
| `SUPABASE_SERVICE_ROLE_KEY` | scheduler, metrics-poller |
| `SUPABASE_ANON_KEY` | gen-ai-studio |
| `CRON_SECRET` | scheduler, metrics-poller (auth) |
| `TELEGRAM_BOT_TOKEN` | scheduler (global token) |
| `OPENROUTER_API_KEY` | gen-ai-studio |
| `GEMINI_API_KEY` | gen-ai-studio |
