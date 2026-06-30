# Guía de Implementación: Auditoría (Audit Logs) y Notificaciones

Esta guía detalla cómo están implementados actualmente los sistemas de **Auditoría (Logs)** y **Notificaciones** en DirectorAI, tanto a nivel de Base de Datos (Supabase/PostgreSQL), Backend (Edge Functions en Deno) y Frontend (Angular). Al final se incluye una plantilla de referencia para añadir estas llamadas a cualquier servicio o API.

---

## 1. Sistema de Auditoría (Audit Logs)

El registro de auditoría es un historial inmutable de acciones críticas en el sistema (por ejemplo: publicación de posts, fallos, reintentos, edición de claves en Vault, etc.).

### A. Base de Datos (PostgreSQL)
*   **Archivo de migración original:** [006_create_audit_log.sql](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/migrations/006_create_audit_log.sql)
*   **Tabla:** `public.audit_log`
*   **Estructura de la tabla:**
    *   `id` (`UUID`, PK, autogenerado)
    *   `user_id` (`UUID`, FK hacia `users_profile`)
    *   `post_id` (`UUID`, FK hacia `scheduled_posts`, opcional)
    *   `action` (`TEXT`, restringido por un `CHECK` a: `'published'`, `'failed'`, `'retried'`, `'cancelled'`, `'edited'`, `'deleted'`)
    *   `platform` (`TEXT`, plataforma afectada, ej: `'telegram'`, `'vault'`)
    *   `platform_message_id` (`TEXT`, ID retornado por la API externa, opcional)
    *   `error_code` (`TEXT`, código de error en caso de fallo, opcional)
    *   `metadata` (`JSONB`, metadatos adicionales structured del evento)
    *   `occurred_at` (`TIMESTAMPTZ`, marca de tiempo del evento)

#### Reglas de Integridad y Seguridad de Base de Datos:
1.  **Forzado de fecha en servidor:** Se utiliza un trigger (`trg_audit_log_occurred_at` en [011_fix_scheduled_posts_and_audit_log.sql](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/migrations/011_fix_scheduled_posts_and_audit_log.sql)) que ejecuta la función `enforce_audit_log_occurred_at()` antes de insertar un registro. Esto asegura que `occurred_at` siempre sea la hora actual del servidor (`now()`), previniendo que los clientes fuercen fechas ficticias.
2.  **Inmutabilidad estricta:** Para cumplir con normativas de seguridad, no se permite modificar ni eliminar logs de auditoría. El archivo [012_audit_log_immutability.sql](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/migrations/012_audit_log_immutability.sql) añade el trigger `trg_audit_log_immutable`, el cual aborta cualquier operación `UPDATE` o `DELETE` arrojando un error: `"permission denied: audit_log is immutable"`.

### B. Backend (Supabase Edge Functions)
Los logs se insertan en backend a través del cliente de base de datos Supabase con privilegios elevados (`service_role` key para omitir RLS):
1.  **Orquestador de Tareas (Scheduler):** En [scheduler/index.ts](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/scheduler/index.ts) se expone la función `writeAuditLog(...)` que guarda el estado de los posts procesados:
    *   `failed`: Si la plataforma no es soportada o hay un error inesperado al publicar.
    *   `published`: Si el post se publica exitosamente en Telegram.
    *   `retried`: Si la API externa retorna un error temporal y el post se encola de nuevo.
2.  **Motor de Reintentos (RetryEngine):** En [retry-engine.ts](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/_shared/retry-engine.ts), se registran los eventos de auditoría mediante `insertAuditLog(...)` en los métodos `enqueue` (cuando se encola un reintento) y `markFailed` (cuando se agotan los reintentos).
3.  **Bóveda de Seguridad (KeyVault):** En [key-vault.service.ts](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/_shared/key-vault.service.ts), cada interacción con secretos guarda auditoría:
    *   `storeKey` / `rotateKey`: Guarda un log de auditoría con la acción `edited`, plataforma `vault` y metadatos con el nombre de la clave.
    *   `deleteKey`: Guarda un log con la acción `deleted`.

### C. Frontend (Angular)
El frontend **no tiene permisos para escribir directamente en `audit_log`** (por RLS e inmutabilidad). Sin embargo, puede consultar el historial:
*   **Servicio:** [audit-log.service.ts](file:///C:/Users/Desk/git/ts/DirectorAI/frontend/src/app/core/services/audit-log.service.ts) y [scheduling-engine.service.ts](file:///C:/Users/Desk/git/ts/DirectorAI/frontend/src/app/features/services/scheduling-engine.service.ts).
*   **Método:** `getAuditLog(options)` realiza una consulta paginada y filtrada (por acción, plataforma, rango de fechas) sobre la tabla `audit_log`.

---

## 2. Sistema de Notificaciones

Las notificaciones son alertas dirigidas al usuario que se despliegan en tiempo real en la interfaz de la aplicación o se guardan en su bandeja.

### A. Base de Datos (PostgreSQL)
*   **Archivo de migración original:** [008_create_notifications.sql](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/migrations/008_create_notifications.sql)
*   **Tabla:** `public.notifications`
*   **Estructura de la tabla:**
    *   `id` (`UUID`, PK, autogenerado)
    *   `user_id` (`UUID`, FK hacia `users_profile`)
    *   `type` (`TEXT`, ej: `'post_published'`, `'post_retrying'`, `'retry_exhausted'`, `'payment_failed'`)
    *   `severity` (`TEXT`, ej: `'success'`, `'warning'`, `'error'`, `'info'`)
    *   `title` (`TEXT`, título de la notificación)
    *   `message` (`TEXT`, cuerpo descriptivo de la notificación)
    *   `metadata` (`JSONB`, metadatos adicionales, ej: `postId`, `nextRetryAt`, etc.)
    *   `read` (`BOOLEAN`, estado de lectura, default `FALSE`)
    *   `created_at` (`TIMESTAMPTZ`, fecha de creación, default `now()`)

### B. Backend (Supabase Edge Functions)
Las notificaciones son creadas a través de un servicio común de alertas:
*   **Definición del Servicio:** `AlertService` en [packages/types/index.ts](file:///C:/Users/Desk/git/ts/DirectorAI/packages/types/index.ts).
*   **Implementación:** [alert.service.ts](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/_shared/alert.service.ts) define la clase `AlertServiceImpl` que permite:
    *   `notify(userId, event)`: Inserta un registro en `notifications`.
    *   `subscribeToRealtime(userId, callback)`: Suscribe la conexión a cambios de inserción (`INSERT`) filtrados por `user_id`.
*   **Uso en lógica de negocio:** El [retry-engine.ts](file:///C:/Users/Desk/git/ts/DirectorAI/supabase/functions/_shared/retry-engine.ts) utiliza este servicio para alertar al usuario:
    *   Cuando falla la publicación y se programa un reintento (`post_retrying`, severity `warning`).
    *   Cuando el post se publica de manera exitosa tras un reintento (`post_published`, severity `success`).
    *   Cuando se agotan los reintentos (`retry_exhausted`, severity `error`).

### C. Frontend (Angular)
El frontend consume y muestra las notificaciones de dos maneras:
1.  **Servicio Reactivo (Singular):** [notification.service.ts](file:///C:/Users/Desk/git/ts/DirectorAI/frontend/src/app/core/services/notification.service.ts)
    *   Mantiene un estado reactivo basado en Angular Signals: `notifications = signal<Notification[]>([]);`
    *   En su método `init()` consulta las últimas 50 notificaciones y abre una suscripción en tiempo real usando Supabase Realtime (`supabase.channel(...)`). Cuando llega una nueva inserción, actualiza el signal automáticamente.
    *   Permite al usuario limpiar o marcar notificaciones como leídas (`markAllAsRead()`).
    *   Exposes `notify(...)` para generar notificaciones directamente por eventos de interfaz (ej. en [assets.component.ts](file:///C:/Users/Desk/git/ts/DirectorAI/frontend/src/app/features/assets/assets.component.ts) al subir, actualizar o borrar imágenes).
2.  **Servicio de Consulta (Plural):** [notifications.service.ts](file:///C:/Users/Desk/git/ts/DirectorAI/frontend/src/app/core/services/notifications.service.ts)
    *   Servicio auxiliar para hacer consultas de sólo lectura y mapeo de datos.
3.  **UI Component:** `notification-bell.component.ts` (en shell)
    *   Inyecta `NotificationService` y enlaza el signal directamente a la campana del header, computando el número de notificaciones no leídas (`unreadCount`).

---

## 3. Plantillas de Integración Rápida (Cómo añadir Audit y Notificaciones)

Si implementas un nuevo servicio o endpoint de API y quieres que **automáticamente** guarde un log de auditoría y envíe una notificación al usuario, utiliza las siguientes plantillas según el contexto.

### Opción A: Desde el Backend (Edge Functions en Deno)

Esta opción es idónea para operaciones asíncronas, crons, colas de procesamiento, integraciones externas o llamados del sistema en el servidor.

```typescript
import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { AlertServiceImpl } from '../_shared/alert.service.ts'

async function miNuevoServicioAPI(supabase: SupabaseClient, userId: string, payload: any) {
  
  // 1. EJECUCIÓN DE TU LÓGICA DE NEGOCIO
  // ... tu código aquí ...
  const resultadoOperacion = { idPost: '123-abc', exitoso: true, plataforma: 'twitter' };

  // 2. AUDIT LOG (Se guarda el registro inmutable en base de datos)
  const { error: auditError } = await supabase.from('audit_log').insert({
    user_id: userId,
    post_id: resultadoOperacion.idPost, // Opcional (si aplica a un post)
    action: resultadoOperacion.exitoso ? 'published' : 'failed', // 'published', 'failed', 'retried', 'cancelled', 'edited', 'deleted'
    platform: resultadoOperacion.plataforma,
    metadata: { 
      detalle: 'Ejecución automática de miNuevoServicioAPI',
      payloadEnviado: payload 
    },
    occurred_at: new Date().toISOString() // El trigger del servidor lo sobrescribirá con now()
  });

  if (auditError) {
    console.error('Error insertando en audit_log:', auditError);
  }

  // 3. NOTIFICACIÓN (Llega en tiempo real al panel del usuario)
  const alertService = new AlertServiceImpl(supabase);
  await alertService.notify(userId, {
    type: 'nuevo_servicio_ejecutado', // String libre / categorización
    severity: resultadoOperacion.exitoso ? 'success' : 'error', // 'success', 'warning', 'error', 'info'
    title: 'Operación Ejecutada',
    message: `La acción del nuevo servicio finalizó con éxito en ${resultadoOperacion.plataforma}.`,
    metadata: { id: resultadoOperacion.idPost }
  });
}
```

### Opción B: Desde el Frontend (Angular Reactive UI)

Esta opción es idónea para eventos disparados directamente por clics en botones, respuestas inmediatas del navegador o flujos controlados desde la interfaz de usuario.

```typescript
import { Component, inject } from '@angular/core';
import { NotificationService } from '../../core/services/notification.service';
import { SupabaseClient } from '@supabase/supabase-js';

@Component({
  selector: 'app-mi-componente',
  template: `<button (click)="ejecutarAccion()">Disparar Flujo</button>`
})
export class MiComponente {
  private notificationService = inject(NotificationService);
  private supabase = inject(SupabaseClient);

  async ejecutarAccion() {
    try {
      // 1. LLAMADA A LA API O SERVICIO FRONTPAGE
      // ... tu lógica ...
      const userId = (await this.supabase.auth.getSession()).data.session?.user.id;
      if (!userId) return;

      // 2. NOTIFICACIÓN OPTIMISTA Y PERSISTENTE
      // El helper .notify() hace dos cosas automáticamente:
      // a) Agrega la notificación de forma reactiva al Signal (UI instantánea).
      // b) Inserta la fila en la tabla 'notifications' de Supabase.
      await this.notificationService.notify(
        'mi_accion_ui', 
        'success', // severity
        '¡Acción Completada!', 
        'El proceso automático ha sido ejecutado con éxito desde la interfaz.'
      );

      // 3. AUDIT LOG (Opcional - Sólo si tu rol de supabase en frontend tiene permisos explícitos de inserción)
      // Nota: Habitualmente la inserción en audit_logs debe reservarse para el backend,
      // pero si el cliente frontend tiene permisos RLS configurados para insertar en audit_log:
      await this.supabase.from('audit_log').insert({
        user_id: userId,
        action: 'edited',
        platform: 'web-ui',
        metadata: { info: 'Acción ejecutada desde el componente MiComponente' }
      });

    } catch (error) {
      // Notificación de error en la UI
      await this.notificationService.notify(
        'mi_accion_error',
        'error',
        'Error de ejecución',
        'Ocurrió un problema al procesar el flujo automático.'
      );
    }
  }
}
```

---

## 4. Flujo Automatizado de Extensión

Si quieres crear un flujo donde **"al hacer llamada X, se guarde log Y y notificación Z de forma automática"**, te recomendamos usar alguna de las siguientes arquitecturas:

1.  **Lógica del Servicio de Aplicación (Recomendado):** Encapsular la lógica en una función de servicio en backend (como en la **Opción A**). Cada vez que la API externa/servicio sea invocado, los últimos pasos de la función deben escribir tanto en `audit_log` como en `notifications`.
2.  **Triggers de Base de Datos (Database Triggers):** Si quieres que sea 100% automático al cambiar el estado de una tabla, puedes crear un trigger en PostgreSQL. Por ejemplo, al actualizar el estado de `scheduled_posts` a `'failed'`, una función trigger puede insertar automáticamente en `audit_log` y en `notifications` sin necesidad de duplicar código en TS.
