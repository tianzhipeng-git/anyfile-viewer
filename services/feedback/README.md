# Shared feedback service

One Cloudflare Worker and one D1 `feedback` table serve multiple sites. Project keys are public labels, not credentials. There is no projects table, public read API, user account system or attachment upload.

## Local development

From the repository root:

```sh
pnpm install
pnpm --filter @anyfile/feedback-service db:local
pnpm --filter @anyfile/feedback-service dev
```

In another terminal:

```sh
NEXT_PUBLIC_FEEDBACK_ENDPOINT=http://localhost:8787/v1/projects/anyfile/feedback pnpm dev
```

Open `http://localhost:3000/en` or `/zh-CN/view` and use the header Feedback button. A missing endpoint shows the support email and disables submission. The form sends no request before the user submits. Drafts survive closing the dialog, but not reloading the document. No Turnstile scripts or iframes are loaded, so the viewer's COOP/COEP headers remain intact.

## Deploy

1. Authenticate Wrangler with the Cloudflare account that will own the shared service.
2. Create the database and put its returned `database_id` into `wrangler.jsonc`:

   ```sh
   pnpm --filter @anyfile/feedback-service exec wrangler d1 create feedback
   ```

3. Apply the schema and deploy the Worker:

   ```sh
   pnpm --filter @anyfile/feedback-service exec wrangler d1 migrations apply feedback --remote
   pnpm --filter @anyfile/feedback-service run deploy
   ```

4. Use the actual HTTPS Worker URL returned by deployment, optionally with a custom domain. Set Vercel's `NEXT_PUBLIC_FEEDBACK_ENDPOINT` to `https://<worker-host>/v1/projects/anyfile/feedback` for Production, then rebuild/redeploy the site. This value is public and captured during the Next.js build. Do not use the local HTTP endpoint in a production deployment.
5. Verify from the actual site: submit one test entry, check it in D1, close/reopen the dialog, and check that the viewer remains usable. Mark the test entry ignored or delete it by its exact project key and submission ID.

Preview deployments should use a separate test Worker/database with explicitly allowed preview origins; do not broadly allow `*.vercel.app`. Until configured, leave the Preview endpoint unset. Localhost origins are accepted only when the Worker request itself uses localhost.

### Production deployment

- Worker: `shared-feedback`, hosted at `https://shared-feedback.tzpabc.workers.dev`.
- D1: `feedback` (`fbf7ce36-90f4-45e4-b704-3b9826565130`).
- Vercel project: `tianzhipeng-gits-projects/anyfile-viewer`.
- Production `NEXT_PUBLIC_FEEDBACK_ENDPOINT`: `https://shared-feedback.tzpabc.workers.dev/v1/projects/anyfile/feedback`.

The generated `worker-configuration.d.ts` is ignored; regenerate it with `pnpm --filter @anyfile/feedback-service types` after changing bindings. The Worker has its own TypeScript configuration and is excluded from Next.js type compilation.

## Connect another project

Add the public key and exact allowed origins in `src/projects.ts`, then redeploy the Worker. Point that site's form to `/v1/projects/<key>/feedback`. Removing the entry disables that site's submissions while preserving stored feedback. No migration is needed for a new project.

```json
{
  "submissionId": "e2da7285-b596-4c91-a0dd-44eecc8c7849",
  "category": "bug",
  "message": "The PDF preview is blank.",
  "email": "",
  "context": { "locale": "en", "format": ".pdf" },
  "website": ""
}
```

Send JSON with an `Origin` matching that project's allowlist. `website` is an empty honeypot. Allowed categories: `bug`, `feature`, `other`. Message: 1–2,000 UTF-16 code units; optional email: up to 254; whole request: at most 16 KiB. Optional context accepts only strings for `locale` (16), `format` (24), `pluginId` (100), `appVersion` (64). Other properties are rejected. Anyfile only sends interface language and the format explicitly typed by the user, not filenames, URLs, parser errors or file contents.

Generate a UUID v4 for each new submission. Retrying the same content must reuse it; changed content must get a new UUID. Uniqueness is scoped to `(project_key, submission_id)`. The service responds only after the database write succeeds:

| Status | Meaning |
| --- | --- |
| 201 | Stored; body contains `submissionId` |
| 200 | Identical retry; same `submissionId` |
| 400 / 413 / 415 | Invalid input / too large / JSON required |
| 403 | Unknown project or disallowed origin |
| 405 | Public reads and other methods are unavailable |
| 409 | Submission ID already used for different content |
| 429 | Rate limited; retry after 60 seconds |
| 503 | Storage/service failure; keep the draft and retry with the same ID |

## Abuse protection and privacy

Two native Cloudflare rate-limit bindings apply before database access: 5 attempts per project/IP/minute and 100 attempts per project/minute. Counters are approximate and local to each Cloudflare location, not a global budget or strict accounting system. IP-based limits can affect users sharing a network. Namespace IDs must be unique in the account unless intentional counter sharing is desired.

Origin/CORS checks are not authentication: non-browser clients can forge Origin. The honeypot and limits provide basic protection, not strong bot verification. A public project key does not grant any read access. All projects still share service availability and account quotas. Monitor usage; if spam becomes a problem, reassess verification without weakening the viewer's cross-origin isolation.

IP addresses are used only as transient limiter keys, not stored in the feedback table. Application error logs contain only a project key and fixed event name, never payloads or SQL error details. Cloudflare may still collect ordinary infrastructure request metadata. Feedback and email are private operator data; render them as text in any future dashboard. No automated retention/deletion job is included in v1.

## Operator workflow

Use Cloudflare Dashboard → D1 → feedback → Tables / Console. Filter all operations by project key. Common queries:

```sql
SELECT submission_id, category, message, email, context, status, created_at
FROM feedback
WHERE project_key = 'anyfile'
ORDER BY created_at DESC
LIMIT 50;

UPDATE feedback SET status = 'resolved'
WHERE project_key = 'anyfile' AND submission_id = '<exact-id>';

DELETE FROM feedback
WHERE project_key = 'anyfile' AND submission_id = '<exact-id>';
```

Status values are `new`, `in_progress`, `resolved`, `ignored`. Reply manually using the existing support mailbox when an email was provided. The public endpoint never lists or returns feedback contents.

## Checks

```sh
pnpm --filter @anyfile/feedback-service check
pnpm --filter @anyfile/feedback-service test
pnpm lint
pnpm test:app
pnpm build
```

Service tests use Miniflare's actual Worker runtime, SQLite-backed D1 and rate-limit bindings in ephemeral storage. They cover concurrent retries, changed-content conflicts, origin/project boundaries, invalid payloads, rate limiting and storage failure.

References: [Cloudflare rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
