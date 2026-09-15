---
version: alpha
colors:
  primary: "#007e96"
  accent: "#00b2c8"
  background: "#eaf2f4"
  surface: "#ffffff"
  text: "#103d50"
  muted: "#526c78"
  border: "#cbdce2"
  navigation: "#073d54"
typography:
  body:
    fontFamily: "Segoe UI, Arial, sans-serif"
    fontSize: "15px"
    lineHeight: "1.55"
  data:
    fontFamily: "Consolas, monospace"
rounded:
  panel: "8px"
  control: "6px"
spacing:
  panel: "32px"
  mobile: "16px"
components:
  callWorkspace:
    description: "Contact ribbon, sequential working area, persistent notes."
---

## Overview

Vincco's contact-center workspace. Spanish-speaking agents need the company, actual contact person, dialed number and extension visible throughout a call. The user approved the second prototype: a horizontal contact ribbon, four operational stages, and a notebook beside the working area. Carry that identity into login, contact lists and administration. Preserve the project's current workflows and real API data. No prototype questions, contacts, outcomes or artificial statistics belong in production.

## Colors

Runtime is canonical (Model B): `frontend/src/styles/tokens.css` → `frontend/src/styles/index.css` → components. Values above mirror the accepted light palette. Dark overrides in tokens.css use background #0b202b, surface #132e3a, text #e1f2f5, muted #aac2cb and primary #74dce7. Theme preference is the sole localStorage value introduced (`vincco-theme`), independent of session and call drafts. `public/theme-init.js` applies it before paint. White is reserved for the original logo background; surfaces use `--v-surface`.

## Typography

Segoe UI for clear Spanish UI on the established Windows workstation. Consolas is reserved for timers, phone presentation and progress. Display headings are restrained at 25–30px in the application; login can be larger. Long company names and emails wrap instead of disappearing.

## Layout

Maximum workspace width 1520px. Header contains logo, current module, agent identity and theme. Navigation wraps on small screens and remains accessible. The call workspace has a compact ribbon, stages and a two-column content/notebook layout that stacks below 740px. Document owns vertical scrolling; tables own horizontal overflow. No fixed-height page wrappers clip long surveys or forms.

## Elevation & Depth

Flat surfaces with visible borders. Depth is reserved for the native modal dialog and its backdrop. Existing screen shadow recipes adapt to border-only surfaces.

## Shapes

8px panels, 6px controls, square structural separators. Turquoise rule at the ribbon and notebook connects the identity across the workspace.

## Components

`tokens.css` is the owner for semantic `--v-*` colors. The Tailwind v4 adapter in index.css maps existing gray/indigo/error/success utilities to those semantics; screen bg-white was migrated to bg-surface. New components consume tokens through shared CSS recipes.

Canonical components: AppLayout, ThemeToggle, Button, Feedback, SearchInput, PasswordInput, ConfirmProvider and CallWorkspace. Native select popups retain platform keyboard behavior and geometry; no custom listbox is introduced. User/admin layouts delegate to AppLayout. API/services, survey validation, and draft serialization remain the domain owners.

## Do's and Don'ts

- Preserve every real question, option, required explanation and free-text question.
- Label company, person, executive, branch, campaign, dialed phone, extension and email distinctly.
- Derive disposition from the campaign catalog. Never assign business meaning from a color or invent an unclassified mapping.
- Keep notes available while answering. Preserve failure/retry/recovery states and idempotent start requests.
- Keep meaningful danger/warning/success distinctions in both themes. Honor reduced motion and visible focus.
- Do not replace working operations with sample data or no-op controls.
