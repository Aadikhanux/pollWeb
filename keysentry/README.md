# KeySentry

A local GitHub secret-monitoring dashboard built with Next.js, Express, Socket.IO, and a JSON database.

## Run locally

Dependencies are already installed in this workspace. For a fresh checkout, run `npm install` in both `server` and `client`.

1. Copy `server/.env.example` to `server/.env` and add your GitHub token and webhook signing secret. Never commit credentials.
2. In `server`, run `npm run dev`.
3. In `client`, run `npm run dev`.
4. Open http://localhost:3000.

The API listens on 127.0.0.1:4000 by default. Use HOST only when exposing it intentionally. This app is designed for trusted local use: the settings API has no authentication. Add authentication and access controls before public deployment. Only expose the signed webhook path through a tunnel or reverse proxy for a GitHub demo.

## Monitor repositories

Open Monitoring settings on the dashboard. Enter repository names as `owner/repository`, one per line, and optionally enter Discord or Slack webhook URLs. Settings persist locally. Notification URLs can alternatively come from DISCORD_WEBHOOK_URL and SLACK_WEBHOOK_URL; nonempty saved settings take priority.

The polling worker runs immediately and then every 15 seconds. A newly watched repository scans its latest commit. Subsequent polls scan commits since its saved cursor and paginate across batches. The cursor survives server restarts. Duplicate commit deliveries are ignored, and failed file fetches leave the commit available for retry. Polling monitors the default branch; push webhooks can cover other branches.

For faster detection, configure a GitHub webhook:

- Payload URL: your reachable backend URL followed by `/api/webhook/github`.
- Content type: `application/json`.
- Secret: the same value as GITHUB_WEBHOOK_SECRET.
- Events: push events.

Ping events and push payloads are checked against the signature of the original request bytes. Push processing fetches added and modified files at their commit SHA.

## Detection and alerts

Regex candidates are screened using calculated Shannon entropy. Default thresholds are 3.8 for High and 4.5 for Critical, configurable in the dashboard. Patterns cover AWS access keys, GitHub PATs, fine-grained GitHub PATs, Stripe secrets, OpenAI keys, Google keys, and generic assignments. The scanner excludes common generated files and placeholders. This heuristic does not detect every possible credential format.

Findings persist with repository, commit, file path, line, secret type, severity, and entropy. Only masked previews are stored. External alert payloads include the required repository, commit, file, and secret type. Delivery has a 10-second timeout and the dashboard shows sent, failed, or unconfigured status. Failed delivery is recorded; there is currently no durable retry queue.

History loads on opening the dashboard and reconnecting. Search and severity filters apply to loaded records. Load older detections to extend history, and export the loaded filtered records as JSON. Commit links provide context.

## Demo and real commit verification

Simulate Attack generates a synthetic token and runs the actual detector. It persists and broadcasts the masked result as demo data. It does not send external messages, create fake pull requests, or increment real scan metrics.

To verify the complete requirement, configure a disposable repository and a Discord or Slack channel, then commit a randomly generated, nonfunctional token in a source file such as `token = "<random token of at least 32 characters>"`. Avoid placeholder words because the detector deliberately excludes them. Confirm the dashboard finding and channel alert. Record elapsed time from pushing the commit to receiving the alert: webhook processing can be fast, while polling adds up to one polling interval plus API and notification time. Displayed average latency measures fetching and scanning a file, not commit-to-alert delivery time.

## Remediation

Automatic PR creation is disabled by default for new installations. Enabling it requires both config.autoRemediate=true and ENABLE_AUTO_REMEDIATION=true in the server environment. The GitHub token must have write permissions. The worker uses the complete detected secret transiently, keeps it out of stored findings, and replaces exact occurrences with a variable placeholder on a new branch. It also updates .env.example and .gitignore. Review the generated placeholder for your language before merging, and rotate the exposed credential. These operations are not tested against a live repository by the automated checks.

## Checks

- `cd server` then `npm test`: detector and local pipeline regression tests. Tests use a temporary database and mocked notification delivery; no external messages are sent.
- `cd client` then `npm run build`: production build, linting, and static generation.

## Limits

This is a single-process local application. Polling state and history are JSON-backed, webhook processing is serialized, and sustained high volumes need a queue and a transactional database. GitHub API rate limits and large commits can affect coverage and timing. Existing demo records and metrics created by older versions are retained rather than silently deleted.

## Start both services together

From the project root, run npm run dev. Open http://localhost:3000. Next.js forwards /api, /health, and /socket.io to the backend on port 4000, so the browser uses one origin. Stop both services with Ctrl+C. The combined launcher overrides NEXT_PUBLIC_SOCKET_URL to use this local proxy.

