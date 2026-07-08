---
name: spartan-ng
description: Guidelines and commands for using Spartan (spartan-ng), the Angular port of shadcn/ui, for UI components.
---

# Spartan (spartan-ng) Skill

This project uses **Spartan** (`@spartan-ng`), which is the Angular equivalent of `shadcn/ui`. It provides accessible, unstyled UI components that are customized via Tailwind CSS and Helm directives.

## Adding New Components

To add a new Spartan UI component to the project, use the Spartan CLI. 
Run the following command from the `frontend` directory:

```bash
npx spartan ui add <component-name>
```

Example: `npx spartan ui add button` or `npx spartan ui add dialog`.

When you run this command, Spartan will automatically place the component's source code inside the configured directory (usually under `libs/ui` or similar, as defined in `frontend/components.json`).

## Using Components

1. **Importing:** Spartan components are standalone. You must import the specific Helm (Hlm) and Spartan (Brn) directives/components into your standalone Angular component.
   
   Example:
   ```typescript
   import { HlmButtonDirective } from '@spartan-ng/ui-button-helm';
   
   @Component({
     standalone: true,
     imports: [HlmButtonDirective],
     // ...
   })
   ```

2. **Templates:** Use the `hlm` directive to apply Spartan's default Tailwind styles. You can easily override these styles by adding standard Tailwind classes to the element.
   
   Example:
   ```html
   <button hlmBtn variant="default" class="w-full">
     Click Me
   </button>
   ```

## Best Practices

- **Do not modify the underlying Spartan core files (`libs/ui/...`) unless strictly necessary.** You should customize components mostly via Tailwind classes on the templates where they are used.
- Ensure that `styles.scss` has the required Spartan Tailwind presets (which are already configured).
- Since Spartan relies heavily on Tailwind, avoid using custom SCSS (`styleUrl`) for components where Spartan primitives can be used with utility classes.
- When you are asked to build a new UI piece (like a modal, toast, or dropdown), always prefer checking if a Spartan component exists first before building it from scratch.
