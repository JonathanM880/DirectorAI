# telegram-webhook

Supabase Edge Function que recibe updates de reacciones desde Telegram via webhook y las persiste en `post_metrics`.

**URL:** `{SUPABASE_URL}/functions/v1/telegram-webhook`

**Método:** `POST`

---

## Autenticación

Header requerido:

```
x-telegram-bot-api-secret-token: <TELEGRAM_WEBHOOK_SECRET>
```

Si no coincide con `TELEGRAM_WEBHOOK_SECRET` responde `401 Unauthorized`.

---

## Request Body

Objeto `TelegramUpdate` de Telegram. Puede contener uno de estos dos campos:

### `message_reaction_count`

Enviado por Telegram periódicamente con el conteo actualizado de reacciones.

```json
{
  "update_id": 123456789,
  "message_reaction_count": {
    "chat": { "id": -1001234567890 },
    "message_id": 42,
    "reactions": [
      { "type": { "emoji": "👍" }, "total_count": 5 },
      { "type": { "emoji": "🔥" }, "total_count": 2 }
    ]
  }
}
```

### `message_reaction`

Enviado en tiempo real cuando un usuario reacciona.

```json
{
  "update_id": 123456789,
  "message_reaction": {
    "chat": { "id": -1001234567890 },
    "message_id": 42,
    "reactions": [
      { "type": { "emoji": "👍" }, "new_count": 1, "total_count": 5 }
    ]
  }
}
```

---

## Comportamiento

1. Valida el header `x-telegram-bot-api-secret-token`. Si no coincide → `401`.
2. Solo acepta `POST`. Otros métodos → `405`.
3. Parsea el body. Si no trae `message_reaction_count` ni `message_reaction` → `200` sin procesar.
4. Busca en `scheduled_posts` un registro que coincida con `telegram_chat_id` y `platform_message_id`.
5. Si no encuentra el post → `200` (loguea warning).
6. Construye un mapa `{ emoji -> count }` desde las reacciones.
7. Hace **upsert** en `post_metrics` con `post_id`, `platform_message_id`, `reactions` (JSONB) y `measured_at`.
8. Cualquier error interno se loguea y responde `200` (siempre ok para que Telegram no reintente).

---

## Cómo registrar el webhook

Para decirle a Telegram que envíe updates a esta función, llama al **scheduler** con acción `REGISTER_WEBHOOK`:

**Endpoint:** `{SUPABASE_URL}/functions/v1/scheduler`

**Headers:**
```
Authorization: Bearer {CRON_SECRET}
Content-Type: application/json
```

**Body:**
```json
{ "action": "REGISTER_WEBHOOK" }
```

Esto llama internamente a:

```
https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook?url={SUPABASE_URL}/functions/v1/telegram-webhook&secret_token={TELEGRAM_WEBHOOK_SECRET}
```

---

## Dependencias

| Tipo | Detalle |
|------|---------|
| **Env vars** | `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Tablas** | `scheduled_posts (telegram_chat_id, platform_message_id)`, `post_metrics (post_id, platform_message_id, reactions, measured_at)` |
