# Vincco frontend behavior

## Business sources

| Concern | Authoritative source |
|---|---|
| Sessions and roles | backend/src/middleware/requireAuth.ts; backend/src/modules/admin/admin.routes.ts |
| Call start, retry and close | backend/src/modules/calls/calls.routes.ts; backend/src/modules/calls/calls.service.ts |
| Campaign channels and dispositions | /api/catalogs in calls.routes.ts; database/schema.sql |
| Questionnaire rules | frontend/src/utils/callValidation.ts; backend survey validation |
| Draft recovery | frontend/src/utils/callDraft.ts; current MakeCall state machine |
| Finalization and blacklist | docs/contact-finalizations.md; database/schema.sql |
| Imports and reporting | docs/import-contacts.md; docs/report-format.md |

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native select and labeled radio groups | Platform semantics; API catalogs | Native | Browser selection and keyboard |
| Date | Existing native inputs; Intl date formatting | America/Hermosillo, es-MX | Typed year, native month select | Reports and call display |
| Form | Existing API validators; callValidation; shared Button/PasswordInput | API contract | Login, user creation, survey, reports | Typecheck, call-flow tests, browser |
| Scrollbar | frontend/src/styles/index.css | tokens.css | Global baseline, table horizontal overflow | Narrow/desktop browser |
| Toast | Feedback.tsx and existing inline status regions | Operation result | info, success, warning, error | Browser failure/success |
| CRUD | services/api.ts and owning route | Backend | Existing per-module destinations | Browser fixture and API tests |
| Table Selection | Not applicable: no bulk selection introduced | Existing tables | None | No selection controls added |

## Flow ledger

- Agent selects campaign → list of available contacts → prepare contact and phone → API opens call with frozen retry key → recoverable draft → questionnaire returned by the API → campaign channel → review → close through existing API → return to contacts.
- Survey questions render all returned options. Required answers and requires_reason are validated with the existing function. Optional questions can remain blank. Declined means the existing explicit refusal value; never automatically convert unanswered into declined.
- The active call uses attempt.contact_id, dialed_number and dialed_extension, rather than the pre-start picker. Company, branch, campaign and selected person's emails remain distinct.
- Disposition is looked up by the channel's disposition_id. Changing company name retains the backend Blacklist rule. Final Blacklist closure requires an app-owned confirmation; cancellation preserves the form.
- Creation and closure retain synchronous in-flight locks. Server errors preserve entries. Draft loading/version mismatch/save failure remain visible with retry; no automatic discard.
- Notes remain editable in the notebook during questionnaire and review and are saved through the existing sessionStorage draft. Phone clipboard failure offers manual copy.
- Create user keeps the existing stay-on-form outcome, but success is shown only on API success. Admin role creation is confirmed. Password starts masked.
- Work rounds use ConfirmProvider instead of browser confirm; the confirmed request keeps its campaign/agent/expected round identity. Import, reports, classification, blacklist release and finalization API payloads remain unchanged.
- User edit/activate/deactivate were existing no-op placeholders with no API handlers. Display the list as consultation instead of presenting working-looking actions. No backend capability is fabricated.

## State and navigation

Daily history uses `/historial` for agents and `/gestion/historial` for administration. Server ownership comes from the authenticated session; only administration can query other agents. The Hermosillo start date defines the day. Recorded duration sums closed calls, not shift hours or TPA. Date, campaign, agent and page persist in the URL. Server pagination is 25 calls, newest first; requests abort on filter changes. Shared native date/select, Button and shell are canonical; notes use native disclosure. Historical campaigns and inactive agents remain available if they have calls. Refresh is explicit. Reports can be downloaded during the month without closing it; the annual cumulative workbook and selected-month survey sheet retain their existing behavior.

Native BrowserRouter and role boundaries stay in place. The shared shell is responsive and routes set Spanish document titles. Contacts paginate locally in batches of 25 because the current endpoint returns the full eligible list; finalizations retain server pagination. Local search clears immediately. The selected campaign retains its established per-user session storage. Search values are intentionally transient rather than placed in shareable URLs because they can contain client names.

## Feedback and accessibility

Controls retain native keyboard semantics. Errors use alert regions, ordinary status uses polite status regions. Native dialog provides focus containment/inert background and Escape; cancellation returns focus to the invoking control. Native select/date popup appearance is platform-owned. Form validation uses inline messages with noValidate. Reduced-motion and forced-color modes are supported. Tables scroll horizontally without hiding essential data.

## Verification boundaries

Automated API/draft tests and isolated browser fixtures exercise the frontend without altering live business records. Fixtures are under tools/frontend-redesign and never imported into production. Existing backend changes are outside this design change.
