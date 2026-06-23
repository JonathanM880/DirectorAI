# Contributing to DirectorAI

Welcome to DirectorAI! This document outlines the project structure, essential documentation you must read, and how tasks are divided among the three developers on our team to ensure parallel progress with minimal merge conflicts.

---

## 1. What is DirectorAI?

DirectorAI is a full-stack content automation SaaS platform that allows business owners to autonomously generate, schedule, and publish marketing content to social media channels (starting with Telegram) via an AI-powered pipeline.

The stack integrates:

- **Frontend**: Angular 21 SPA (with standalone components and SCSS).
- **Backend**: Supabase (Database, Auth, Row Level Security, Storage, Vault) and Deno-based Edge Functions.
- **Integrations**: OpenRouter API for AI text/image generation, Stripe for billing/subscriptions, and the Telegram Bot API for publishing.

---

## 2. Essential Reading (Mandatory)

Before starting any development, you **must** read the specification files in the `.kiro/specs/director-ai/` directory. They define the exact rules, APIs, designs, and validation steps:

1. **[design.md]**: Contains the system architecture, C4 sequence diagrams, database schema DDL, service interfaces (TypeScript contracts), and CSS design system tokens (colors, typography, spacing).
2. **[requirements.md]**: Details the acceptance criteria for each system feature. Check your implementations against these to verify compliance.
3. **[tasks.md]**: The implementation plan containing task lists, wave dependencies, and checkboxes.

---

## 3. Project Directory Structure

Here is how the repository is structured:

```text
DirectorAI/
├── .kiro/specs/director-ai/  # Architecture, Requirements, and Task specs (Mandatory)
├── packages/
│   └── types/                # Shared TypeScript interfaces barrel (index.ts)
├── supabase/
│   ├── config.toml           # Supabase project configuration
│   ├── migrations/           # SQL migration scripts (001_create_users_profile.sql, etc.)
│   └── functions/            # Deno Edge Functions (TypeScript)
│       └── _shared/          # Reusable backend services (AuthService, KeyVaultService, etc.)
└── frontend/
    ├── src/
    │   ├── app/              # Angular components, services, routes, guards
    │   └── styles/           # CSS/SCSS design system tokens and global styles
    └── e2e/                  # Playwright end-to-end smoke tests
```

---

## 4. How to Verify Requirements & Correctness

Every feature you build must satisfy the requirements in **[requirements.md]**. To verify your work, write and run tests:

- **Edge Functions**: Unit and integration tests using `vitest`.
- **Property-Based Testing**: Use `fast-check` for correctness invariants (e.g., retry bounds, feature gates).
- **Frontend**: Unit tests using `jest` + `@testing-library/angular`.
- **E2E**: Core flows are verified with Playwright in `frontend/e2e/`.

---

## 5. Workload Division (3-Developer Split)

To keep development parallel and minimize git merge conflicts, work is divided into three distinct ownership tracks. Tasks 0.1 through 1.4 are already completed or in-progress by Developer 1.

### 📋 Track Assignments

| Developer                         | Primary Ownership Areas                                                              | Core Tasks to Complete (from [tasks.md](file:///C:/Users/Desk/git/ts/DirectorAI/.kiro/specs/director-ai/tasks.md))                                                                                                                                                                                                                                                                                         |
| :-------------------------------- | :----------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Developer 1** _(Lead & Core)_   | Core Auth, Project Scaffold, Layout Shell, Dashboard, and Global E2E tests           | <ul><li>**Tasks 0.1 – 1.4**: (Done/In Progress) Project scaffold, migrations base, RLS policies, Auth service, Key Vault</li><li>**Wave 5**: Frontend Shell & design system tokens (Tasks 5.1 – 5.4)</li><li>**Wave 6**: Dashboard & Settings UI (Tasks 6.1, 6.7)</li><li>**Wave 4**: Data Intelligence (Metrics, Alerts, Audit: Tasks 4.1 – 4.3)</li><li>**Wave 7**: E2E Smoke Tests (Task 7.4)</li></ul> |
| **Developer 2** _(AI & Content)_  | Asset Storage service, AI generation logic, and Media/Asset frontend UIs             | <ul><li>**Task 1.5**: Asset Storage Service backend</li><li>**Wave 2**: GenAI Service Core, Streaming, and Property-Based tests (Tasks 2.1 – 2.3)</li><li>**Wave 6**: Studio UI & Asset Repository UI (Tasks 6.2, 6.3)</li><li>**Wave 6**: Platform Metrics UI (Task 6.5)</li><li>**Wave 7**: RLS Isolation integration tests (Task 7.3)</li></ul>                                                         |
| **Developer 3** _(Orchestration)_ | Publishing APIs, scheduling/retry engine cron, Stripe integration, and Scheduling UI | <ul><li>**Wave 3**: Publishing, Scheduling, Retry Engine, Stripe Billing, and Feature Gating (Tasks 3.1 – 3.7)</li><li>**Wave 6**: Calendar & Automation UI (Tasks 6.4, 6.6)</li><li>**Wave 7**: Publish flow & Stripe Webhook integration tests (Tasks 7.1, 7.2)</li></ul>                                                                                                                                |

---

## 6. How to Contribute

1. **Get the Task**: Refer to **[tasks.md]** and find your assigned tasks based on your track above.
2. **Branch Naming**: Branch off `main` using the task number as prefix (e.g. `feature/1.5-asset-storage` or `feature/3.3-scheduler`).
3. **Format & Lint**: Ensure your code passes all linting/formatting rules before committing:
   - Frontend: `npm run lint` and `npm run format` (run from the `frontend/` directory).
4. **Submit PR**: Open a Pull Request on GitHub. Once approved and merged, check off your completed task in `tasks.md`.
