# Rundown de Funciones de DirectorAI

Este documento contiene un rundown detallado de todas las Edge Functions y servicios de soporte en el directorio [supabase/functions](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions).

---

## 1. Edge Functions (Funciones Servidas)

Cada subcarpeta en `supabase/functions` representa una función de Supabase desplegada e independiente:

### 1.1 [gen-ai-studio](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/gen-ai-studio/index.ts)
Actúa como gateway para características de Inteligencia Artificial. Recibe peticiones del cliente y maneja las siguientes acciones:
*   `streamGenerate`: Transmite (stream) generaciones de texto de IA en tiempo real utilizando `GenAIService`.
*   `brainstorm`: Genera ideas creativas y propuestas de campaña.
*   `parseCampaign`: Analiza y extrae datos estructurados de campañas a partir de texto libre.
*   `generateImage`: Crea imágenes utilizando modelos generativos.

### 1.2 [metrics-poller](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/metrics-poller/index.ts)
Una función programada (cron job) para recolectar métricas de redes sociales (actualmente configurado para Telegram):
*   Busca publicaciones publicadas en los últimos 7 días.
*   Obtiene los tokens del bot y consulta las actualizaciones del canal a la API de Telegram.
*   Registra las métricas (vistas, reacciones, compartidos, respuestas) en la base de datos usando `MetricsService`.

### 1.3 [scheduler](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/scheduler/index.ts)
El motor de publicación de DirectorAI. Se ejecuta periódicamente vía `pg_cron` o manualmente:
*   **Orquestación**: Restablece posts atascados en estado `publishing` y procesa en lotes las publicaciones programadas pendientes.
*   **Publicación**: Publica contenido y archivos multimedia a Telegram utilizando los tokens del Vault de Supabase.
*   **Reintentos y Logs**: Implementa lógica de reintentos exponenciales para fallas temporales y registra logs inmutables en la tabla `audit_log`.
*   **Servicios integrados en scheduler**:
    *   [RecurrenceService](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/scheduler/recurrence.service.ts): Calcula las siguientes fechas de publicación para posts recurrentes (diarios, semanales o mensuales).
    *   [SchedulingEngine](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/scheduler/scheduling-engine.ts): Administra el ciclo de vida completo de un post programado (programar, cancelar, reprogramar y listar posts pendientes).

---

## 2. Servicios Compartidos (`_shared`)

Ubicados en la carpeta [_shared](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/_shared), son clases de soporte reutilizadas por las Edge Functions:

*   [AuthServiceImpl](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/_shared/auth.service.ts): Maneja el registro (`signUp`), inicio de sesión (`signIn`), OAuth, cierre de sesión (`signOut`) y recuperación de sesiones de usuario.
*   [AssetStorageServiceImpl](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/_shared/asset-storage.service.ts): Gestiona la subida, eliminación y URL públicas de los assets de medios en Supabase Storage.
*   [GenAIServiceImpl](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/_shared/gen-ai.service.ts): Implementa la lógica para llamar a los modelos de OpenRouter/OpenAI para la generación de texto e imágenes.
*   [KeyVaultServiceImpl](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/_shared/key-vault.service.ts): Recupera claves secretas (como tokens de bots) de forma segura desde el almacén de secretos de la base de datos (`vault`).
*   [MetricsServiceImpl](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/_shared/metrics.service.ts): Administra la ingesta y consulta histórica de métricas de engagement.
*   [AlertServiceImpl](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/_shared/alert.service.ts): Envía notificaciones de alerta (e.g. Slack) cuando ocurre algún fallo crítico.
*   [RetryEngine](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/_shared/retry-engine.ts): Define políticas de reintentos resilientes con retrasos y backoff.

---

## 3. Configuración y Gestión del Cron Job (`pg_cron`) en Producción

El motor de publicación de DirectorAI se despierta mediante un cron job configurado directamente en la base de datos de producción (`postgres`) usando la extensión `pg_cron`.

### 3.1 Cron Job Configurado Actualmente
*   **Nombre de la tarea**: `directorai-publish-cron`
*   **Frecuencia**: `* * * * *` (Cada 1 minuto)
*   **Acción**: Llama por método POST (usando `pg_net`) a la Edge Function `scheduler` sin autenticación forzada temporal (al no tener la variable `CRON_SECRET` configurada).

### 3.2 Cómo administrar el Cron Job desde el Supabase Dashboard en Internet
Puedes monitorear, pausar, cambiar el intervalo o eliminar este cron job de manera visual/SQL siguiendo estos pasos:

1.  Inicia sesión en el [Supabase Dashboard](https://supabase.com/dashboard).
2.  Entra a tu proyecto (**Dasango's Project** / ref: `dnrbgoxvxkiczjtpdevu`).
3.  Haz clic en **SQL Editor** en el panel izquierdo (icono de hoja con flecha de ejecución).
4.  Crea una **New Query** (Nueva Consulta) y ejecuta cualquiera de los siguientes comandos según lo que necesites hacer:

#### A. Ver las tareas activas y sus ejecuciones pasadas
```sql
-- Listar todas las tareas programadas activas
SELECT * FROM cron.job;

-- Ver el historial de ejecuciones recientes (para ver si falla o tiene éxito)
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 50;
```

#### B. Cambiar el intervalo del Cron (por ejemplo, a cada 15 minutos)
```sql
-- Cambiar la frecuencia a cada 15 minutos (reduce costos y llamadas fantasma)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'directorai-publish-cron'),
  schedule := '*/15 * * * *'
);
```

#### C. Pausar o Reactivar la ejecución
```sql
-- Pausar (evita que se ejecute sin borrar la configuración)
UPDATE cron.job SET active = false WHERE jobname = 'directorai-publish-cron';

-- Reactivar
UPDATE cron.job SET active = true WHERE jobname = 'directorai-publish-cron';
```

#### D. Desactivar / Eliminar por completo el Cron Job
```sql
-- Desprogramar y borrar la tarea de la base de datos
SELECT cron.unschedule('directorai-publish-cron');
```

