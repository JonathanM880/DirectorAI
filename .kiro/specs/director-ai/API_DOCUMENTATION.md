# DirectorAI API Documentation

Welcome to the **DirectorAI API Reference**. This documentation details all endpoints, data structures, authentication mechanisms, and storage parameters for the DirectorAI platform.

---

## Table of Contents

- [Authentication & Headers](#authentication--headers)
  - [Client Authentication](#client-authentication)
  - [Internal System Authentication](#internal-system-authentication)
  - [PostgREST Headers](#postgrest-headers)
- [1. Custom Edge Functions (`/functions/v1`)](#1-custom-edge-functions-functionsv1)
  - [`POST /functions/v1/gen-ai-studio`](#post-functionsv1gen-ai-studio)
    - [Action: `streamGenerate`](#action-streamgenerate)
    - [Action: `brainstorm`](#action-brainstorm)
    - [Action: `generateImage`](#action-generateimage)
  - [`POST /functions/v1/metrics-poller`](#post-functionsv1metrics-poller)
  - [`POST /functions/v1/scheduler`](#post-functionsv1scheduler)
- [2. Storage API (`/storage/v1`)](#2-storage-api-storagev1)
  - [`POST /storage/v1/object/user-assets/{path}`](#post-storagev1objectuser-assetspath)
  - [`DELETE /storage/v1/object/user-assets`](#delete-storagev1objectuser-assets)
  - [`POST /storage/v1/object/sign/user-assets/{path}`](#post-storagev1objectsignuser-assetspath)
- [3. Database REST CRUD API (`/rest/v1`)](#3-database-rest-crud-api-restv1)
  - [Global Querying Options](#global-querying-options)
  - [`/rest/v1/users_profile`](#restv1users_profile)
  - [`/rest/v1/channels`](#restv1channels)
  - [`/rest/v1/assets`](#restv1assets)
  - [`/rest/v1/recurrence_rules`](#restv1recurrence_rules)
  - [`/rest/v1/scheduled_posts`](#restv1scheduled_posts)
  - [`/rest/v1/audit_log`](#restv1audit_log)
  - [`/rest/v1/subscriptions`](#restv1subscriptions)
  - [`/rest/v1/notifications`](#restv1notifications)
  - [`/rest/v1/post_metrics`](#restv1post_metrics)
- [Notes for the Team](#notes-for-the-team)
  - [Critical Security/Execution Bug in KeyVaultServiceImpl](#critical-securityexecution-bug-in-keyvaultserviceimpl)
  - [Storage Bucket Inconsistency](#storage-bucket-inconsistency)
  - [Dead / Unimplemented Frontend Call: `parseCampaign`](#dead--unimplemented-frontend-call-parsecampaign)

---

## Authentication & Headers

DirectorAI secures endpoints using two main authentication paradigms, depending on whether the client is a user frontend or an internal cron system.

### Client Authentication
For user-initiated requests, authentication relies on JSON Web Tokens (JWT) issued by Supabase Auth.
*   **Header Name**: `Authorization`
*   **Format**: `Bearer <USER_JWT>`
*   **Audience**: `authenticated` users

### Internal System Authentication
Cron tasks and daemon workers authenticate using a static shared token.
*   **Header Name**: `Authorization`
*   **Format**: `Bearer <CRON_SECRET>`
*   **Audience**: Internal schedulers and monitoring processes

### PostgREST Headers
Every request to the Database CRUD API must include:
*   `apikey`: `<SUPABASE_ANON_KEY>`
*   `Authorization`: `Bearer <USER_JWT>` (defines RLS visibility scope)
*   `Content-Type`: `application/json`
*   `Prefer`: Specifies response representation preferences.
    *   `return=representation`: Returns the affected rows (standard for insertions and updates).
    *   `return=minimal`: Suppresses response payloads (standard for high-throughput commands).

---

## 1. Custom Edge Functions (`/functions/v1`)

Edge functions are deployed in Deno runtimes and manage orchestration that cannot be performed in simple database rules.

### `POST /functions/v1/gen-ai-studio`
Handles generative copy streaming, topic brainstorming, and image creation. Routed by the `action` field in the request body.

#### Headers
```http
Authorization: Bearer <USER_JWT>
Content-Type: application/json
```

---

#### Action: `streamGenerate`
Streams generated social copy chunk-by-chunk using Server-Sent Events (SSE).

##### Request Body
```json
{
  "action": "streamGenerate",
  "payload": {
    "userId": "76d8b9f1-3a05-4c0c-80a5-29658fa9e530",
    "prompt": "Create a post celebrating our team milestone.",
    "platform": "telegram",
    "tone": "casual",
    "maxLength": 280
  }
}
```

| Field Name | Type | Required/Optional | Validation / Notes |
| :--- | :--- | :--- | :--- |
| `action` | `string` | **Required** | Must be `"streamGenerate"`. |
| `payload.userId` | `string` | **Required** | Must match the authenticated user UUID. |
| `payload.prompt` | `string` | **Required** | Instructions to steer the AI generator. |
| `payload.platform` | `string` | **Required** | Must be one of: `"telegram"`, `"twitter"`, `"instagram"`, `"linkedin"`. |
| `payload.tone` | `string` | Optional | Tone: `"professional"`, `"casual"`, `"promotional"`, `"educational"`, `"urgent"`. Default: `"professional"`. |
| `payload.referenceAssetIds` | `string[]` | Optional | Array of asset UUIDs to feed in as context. |
| `payload.maxLength` | `number` | Optional | Limits character count of generated text. |

##### Success Response
*   **Status**: `200 OK`
*   **Content-Type**: `text/event-stream`
*   **Body**: Continuous raw text chunks representing the generated post content.

*Example SSE stream output:*
```text
We
are
so
proud
to
announce
reaching
our
milestone!
🎉
Thank
you
all!
```

*Side Effect*: Upon completion, the system automatically:
1.  Saves the complete output text to a `.txt` file inside Supabase Storage.
2.  Inserts a record in the `assets` table (with `source = 'ai_generated'`).
3.  Increments the user's `ai_generations_this_month` usage count in the `subscriptions` table.

##### Error Responses
*   **401 Unauthorized**: Missing or invalid Authorization JWT.
    ```json
    { "error": "Unauthorized" }
    ```
*   **400 Bad Request**: Quota exceeded or plan limits reached.
    ```json
    { "error": "AI generation quota exceeded" }
    ```
*   **400 Bad Request**: Generative feature is not enabled for the user's subscription tier.
    ```json
    { "error": "Feature ai_generation is not available on your plan" }
    ```

---

#### Action: `brainstorm`
Brainstorms a list of ideas matching a target platform and topic.

##### Request Body
```json
{
  "action": "brainstorm",
  "payload": {
    "userId": "76d8b9f1-3a05-4c0c-80a5-29658fa9e530",
    "topic": "Supabase indexing performance tricks",
    "count": 3,
    "platform": "twitter"
  }
}
```

| Field Name | Type | Required/Optional | Validation / Notes |
| :--- | :--- | :--- | :--- |
| `action` | `string` | **Required** | Must be `"brainstorm"`. |
| `payload.userId` | `string` | **Required** | Must match the authenticated user UUID. |
| `payload.topic` | `string` | **Required** | General topic to brainstorm. |
| `payload.count` | `number` | **Required** | Number of ideas to return. |
| `payload.platform` | `string` | **Required** | One of: `"telegram"`, `"twitter"`, `"instagram"`, `"linkedin"`. |

##### Success Response
*   **Status**: `200 OK`
*   **Content-Type**: `application/json`

*Example:*
```json
{
  "ideas": [
    "Share a before/after query plan demonstrating EXPLAIN ANALYZE on a large table.",
    "Explain when to use Partial Indexes to save disk space and improve write throughput.",
    "Create a thread explaining why index order matters for composite B-Tree indexes."
  ],
  "platform": "twitter",
  "count": 3
}
```

##### Error Responses
*   **401 Unauthorized**: Missing/invalid token.
*   **400 Bad Request**: Invalid JSON request or general LLM error.
    ```json
    { "error": "OpenRouter API error: Bad Request" }
    ```

---

#### Action: `generateImage`
Generates a new image based on a descriptive prompt.

##### Request Body
```json
{
  "action": "generateImage",
  "payload": {
    "userId": "76d8b9f1-3a05-4c0c-80a5-29658fa9e530",
    "prompt": "Fitted workspace in cyberpunk aesthetic, high resolution render",
    "style": "cinematic",
    "aspectRatio": "16:9"
  }
}
```

| Field Name | Type | Required/Optional | Validation / Notes |
| :--- | :--- | :--- | :--- |
| `action` | `string` | **Required** | Must be `"generateImage"`. |
| `payload.userId` | `string` | **Required** | Must match the authenticated user UUID. |
| `payload.prompt` | `string` | **Required** | Image prompt instructions. |
| `payload.style` | `string` | Optional | E.g. `"cinematic"`, `"minimalist"`, `"sketch"`, `"photo"`. |
| `payload.aspectRatio` | `string` | Optional | Must be one of: `"1:1"`, `"16:9"`, `"9:16"`, `"4:3"`. Default: `"1:1"`. |

##### Success Response
*   **Status**: `200 OK`
*   **Content-Type**: `application/json`

*Example:*
```json
{
  "id": "2d1f7371-b0e6-42d7-9877-bb890fa24fe3",
  "url": "https://openrouter.ai/api/v1/outputs/img_123.jpg",
  "prompt": "Fitted workspace in cyberpunk aesthetic, high resolution render",
  "model": "openai/dall-e-3",
  "createdAt": "2026-06-28T17:16:30.000Z"
}
```

---

### `POST /functions/v1/metrics-poller`
Triggered by an external schedule (cron job) to fetch views, reaction metrics, and updates for published Telegram posts in the last 7 days, then updates the `post_metrics` database table.

#### Headers
```http
Authorization: Bearer <CRON_SECRET>
```

##### Success Response
*   **Status**: `200 OK`
*   **Content-Type**: `application/json`

*Example:*
```json
{
  "success": true,
  "processed": 1,
  "details": [
    {
      "postId": "550e8400-e29b-41d4-a716-446655440000",
      "platformMessageId": "telegram_msg_987",
      "views": 62,
      "reactions": { "👍": 3, "🔥": 1 }
    }
  ]
}
```

##### Error Responses
*   **405 Method Not Allowed**: Invoked with a method other than `POST`.
*   **401 Unauthorized**: Authorization header does not match the system's `CRON_SECRET`.
*   **500 Internal Server Error**: Database connection error, or failed connection to platform APIs.
    ```json
    { "error": "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set" }
    ```

---

### `POST /functions/v1/scheduler`
Cron-triggered edge function that executes a single "tick" of the social media scheduling engine. It queries the database for pending scheduled posts, dispatches them to social API clients (e.g. Telegram bot API), manages retries, updates post lifecycles, and triggers recurrence instance creation.

#### Headers
```http
Authorization: Bearer <CRON_SECRET>
```

##### Success Response
*   **Status**: `200 OK`
*   **Content-Type**: `application/json`

*Example:*
```json
{
  "processed": 3,
  "succeeded": 2,
  "failed": 0,
  "retryQueued": 1
}
```

##### Error Responses
*   **405 Method Not Allowed**: Request method is not `POST`.
*   **401 Unauthorized**: Invalid or missing `CRON_SECRET` bearer token.
*   **500 Internal Server Error**: Scheduler loop failed.

---

## 2. Storage API (`/storage/v1`)

Secured files (such as photo attachments, videos, and generated texts) are stored in Supabase Storage. The primary bucket is `user-assets` (frontend uploads) or `assets` (AI-generated files).

### `POST /storage/v1/object/user-assets/{path}`
Uploads a binary media file to the storage bucket.

#### Headers
```http
Authorization: Bearer <USER_JWT>
Content-Type: <mime-type>
```

#### Path Parameters
*   `path` (*string*, **Required**): Target file destination path.
    *   *Frontend format*: `users/{userId}/assets/{uuid}.{ext}`
    *   *AI-generated format*: `${userId}/${id}-${filename}`

#### Request Body
Raw file binary bytes.

##### Success Response
*   **Status**: `200 OK`
*   **Content-Type**: `application/json`

*Example:*
```json
{
  "Id": "85a12918-2ad1-4d1a-ba63-228795da3c22",
  "Key": "user-assets/users/76d8b9f1-3a05-4c0c-80a5-29658fa9e530/assets/f47ac10b-58cc-4372-a567-0e02b2c3d479.png"
}
```

##### Error Responses
*   **400 Bad Request**: File violates the validation constraints defined below.

| MIME Type | Supported extension | File Size Limit |
| :--- | :--- | :--- |
| `image/jpeg` | `.jpg`, `.jpeg` | 20 MB |
| `image/png` | `.png` | 20 MB |
| `image/webp` | `.webp` | 20 MB |
| `image/gif` | `.gif` | 20 MB |
| `video/mp4` | `.mp4` | 200 MB |
| `video/webm` | `.webm` | 200 MB |
| `audio/mpeg` | `.mp3` | 50 MB |
| `audio/wav` | `.wav` | 50 MB |
| `application/pdf`| `.pdf` | 50 MB |
| `text/plain` | `.txt` | 1 MB |

---

### `DELETE /storage/v1/object/user-assets`
Removes one or more uploaded file objects from the storage bucket.

#### Headers
```http
Authorization: Bearer <USER_JWT>
Content-Type: application/json
```

#### Request Body
```json
{
  "prefixes": [
    "users/76d8b9f1-3a05-4c0c-80a5-29658fa9e530/assets/f47ac10b-58cc-4372-a567-0e02b2c3d479.png"
  ]
}
```

##### Success Response
*   **Status**: `200 OK`
*   **Content-Type**: `application/json`

*Example:*
```json
[
  {
    "name": "users/76d8b9f1-3a05-4c0c-80a5-29658fa9e530/assets/f47ac10b-58cc-4372-a567-0e02b2c3d479.png",
    "id": "85a12918-2ad1-4d1a-ba63-228795da3c22"
  }
]
```

---

### `POST /storage/v1/object/sign/user-assets/{path}`
Generates a short-lived, signed preview URL for viewing private asset content.

#### Headers
```http
Authorization: Bearer <USER_JWT>
Content-Type: application/json
```

#### Path Parameters
*   `path` (*string*, **Required**): Storage path to sign.

#### Request Body
```json
{
  "expiresIn": 3600
}
```

##### Success Response
*   **Status**: `200 OK`
*   **Content-Type**: `application/json`

*Example:*
```json
{
  "signedURL": "https://supabase.co/storage/v1/object/sign/user-assets/users/76d...token=abcde"
}
```

---

## 3. Database REST CRUD API (`/rest/v1`)

Database schemas are directly accessible via PostgREST, mapped to matching endpoints under `/rest/v1/<table_name>`. Row Level Security (RLS) is strictly enforced to isolate client operations.

### Global Querying Options
PostgREST allows advanced query parameters on all database tables:
*   **Selecting fields**: `?select=id,filename,size_bytes`
*   **Filtering**: `?column_name=eq.value`, `?column_name=gte.100`, `?array_column=cs.{element}` (contains)
*   **Sorting**: `?order=created_at.desc`
*   **Pagination**: `?limit=10&offset=20`
*   **Single object selection**: Include header `Accept: application/vnd.pgrst.object+json`.

---

### `/rest/v1/users_profile`
Contains extended profile details for authenticated platform users.

#### Authorization & RLS
*   **Policy**: `users_profile_user_scope`
*   **Read/Write**: Restricted to profile owner (`id = auth.uid()`). Update/Delete cascading matches the main authentication user record.

#### Schema
| Field Name | DB Type | Required/Optional | Constraints / Default |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | **Required** | Primary Key, maps to `auth.users(id)` |
| `email` | `TEXT` | Optional | Immutable after row insertion |
| `display_name` | `TEXT` | Optional | Profile name shown in UI |
| `avatar_url` | `TEXT` | Optional | Link to user profile image |
| `timezone` | `TEXT` | **Required** | Timezone string. Default: `'UTC'` |
| `plan_id` | `TEXT` | **Required** | Tier: `"starter"`, `"professional"`, `"agency"`. Default: `"starter"` |
| `onboarding_completed` | `BOOLEAN` | **Required** | True once onboarding is finished. Default: `false` |
| `created_at` | `TIMESTAMPTZ` | Generated | Server-populated timestamp |
| `updated_at` | `TIMESTAMPTZ` | Generated | Automatically updated on row edits |

#### Examples

##### `GET /rest/v1/users_profile?select=*`
Retrieves the logged-in user's profile.

*Success Response (200 OK):*
```json
[
  {
    "id": "76d8b9f1-3a05-4c0c-80a5-29658fa9e530",
    "email": "developer@directorai.com",
    "display_name": "Dev Team",
    "avatar_url": "https://supabase.co/storage/v1/object/public/avatars/dev.png",
    "timezone": "America/New_York",
    "plan_id": "professional",
    "onboarding_completed": true,
    "created_at": "2026-06-28T12:00:00Z",
    "updated_at": "2026-06-28T12:05:00Z"
  }
]
```

##### `PATCH /rest/v1/users_profile?id=eq.76d8b9f1-3a05-4c0c-80a5-29658fa9e530`
Updates timezone or display name.

*Request Body:*
```json
{
  "display_name": "Antigravity Dev",
  "timezone": "America/Chicago"
}
```
*Success Response (204 No Content)*

---

### `/rest/v1/channels`
Stores configured social media channels (e.g., Telegram channels, Twitter profiles) linked to a user.

#### Authorization & RLS
*   **Policy**: `channels_user_scope`
*   **Read/Write**: Restricted to channel owner (`user_id = auth.uid()`).
*   **Database Constraint**: Unique combination of `(user_id, platform, channel_identifier)`.

#### Schema
| Field Name | DB Type | Required/Optional | Constraints / Default |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | Optional | Primary Key, defaults to `gen_random_uuid()` |
| `user_id` | `UUID` | **Required** | Foreign key to `users_profile.id` |
| `platform` | `TEXT` | **Required** | One of: `"telegram"`, `"twitter"`, `"instagram"`, `"linkedin"` |
| `name` | `TEXT` | **Required** | Display label for UI |
| `channel_identifier` | `TEXT` | **Required** | E.g. `@my_telegram_channel` or channel ID |
| `is_active` | `BOOLEAN` | **Required** | Defines whether posts can deploy. Default: `true` |
| `created_at` | `TIMESTAMPTZ` | Generated | Server-populated timestamp |

#### Examples

##### `GET /rest/v1/channels`
Lists all active social destinations for the current user.

*Success Response (200 OK):*
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "76d8b9f1-3a05-4c0c-80a5-29658fa9e530",
    "platform": "telegram",
    "name": "Official Telegram",
    "channel_identifier": "@director_ai_official",
    "is_active": true,
    "created_at": "2026-06-28T12:00:00Z"
  }
]
```

##### `POST /rest/v1/channels`
Saves a new publishing channel.

*Request Body:*
```json
{
  "user_id": "76d8b9f1-3a05-4c0c-80a5-29658fa9e530",
  "platform": "telegram",
  "name": "Dev Updates Channel",
  "channel_identifier": "@director_ai_dev",
  "is_active": true
}
```
*Success Response (201 Created)*

---

### `/rest/v1/assets`
Maintains records and metadata details for uploaded and generated images, videos, audio clips, and document attachments.

#### Authorization & RLS
*   **Policy**: `assets_user_scope`
*   **Read/Write**: Restricted to owner (`user_id = auth.uid()`).

#### Schema
| Field Name | DB Type | Required/Optional | Constraints / Default |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | Optional | Primary Key, defaults to `gen_random_uuid()` |
| `user_id` | `UUID` | **Required** | Foreign key to `users_profile.id` |
| `filename` | `TEXT` | **Required** | Name of target asset file |
| `mime_type` | `TEXT` | **Required** | Valid MIME type (verified against size limit checks) |
| `size_bytes` | `BIGINT` | **Required** | File size in bytes |
| `storage_path` | `TEXT` | **Required** | Path pointer in Supabase Storage |
| `folder` | `TEXT` | **Required** | Virtual folder for organizing UI structure. Default: `'/'` |
| `tags` | `TEXT[]` | **Required** | String tags array. Default: `'{}'` |
| `source` | `TEXT` | **Required** | Origin type: `"user_upload"` or `"ai_generated"` |
| `generation_prompt` | `TEXT` | Optional | Prompt that created the file (if `source = 'ai_generated'`) |
| `ai_model` | `TEXT` | Optional | Model identifier used to create asset (if `source = 'ai_generated'`) |
| `created_at` | `TIMESTAMPTZ` | Generated | Server-populated timestamp |

#### Examples

##### `GET /rest/v1/assets?tags=cs.{ai,telegram}`
Finds AI-generated telegram assets for the user.

*Success Response (200 OK):*
```json
[
  {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "user_id": "76d8b9f1-3a05-4c0c-80a5-29658fa9e530",
    "filename": "generated-banner.png",
    "mime_type": "image/png",
    "size_bytes": 1048576,
    "storage_path": "users/76d8b9f1-3a05-4c0c-80a5-29658fa9e530/assets/f47ac10b-58cc-4372-a567-0e02b2c3d479.png",
    "folder": "/campaigns",
    "tags": ["ai", "telegram"],
    "source": "ai_generated",
    "generation_prompt": "A modern futuristic workspace",
    "ai_model": "openai/dall-e-3",
    "created_at": "2026-06-28T12:10:00Z"
  }
]
```

---

### `/rest/v1/recurrence_rules`
Defines repetition patterns (e.g. daily, weekly) for automated posts.

#### Authorization & RLS
*   **Policy**: `recurrence_rules_user_scope`
*   **Read/Write**: Restricted to owner (`user_id = auth.uid()`).

#### Schema
| Field Name | DB Type | Required/Optional | Constraints / Default |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | Optional | Primary Key, defaults to `gen_random_uuid()` |
| `user_id` | `UUID` | **Required** | Foreign key to `users_profile.id` |
| `frequency` | `TEXT` | **Required** | Range: `"daily"`, `"weekly"`, `"monthly"` |
| `interval` | `INTEGER` | **Required** | Period frequency interval. Default: `1` |
| `days_of_week` | `INTEGER[]` | Optional | Weekly ISO day indicators: `[1..7]` (Monday..Sunday) |
| `end_date` | `TIMESTAMPTZ` | Optional | Ending boundary date for recurrence checks |
| `max_occurrences` | `INTEGER` | Optional | Maximum number of repeating instances to produce |
| `created_at` | `TIMESTAMPTZ` | Generated | Server-populated timestamp |

#### Examples

##### `POST /rest/v1/recurrence_rules`
Sets up a recurrence pattern that triggers every Monday and Thursday.

*Request Body:*
```json
{
  "user_id": "76d8b9f1-3a05-4c0c-80a5-29658fa9e530",
  "frequency": "weekly",
  "interval": 1,
  "days_of_week": [1, 4],
  "max_occurrences": 10
}
```
*Success Response (201 Created)*

---

### `/rest/v1/scheduled_posts`
Stores planned, draft, publishing, or retry post entities, tracking publishing lifecycles.

#### Authorization & RLS
*   **Policy**: `scheduled_posts_user_scope`
*   **Read/Write**: Restricted to owner (`user_id = auth.uid()`).

#### Schema
| Field Name | DB Type | Required/Optional | Constraints / Default |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | Optional | Primary Key, defaults to `gen_random_uuid()` |
| `user_id` | `UUID` | **Required** | Foreign key to `users_profile.id` |
| `channel_id` | `UUID` | **Required** | Foreign key to `channels.id` |
| `text_content` | `TEXT` | Optional | Text to publish. Max length depends on platform capabilities |
| `media_asset_ids` | `UUID[]` | **Required** | Array of asset UUIDs linked to post. Default: `'{}'` |
| `media_type` | `TEXT` | Optional | Range: `"photo"`, `"video"`, `"audio"`, `"document"` |
| `scheduled_at` | `TIMESTAMPTZ` | **Required** | Date and time target to publish |
| `status` | `TEXT` | **Required** | Range: `"draft"`, `"scheduled"`, `"publishing"`, `"published"`, `"retrying"`, `"failed"`, `"cancelled"` |
| `retry_count` | `INTEGER` | **Required** | Default: `0` |
| `max_retries` | `INTEGER` | **Required** | Default: `3` |
| `platform_message_id`| `TEXT` | Optional | Platform unique message identifier (assigned after publish) |
| `published_at` | `TIMESTAMPTZ` | Optional | Date and time actually published |
| `next_retry_at` | `TIMESTAMPTZ` | Optional | Time scheduled for next publishing retry |
| `recurrence_rule_id` | `UUID` | Optional | Reference to recurring rule (if recurring post) |
| `parent_post_id` | `UUID` | Optional | References parent post UUID (if generated by a repeating rule) |
| `created_at` | `TIMESTAMPTZ` | Generated | Server-populated timestamp |
| `updated_at` | `TIMESTAMPTZ` | Generated | Automatically updated on row updates |

#### Examples

##### `GET /rest/v1/scheduled_posts?status=eq.scheduled`
Retrieves all pending scheduled posts for the user.

*Success Response (200 OK):*
```json
[
  {
    "id": "aa1a8400-e29b-41d4-a716-446655440111",
    "user_id": "76d8b9f1-3a05-4c0c-80a5-29658fa9e530",
    "channel_id": "550e8400-e29b-41d4-a716-446655440000",
    "text_content": "Don't forget to test your index queries!",
    "media_asset_ids": [],
    "media_type": null,
    "scheduled_at": "2026-06-29T10:00:00Z",
    "status": "scheduled",
    "retry_count": 0,
    "max_retries": 3,
    "platform_message_id": null,
    "published_at": null,
    "next_retry_at": null,
    "recurrence_rule_id": null,
    "parent_post_id": null,
    "created_at": "2026-06-28T12:00:00Z",
    "updated_at": "2026-06-28T12:00:00Z"
  }
]
```

---

### `/rest/v1/audit_log`
Immutable record of system changes, publishes, failures, retries, edits, and deletions.

#### Authorization & RLS
*   **Select Policy**: `audit_log_select_owner` -> Owner can read (`user_id = auth.uid()`).
*   **Insert Policy**: `audit_log_insert_service_role` -> Restricted to `service_role`. User JWT is blocked.
*   **Update/Delete Policy**: Denied for all roles.
*   **Database trigger**: `trg_audit_log_immutable` raises an exception block on any UPDATE or DELETE attempt.
*   **Server-enforced field**: Trigger `trg_audit_log_occurred_at` overrides `occurred_at` to `now()` on insertion.

#### Schema
| Field Name | DB Type | Required/Optional | Constraints / Default |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | Optional | Primary Key, defaults to `gen_random_uuid()` |
| `user_id` | `UUID` | **Required** | Foreign key to `users_profile.id` |
| `post_id` | `UUID` | Optional | Foreign key references `scheduled_posts.id` |
| `action` | `TEXT` | **Required** | Range: `"published"`, `"failed"`, `"retried"`, `"cancelled"`, `"edited"`, `"deleted"` |
| `platform` | `TEXT` | **Required** | Targeted channel platform or `"vault"` |
| `platform_message_id`| `TEXT` | Optional | Platform unique message id |
| `error_code` | `TEXT` | Optional | Platform error code (e.g., `"RATE_LIMITED"`, `"INVALID_TOKEN"`) |
| `metadata` | `JSONB` | **Required** | Metadata JSON payload. Default: `'{}'` |
| `occurred_at` | `TIMESTAMPTZ` | Generated | Server-populated trigger timestamp (`now()`) |

#### Examples

##### `GET /rest/v1/audit_log?order=occurred_at.desc&limit=1`
Retrieves the most recent audit activity.

*Success Response (200 OK):*
```json
[
  {
    "id": "bc1e8400-e29b-41d4-a716-446655440222",
    "user_id": "76d8b9f1-3a05-4c0c-80a5-29658fa9e530",
    "post_id": "aa1a8400-e29b-41d4-a716-446655440111",
    "action": "published",
    "platform": "telegram",
    "platform_message_id": "msg_987654321",
    "error_code": null,
    "metadata": { "views": 0, "platform": "telegram" },
    "occurred_at": "2026-06-28T12:00:01Z"
  }
]
```

---

### `/rest/v1/subscriptions`
Tracks customer plan structures, limits, and usage counts.

#### Authorization & RLS
*   **Policy**: `subscriptions_user_scope`
*   **Read/Write**: Restricted to owner (`user_id = auth.uid()`).

#### Schema
| Field Name | DB Type | Required/Optional | Constraints / Default |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | Optional | Primary Key, defaults to `gen_random_uuid()` |
| `user_id` | `UUID` | **Required** | Foreign key to `users_profile.id` |
| `stripe_customer_id` | `TEXT` | **Required** | Stripe customer ID reference |
| `stripe_subscription_id`| `TEXT` | **Required** | Stripe subscription ID reference |
| `plan_id` | `TEXT` | **Required** | Range: `"starter"`, `"professional"`, `"agency"` |
| `status` | `TEXT` | **Required** | Range: `"active"`, `"past_due"`, `"cancelled"`, `"trialing"` |
| `current_period_start`| `TIMESTAMPTZ` | **Required** | Billing cycle start |
| `current_period_end` | `TIMESTAMPTZ` | **Required** | Billing cycle end |
| `cancel_at_period_end`| `BOOLEAN` | **Required** | Default: `false` |
| `ai_generations_this_month`| `INTEGER` | **Required** | Default: `0` |
| `posts_this_month` | `INTEGER` | **Required** | Default: `0` |
| `storage_used_bytes` | `BIGINT` | **Required** | Default: `0` |
| `updated_at` | `TIMESTAMPTZ` | Generated | Automatically updated on row edits |

#### Examples

##### `GET /rest/v1/subscriptions`
Retrieves subscription usage statistics for the user.

*Success Response (200 OK):*
```json
[
  {
    "id": "cd1e8400-e29b-41d4-a716-446655440333",
    "user_id": "76d8b9f1-3a05-4c0c-80a5-29658fa9e530",
    "stripe_customer_id": "cus_123456789",
    "stripe_subscription_id": "sub_987654321",
    "plan_id": "professional",
    "status": "active",
    "current_period_start": "2026-06-01T00:00:00Z",
    "current_period_end": "2026-07-01T00:00:00Z",
    "cancel_at_period_end": false,
    "ai_generations_this_month": 12,
    "posts_this_month": 45,
    "storage_used_bytes": 12400000,
    "updated_at": "2026-06-28T12:00:00Z"
  }
]
```

---

### `/rest/v1/notifications`
Stores user notifications (such as publish success, failure alerts, and payment updates) surfaced in the app's real-time feed.

#### Authorization & RLS
*   **Policy**: `notifications_user_scope`
*   **Read/Write**: Restricted to owner (`user_id = auth.uid()`).

#### Schema
| Field Name | DB Type | Required/Optional | Constraints / Default |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | Optional | Primary Key, defaults to `gen_random_uuid()` |
| `user_id` | `UUID` | **Required** | Foreign key references `users_profile.id` |
| `type` | `TEXT` | **Required** | Range: `"post_published"`, `"post_failed"`, `"post_retrying"`, `"retry_exhausted"`, `"subscription_renewed"`, `"subscription_expired"`, `"payment_failed"`, `"api_key_invalid"` |
| `severity` | `TEXT` | **Required** | Range: `"info"`, `"warning"`, `"error"`, `"success"` |
| `title` | `TEXT` | **Required** | Header label for UI toast/feed |
| `message` | `TEXT` | **Required** | Detailed description text |
| `metadata` | `JSONB` | **Required** | Supporting metadata payload. Default: `'{}'` |
| `read` | `BOOLEAN` | **Required** | Read status flag. Default: `false` |
| `created_at` | `TIMESTAMPTZ` | Generated | Server-populated timestamp |

#### Examples

##### `GET /rest/v1/notifications?read=eq.false`
Fetches all unread notifications.

*Success Response (200 OK):*
```json
[
  {
    "id": "de1e8400-e29b-41d4-a716-446655440444",
    "user_id": "76d8b9f1-3a05-4c0c-80a5-29658fa9e530",
    "type": "post_published",
    "severity": "success",
    "title": "Post Published",
    "message": "Your post has been successfully published to Telegram channel @director_ai_official",
    "metadata": { "postId": "aa1a8400-e29b-41d4-a716-446655440111", "platform": "telegram" },
    "read": false,
    "created_at": "2026-06-28T12:01:00Z"
  }
]
```

##### `PATCH /rest/v1/notifications?id=eq.de1e8400-e29b-41d4-a716-446655440444`
Marks a single notification as read.

*Request Body:*
```json
{
  "read": true
}
```
*Success Response (204 No Content)*

---

### `/rest/v1/post_metrics`
Holds analytics engagement snapshots per published post.

#### Authorization & RLS
*   **Select Policy**: `"Users can view metrics for their own posts"` -> Restricted to posts where `scheduled_posts.user_id = auth.uid()`.
*   **Write/Update Policy**: `"Service role can manage metrics"` -> Allowed ONLY for calls using the `service_role` credential. Clients using user JWTs are forbidden from writing.

#### Schema
| Field Name | DB Type | Required/Optional | Constraints / Default |
| :--- | :--- | :--- | :--- |
| `post_id` | `UUID` | **Required** | Primary Key, references `scheduled_posts.id` |
| `platform_message_id`| `TEXT` | **Required** | Message identifier on the target social platform |
| `views` | `INTEGER` | **Required** | Total views count. Default: `0` |
| `reactions` | `JSONB` | **Required** | React metrics count payload. Default: `'{}'::jsonb` |
| `forwards` | `INTEGER` | **Required** | Share forwards count. Default: `0` |
| `replies` | `INTEGER` | **Required** | Comments / replies count. Default: `0` |
| `measured_at` | `TIMESTAMPTZ` | **Required** | Timestamp metrics were fetched. Default: `now()` |
| `created_at` | `TIMESTAMPTZ` | Generated | Server-populated timestamp |
| `updated_at` | `TIMESTAMPTZ` | Generated | Automatically updated on row updates |

#### Examples

##### `GET /rest/v1/post_metrics?post_id=eq.aa1a8400-e29b-41d4-a716-446655440111`
Retrieves engagement counts for a target post.

*Success Response (200 OK):*
```json
[
  {
    "post_id": "aa1a8400-e29b-41d4-a716-446655440111",
    "platform_message_id": "telegram_msg_987",
    "views": 412,
    "reactions": { "👍": 15, "🔥": 8, "❤️": 4 },
    "forwards": 3,
    "replies": 0,
    "measured_at": "2026-06-28T14:30:00Z",
    "created_at": "2026-06-28T12:00:05Z",
    "updated_at": "2026-06-28T14:30:00Z"
  }
]
```

---

## Notes for the Team

While exploring the codebase, the following design discrepancies, dead ends, and bugs were identified.

### Critical Security/Execution Bug in KeyVaultServiceImpl
In `supabase/functions/gen-ai-studio/index.ts`, `supabaseClient` is initialized with the client's HTTP Authorization token (acting as the `authenticated` role). It then creates a `KeyVaultServiceImpl` using this client.
*   **The Issue**: The Vault database RPC functions (`vault_get_secret`, `vault_store_secret`) explicitly revoke execute permissions from all roles *except* `service_role` (in migration `013_vault_rpc.sql`, lines 93-96).
*   **Result**: When the `gen-ai-studio` function tries to fetch the OpenRouter API key using `keyVault.getKey(...)`, the RPC call will fail with a database permission error in production, blocking AI generation.
*   **Recommendation**: Initialize a separate `supabaseClient` inside the edge function using the `SUPABASE_SERVICE_ROLE_KEY` to handle all `KeyVaultService` calls.

### Storage Bucket Inconsistency
*   **The Issue**: The frontend application (`AssetUploadService` in `asset-upload.service.ts`, line 40) uploads binary assets into a storage bucket named `user-assets`. However, the backend service (`AssetStorageServiceImpl` in `asset-storage.service.ts`, line 67) attempts to write, fetch, and delete assets from a bucket named `assets`.
*   **Result**: Backend operations (such as asset deletion cleanup or AI generation persistence) will fail or read from the wrong bucket.
*   **Recommendation**: Align both client and backend codebases to use a single storage bucket name (e.g., `user-assets`).

### Dead / Unimplemented Frontend Call: `parseCampaign`
*   **The Issue**: The frontend Angular service `GenAiService` (`gen-ai.service.ts`, lines 85-91) exposes a `parseCampaign(request: any)` method that invokes the `gen-ai-studio` edge function with `{ action: 'parseCampaign', payload: request }`.
*   **Result**: The `gen-ai-studio` edge function does not implement this action block, meaning it will return a `400 Bad Request` with `{ "error": "Unknown action" }`.
*   **Recommendation**: Implement `parseCampaign` in the `gen-ai-studio` function or clean up the dead method from the frontend service.

### Unexposed Billing Webhook Endpoint
*   **The Issue**: While `BillingServiceImpl` implements a webhook processor (`handleWebhookEvent`) and has extensive integration tests (`stripe-webhook.integration.test.ts`), there is no deployed Supabase Edge Function that exposes this webhook to Stripe.
*   **Result**: Real stripe callbacks (such as payment failures, updates, and cancellations) cannot be received by the platform in its current state.
*   **Recommendation**: Deploy a dedicated `/functions/v1/stripe-webhook` edge function that instantiates `BillingServiceImpl` and passes request bodies directly into `handleWebhookEvent`.
