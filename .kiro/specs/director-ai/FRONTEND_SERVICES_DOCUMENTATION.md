# DirectorAI Frontend Services Reference

This document serves as the official reference for the decoupled Angular Services layer in DirectorAI. 

To maintain clean separation of concerns, improve testability, and isolate components from direct database clients, **components must never inject `SupabaseClient` directly**. Instead, components must consume the specialized, strongly-typed Angular services documented below.

---

## Table of Contents

- [Core Principles](#core-principles)
- [1. Authentication Service (`AngularAuthService`)](#1-authentication-service-angularauthservice)
- [2. User Profile Service (`UsersProfileService`)](#2-user-profile-service-usersprofileservice)
- [3. Channels Service (`ChannelsService`)](#3-channels-service-channelsservice)
- [4. Asset Storage & Metadata Service (`AssetsService`)](#4-asset-storage--metadata-service-assetsservice)
- [5. Recurrence Rules Service (`RecurrenceRulesService`)](#5-recurrence-rules-service-recurrencerulesservice)
- [6. Scheduled Posts Service (`ScheduledPostsService`)](#6-scheduled-posts-service-scheduledpostsservice)
- [7. Audit Log Service (`AuditLogService`)](#7-audit-log-service-auditlogservice)
- [8. Subscriptions Service (`SubscriptionsService`)](#8-subscriptions-service-subscriptionsservice)
- [9. Notifications Service (`NotificationsService`)](#9-notifications-service-notificationsservice)
- [10. Post Metrics Service (`PostMetricsService`)](#10-post-metrics-service-postmetricsservice)
- [Component Integration Quickstart](#component-integration-quickstart)

---

## Core Principles

1. **No direct Supabase Client in Components**: Never inject `SupabaseClient` directly into components.
2. **Defensive Testing**: All services are structured to allow mock injection via standard Angular `TestBed` provider overrides.
3. **Data Mapping**: Services are responsible for converting database snake_case columns into frontend camelCase types defined in `@director-ai/types`.
4. **Leverage Row Level Security (RLS)**: Service methods do not accept `userId` or require `user_id` properties. Supabase automatically resolves the user's context from the authorization headers and enforces data isolation policies (e.g. checking `auth.uid()`).


---

## 1. Authentication Service (`AngularAuthService`)

Manages user sessions, registration, login, and token propagation.

*   **File Path**: `src/app/core/services/auth.service.ts`
*   **Exported Class**: `AngularAuthService`

### Public Methods

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `signUp(email, password)` | `Promise<AuthResult>` | Creates a new user account. |
| `signIn(email, password)` | `Promise<AuthResult>` | Authenticates using password credentials. |
| `signInWithOAuth(provider)` | `Promise<void>` | Launches OAuth provider flow (e.g. `'google'`). |
| `signOut()` | `Promise<void>` | Ends the current active session. |
| `resetPassword(email)` | `Promise<void>` | Sends a password recovery email. |
| `getSession()` | `Promise<Session \| null>` | Gets the active authentication session. |
| `getUser()` | `Promise<User \| null>` | Gets the active user record. |

### Component Example

```typescript
import { Component, inject } from '@angular/core';
import { AngularAuthService } from '../../core/services/auth.service';

@Component({ ... })
export class LoginComp {
  private authService = inject(AngularAuthService);

  async onLogin() {
    const result = await this.authService.signIn('user@domain.com', 'password123');
    if (result.error) {
      console.error('Login failed:', result.error.message);
    } else {
      console.log('Logged in successfully!');
    }
  }
}
```

---

## 2. User Profile Service (`UsersProfileService`)

Manages user profiles, timezones, and onboarding states stored in the `/rest/v1/users_profile` table.

*   **File Path**: `src/app/core/services/users-profile.service.ts`
*   **Exported Class**: `UsersProfileService`

### Public Methods

| `getProfile()` | `Promise<UserProfile \| null>` | Fetches the user profile by UUID. |
| `createProfile(profile)` | `Promise<UserProfile>` | Creates a new user profile entry. |
| `updateProfile(profile)` | `Promise<UserProfile>` | Updates timezone, display name, or onboarding state. |

---

## 3. Channels Service (`ChannelsService`)

Retrieves and configures publishing endpoints (Telegram, X/Twitter, etc.) stored in the `/rest/v1/channels` table.

*   **File Path**: `src/app/core/services/channels.service.ts`
*   **Exported Class**: `ChannelsService`

### Public Methods

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `getChannels()` | `Promise<Channel[]>` | Lists all active social channels of the user. |
| `getChannelById(id)` | `Promise<Channel \| null>` | Retrieves single channel profile by its UUID. |
| `createChannel(channel)` | `Promise<Channel>` | Adds a new publishing endpoint channel. |

---

## 4. Asset Storage & Metadata Service (`AssetsService`)

Orchestrates storage binary uploads to bucket endpoints and records database rows in `/rest/v1/assets`.

*   **File Path**: `src/app/core/services/assets.service.ts`
*   **Exported Class**: `AssetsService`

### Public Methods

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `getAssets()` | `Promise<AssetRecord[]>` | Returns all user assets sorted chronologically. |
| `getAssetsByIds(ids)` | `Promise<AssetRecord[]>` | Resolves specific assets using an array of UUIDs. |
| `createSignedUrl(storagePath, ttl, bucket?)` | `Promise<string>` | Generates secure preview URL (default: `'assets'` bucket). |
| `getTextContent(storagePath, bucket?)` | `Promise<string>` | Generates temporary link, fetches content, and parses text. |
| `uploadFile(storagePath, file, mimeType, bucket?)` | `Promise<string>` | Uploads binary blob directly to Storage. |
| `saveAssetMetadata(metadata)` | `Promise<AssetRecord>` | Creates database metadata entry. |
| `deleteAsset(assetId, storagePath, bucket?)` | `Promise<void>` | Deletes both storage file and database record. |

### Component Example (Reading text content from assets)

```typescript
import { Component, inject, signal } from '@angular/core';
import { AssetsService } from '../../core/services/assets.service';

@Component({ ... })
export class AssetPreviewer {
  private assetsService = inject(AssetsService);
  textContent = signal('');

  async loadTextAsset(storagePath: string) {
    try {
      const text = await this.assetsService.getTextContent(storagePath);
      this.textContent.set(text);
    } catch (err) {
      this.textContent.set('Failed to read content.');
    }
  }
}
```

---

## 5. Recurrence Rules Service (`RecurrenceRulesService`)

Controls automated post repetitions stored in `/rest/v1/recurrence_rules`.

*   **File Path**: `src/app/core/services/recurrence-rules.service.ts`
*   **Exported Class**: `RecurrenceRulesService`

### Public Methods

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `createRule(rule)` | `Promise<any>` | Stores new schedule repetition rule. |
| `updateRule(id, rule)` | `Promise<any>` | Modifies an existing recurrence rule parameters. |
| `deleteRule(id)` | `Promise<void>` | Removes rule from repeating database. |

---

## 6. Scheduled Posts Service (`ScheduledPostsService`)

Manages CRUD operations and lifecycle states of posts scheduled in `/rest/v1/scheduled_posts`.

*   **File Path**: `src/app/core/services/scheduled-posts.service.ts`
*   **Exported Class**: `ScheduledPostsService`

### Public Methods

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `getUpcomingPosts(from, to)` | `Promise<ScheduledPost[]>` | Gets planned posts within a date window. |
| `getFailedPosts()` | `Promise<ScheduledPost[]>` | Gets posts whose publication failed. |
| `getRecurringPosts()` | `Promise<any[]>` | Gets all repeating posts with joined rule tables. |
| `createPost(post)` | `Promise<ScheduledPost>` | Schedules a new post for publication. |
| `updatePost(id, post)` | `Promise<ScheduledPost>` | Modifies a scheduled post configuration. |
| `reschedulePost(id, date)` | `Promise<ScheduledPost>` | Resets schedule date and reverts status to `'scheduled'`. |
| `cancelPost(id)` | `Promise<void>` | Cancels schedule and turns status to `'cancelled'`. |
| `updateChannelMaxRetries(chId, max)` | `Promise<void>` | Configures fallback retries limits on channel scope. |

---

## 7. Audit Log Service (`AuditLogService`)

Retrieves read-only activity logs stored in `/rest/v1/audit_log`.

*   **File Path**: `src/app/core/services/audit-log.service.ts`
*   **Exported Class**: `AuditLogService`

### Public Methods

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `getAuditLog(options)` | `Promise<{ rows: AuditLogEntry[], total: number }>` | Returns paginated audit logs with action filters. |

---

## 8. Subscriptions Service (`SubscriptionsService`)

Fetches user limits and stripe statuses stored in `/rest/v1/subscriptions`.

*   **File Path**: `src/app/core/services/subscriptions.service.ts`
*   **Exported Class**: `SubscriptionsService`

### Public Methods

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `getSubscription()` | `Promise<any \| null>` | Returns plan name, current end dates, and quotas usage. |

---

## 9. Notifications Service (`NotificationsService`)

Provides operations on toasts and feed notifications stored in `/rest/v1/notifications`.

*   **File Path**: `src/app/core/services/notifications.service.ts`
*   **Exported Class**: `NotificationsService`

### Public Methods

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `getNotifications(unreadOnly?)` | `Promise<Notification[]>` | Returns notifications (sorted newest first). |
| `markAsRead(id)` | `Promise<void>` | Marks a single notification as read. |
| `markAllAsRead()` | `Promise<void>` | Marks all active notifications as read. |

---

## 10. Post Metrics Service (`PostMetricsService`)

Exposes interaction statistics and views from `/rest/v1/post_metrics`.

*   **File Path**: `src/app/core/services/post-metrics.service.ts`
*   **Exported Class**: `PostMetricsService`

### Public Methods

| Method Signature | Return Type | Description |
| :--- | :--- | :--- |
| `getPostMetrics(postId)` | `Promise<PostMetrics \| null>` | Resolves platforms views and reactions counts. |

---

## Component Integration Quickstart

### Example: Creating a scheduled post with image and text asset

```typescript
import { Component, inject } from '@angular/core';
import { AssetsService } from '../../core/services/assets.service';
import { ScheduledPostsService } from '../../core/services/scheduled-posts.service';

@Component({ ... })
export class PublisherComponent {
  private assets = inject(AssetsService);
  private scheduler = inject(ScheduledPostsService);

  async publish(channelId: string, text: string, imgFile: File) {
    // 1. Upload the image file
    const imgPath = `${crypto.randomUUID()}-${imgFile.name}`;
    await this.assets.uploadFile(imgPath, imgFile, imgFile.type);
    
    // 2. Save image asset metadata (Supabase RLS automatically assigns user_id)
    const asset = await this.assets.saveAssetMetadata({
      filename: imgFile.name,
      mime_type: imgFile.type,
      size_bytes: imgFile.size,
      storage_path: imgPath,
      source: 'user_upload'
    });

    // 3. Create the scheduled post linked to the asset (Supabase RLS automatically assigns user_id)
    const scheduledTime = new Date(Date.now() + 24 * 3600 * 1000); // 24 hours in the future
    await this.scheduler.createPost({
      channel_id: channelId,
      text_content: text,
      media_asset_ids: [asset.id],
      media_type: 'photo',
      scheduled_at: scheduledTime.toISOString()
    });

    alert('Post successfully scheduled!');
  }
}
```
