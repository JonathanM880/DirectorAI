# Database Schema — DirectorAI

Este documento describe todas las tablas, políticas RLS, índices, funciones y triggers implementados en la base de datos PostgreSQL de DirectorAI.

> **Referenciado desde:** [BACKEND_DOCUMENTATION.md](./BACKEND_DOCUMENTATION.md)

---

## Tabla de Contenido

- [1. Tablas](#1-tablas)
  - [1.1 `users_profile`](#11-users_profile)
  - [1.2 `channels`](#12-channels)
  - [1.3 `assets`](#13-assets)
  - [1.4 `recurrence_rules`](#14-recurrence_rules)
  - [1.5 `scheduled_posts`](#15-scheduled_posts)
  - [1.6 `audit_log`](#16-audit_log)
  - [1.7 `notifications`](#17-notifications)
  - [1.8 `post_metrics`](#18-post_metrics)
- [2. Vault RPCs](#2-vault-rpcs)
- [3. Row Level Security (RLS)](#3-row-level-security-rls)
- [4. Índices de Performance](#4-índices-de-performance)
- [5. Triggers y Funciones](#5-triggers-y-funciones)
- [6. Cron Job](#6-cron-job)
- [7. Storage Policies](#7-storage-policies)
- [8. Diagrama de Relaciones](#8-diagrama-de-relaciones)

---

## 1. Tablas

### 1.1 `users_profile`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | `UUID PK` | FK a `auth.users(id)`, ON DELETE CASCADE |
| `email` | `TEXT` | Desnormalizado de auth.users |
| `display_name` | `TEXT` | Nombre visible en UI |
| `avatar_url` | `TEXT` | URL del avatar |
| `timezone` | `TEXT` | IANA timezone (default `'UTC'`) |
| `plan_id` | `TEXT` | `'starter'`, `'professional'`, `'agency'` |
| `onboarding_completed` | `BOOLEAN` | Default `FALSE` |
| `created_at` | `TIMESTAMPTZ` | Server-set |
| `updated_at` | `TIMESTAMPTZ` | Auto-actualizado por trigger |

**PK**: `id` ← FK a `auth.users(id)` con CASCADE.

---

### 1.2 `channels`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | `UUID PK` | `gen_random_uuid()` |
| `user_id` | `UUID NOT NULL` | FK → `users_profile(id)` ON DELETE CASCADE |
| `platform` | `TEXT NOT NULL` | Ej: `'telegram'` |
| `name` | `TEXT NOT NULL` | Nombre del canal |
| `channel_identifier` | `TEXT NOT NULL` | Identificador en la plataforma (ej: `@mi_canal`) |
| `is_active` | `BOOLEAN` | Default `TRUE` |
| `created_at` | `TIMESTAMPTZ` | Server-set |

**Unique**: `(user_id, platform, channel_identifier)`

---

### 1.3 `assets`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | `UUID PK` | `gen_random_uuid()` |
| `user_id` | `UUID NOT NULL` | FK → `users_profile(id)` ON DELETE CASCADE |
| `filename` | `TEXT NOT NULL` | Nombre original |
| `mime_type` | `TEXT NOT NULL` | Ej: `'image/png'` |
| `size_bytes` | `BIGINT NOT NULL` | Tamaño en bytes |
| `storage_path` | `TEXT NOT NULL` | Path en Supabase Storage |
| `folder` | `TEXT` | Ruta virtual, default `'/'` |
| `tags` | `TEXT[]` | Tags, default `'{}'` |
| `source` | `TEXT NOT NULL` | CHECK: `'user_upload'` o `'ai_generated'` |
| `generation_prompt` | `TEXT` | Prompt usado si fue AI-generated |
| `ai_model` | `TEXT` | Modelo usado si fue AI-generated |
| `created_at` | `TIMESTAMPTZ` | Server-set |

---

### 1.4 `recurrence_rules`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | `UUID PK` | `gen_random_uuid()` |
| `user_id` | `UUID NOT NULL` | FK → `users_profile(id)` ON DELETE CASCADE |
| `frequency` | `TEXT NOT NULL` | CHECK: `'daily'`, `'weekly'`, `'monthly'` |
| `interval` | `INTEGER` | Default `1` |
| `days_of_week` | `INTEGER[]` | ISO weekdays `[1..7]` para weekly |
| `end_date` | `TIMESTAMPTZ` | Fecha límite de recurrencia |
| `max_occurrences` | `INTEGER` | Máximo de ocurrencias |
| `created_at` | `TIMESTAMPTZ` | Server-set |

---

### 1.5 `scheduled_posts`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | `UUID PK` | `gen_random_uuid()` |
| `user_id` | `UUID NOT NULL` | FK → `users_profile(id)` ON DELETE CASCADE |
| `channel_id` | `UUID NOT NULL` | FK → `channels(id)` ON DELETE CASCADE |
| `text_content` | `TEXT` | Contenido del post |
| `media_asset_ids` | `UUID[]` | Array de IDs de assets, default `'{}'` |
| `media_type` | `TEXT` | CHECK: `'photo'`, `'video'`, `'audio'`, `'document'` |
| `scheduled_at` | `TIMESTAMPTZ NOT NULL` | Fecha programada |
| `status` | `TEXT NOT NULL` | CHECK: `'draft'`, `'scheduled'`, `'publishing'`, `'published'`, `'retrying'`, `'failed'`, `'cancelled'` |
| `retry_count` | `INTEGER` | Default `0` |
| `max_retries` | `INTEGER` | Default `3` |
| `platform_message_id` | `TEXT` | ID del mensaje en la plataforma |
| `published_at` | `TIMESTAMPTZ` | Fecha de publicación |
| `next_retry_at` | `TIMESTAMPTZ` | Próximo intento de retry |
| `telegram_chat_id` | `BIGINT` | Chat ID numérico de Telegram para mapear webhook updates |
| `recurrence_rule_id` | `UUID` | FK → `recurrence_rules(id)` ON DELETE SET NULL |
| `parent_post_id` | `UUID` | FK → `scheduled_posts(id)` ON DELETE SET NULL |
| `created_at` | `TIMESTAMPTZ` | Server-set |
| `updated_at` | `TIMESTAMPTZ` | Auto por trigger |

---

### 1.6 `audit_log`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | `UUID PK` | `gen_random_uuid()` |
| `user_id` | `UUID NOT NULL` | FK → `users_profile(id)` ON DELETE CASCADE |
| `post_id` | `UUID` | FK → `scheduled_posts(id)` ON DELETE SET NULL |
| `action` | `TEXT NOT NULL` | CHECK: `'published'`, `'failed'`, `'retried'`, `'cancelled'`, `'edited'`, `'deleted'`, `'created'`, `'publishing'` |
| `platform` | `TEXT NOT NULL` | Plataforma |
| `platform_message_id` | `TEXT` | ID del mensaje |
| `error_code` | `TEXT` | Código de error si falló |
| `metadata` | `JSONB` | Metadatos estructurados |
| `occurred_at` | `TIMESTAMPTZ` | Server-set (forzado por trigger) |

**Inmutable**: La tabla tiene triggers que **bloquean UPDATE y DELETE**. RLS también lo refuerza.

---

### 1.7 `notifications`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | `UUID PK` | `gen_random_uuid()` |
| `user_id` | `UUID NOT NULL` | FK → `users_profile(id)` ON DELETE CASCADE |
| `type` | `TEXT NOT NULL` | Tipo de notificación |
| `severity` | `TEXT NOT NULL` | Severidad |
| `title` | `TEXT NOT NULL` | Título |
| `message` | `TEXT NOT NULL` | Mensaje |
| `metadata` | `JSONB` | Metadatos |
| `read` | `BOOLEAN` | Default `FALSE` |
| `created_at` | `TIMESTAMPTZ` | Server-set |

---

### 1.8 `post_metrics`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `post_id` | `UUID PK` | FK → `scheduled_posts(id)` ON DELETE CASCADE |
| `platform_message_id` | `TEXT NOT NULL` | ID del mensaje en la plataforma |
| `views` | `INTEGER` | Default `0` |
| `reactions` | `JSONB` | Reacciones, default `'{}'` |
| `forwards` | `INTEGER` | Default `0` |
| `replies` | `INTEGER` | Default `0` |
| `measured_at` | `TIMESTAMPTZ` | Momento de la medición |
| `created_at` | `TIMESTAMPTZ` | Server-set |
| `updated_at` | `TIMESTAMPTZ` | Server-set |

---

## 2. Vault RPCs

Funciones **SECURITY DEFINER** que exponen el Vault de Supabase solo para `service_role`:

| Función | Parámetros | Descripción |
|---------|-------------|-------------|
| `vault_store_secret` | `p_user_id UUID`, `p_key_name TEXT`, `p_secret TEXT` | Almacena o actualiza un secreto |
| `vault_get_secret` | `p_user_id UUID`, `p_key_name TEXT` | Obtiene un secreto desencriptado |
| `vault_delete_secret` | `p_user_id UUID`, `p_key_name TEXT` | Elimina un secreto |
| `vault_list_secrets` | `p_user_id UUID` | Lista nombres de secretos del usuario |

**Naming de secretos**: `{user_id}:{key_name}` (ej: `"550e8400...:telegram_bot_token"`)

---

## 3. Row Level Security (RLS)

### Tablas con RLS habilitado

| Tabla | Política | Alcance |
|-------|----------|---------|
| `users_profile` | `user_id = auth.uid()` | ALL |
| `channels` | `user_id = auth.uid()` | ALL |
| `assets` | `user_id = auth.uid()` | ALL |
| `scheduled_posts` | `user_id = auth.uid()` | ALL |
| `notifications` | `user_id = auth.uid()` | ALL |
| `recurrence_rules` | `user_id = auth.uid()` | ALL |
| `audit_log` | `user_id = auth.uid()` (SELECT) + `service_role` (INSERT) | Lectura solo propietario, inserciones solo service_role |
| `post_metrics` | Subquery a `scheduled_posts` (SELECT) + `service_role` (ALL) | Lectura solo propietario, escritura solo service_role |
| `storage.objects` | `bucket_id = 'assets'` + folder = `auth.uid()` | ALL |

### Inmutabilidad del audit_log

- **Trigger**: `block_audit_log_mutations()` → `RAISE EXCEPTION` en UPDATE/DELETE
- **RLS**: Políticas `audit_log_deny_update` y `audit_log_deny_delete` con `USING (false)` para todos los roles
- **FORCE RLS** activado

---

## 4. Índices de Performance

| Nombre | Tabla | Columnas |
|--------|-------|----------|
| `idx_scheduled_posts_status_scheduled_at` | `scheduled_posts` | `(status, scheduled_at)` |
| `idx_scheduled_posts_user_id_scheduled_at` | `scheduled_posts` | `(user_id, scheduled_at)` |
| `idx_audit_log_user_id_occurred_at` | `audit_log` | `(user_id, occurred_at)` |
| `idx_notifications_user_id_read` | `notifications` | `(user_id, read)` |
| `idx_assets_user_id_folder` | `assets` | `(user_id, folder)` |
| `idx_post_metrics_measured_at` | `post_metrics` | `(measured_at)` |

---

## 5. Triggers y Funciones

| Función/Trigger | Tabla | Propósito |
|----------------|-------|-----------|
| `set_updated_at()` | `users_profile`, `scheduled_posts` | Auto-actualiza `updated_at` en UPDATE |
| `enforce_audit_log_occurred_at()` | `audit_log` | Fuerza `occurred_at = now()` en INSERT |
| `block_audit_log_mutations()` | `audit_log` | Bloquea UPDATE/DELETE (inmutabilidad) |

---

## 6. Cron Job

**Nombre**: `directorai-publish-cron`

**Frecuencia**: `* * * * *` (cada 1 minuto)

**Acción**: Vía `pg_net.http_post()` llama a:
```
POST https://dnrbgoxvxkiczjtpdevu.supabase.co/functions/v1/scheduler
```

**Dependencias**: Extensiones `pg_cron` y `pg_net`.

---

## 7. Storage Policies

Bucket: `assets`

Cada usuario tiene una carpeta con su `auth.uid()` como nombre. Políticas:

| Operación | Condición |
|-----------|-----------|
| INSERT | `bucket_id = 'assets'` AND `(storage.foldername(name))[1] = auth.uid()::text` |
| SELECT | Misma condición |
| UPDATE | Misma condición |
| DELETE | Misma condición |

---

## 8. Diagrama de Relaciones

```
auth.users (managed by Supabase Auth)
  │
  └── users_profile (1:1)
        │
        ├── channels (1:N)
        │     └── scheduled_posts (1:N)
        │           ├── audit_log (1:N)
        │           ├── post_metrics (1:1)
        │           ├── assets (N:M via media_asset_ids[])
        │           └── recurrence_rules (N:1)
        │
        ├── assets (1:N)
        ├── notifications (1:N)
        └── recurrence_rules (1:N)
```
