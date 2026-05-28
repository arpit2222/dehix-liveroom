# Migration Changes From Initial Repo

This document summarizes the changes made to convert the original Replit-oriented project into a normal local npm project, move AI output to Azure OpenAI, and remove mock/demo AI behavior.

## Initial Repo State

The project originally included Replit-specific setup and preview artifacts. It also had mock AI helpers and mockup sandbox code, so some AI flows could return generated placeholder output instead of depending fully on a real AI provider.

That setup was useful for quick Replit previews, but it was not ideal for a normal local project where the backend should fail clearly if Azure OpenAI is not configured or if the Azure API call fails.

## Replit Setup Removed

Removed Replit-only files and scripts:

- `.replit`
- `.replitignore`
- `scripts/post-merge.sh`
- `.replit-artifact/artifact.toml` files
- Replit Vite/plugin dependencies
- Replit mockup preview sandbox

Why:

- The project is no longer intended to depend on Replit runtime behavior.
- Local development should work with standard npm commands.
- The repo should not carry preview-only artifacts that are unrelated to production/local execution.

## Normal npm Project Setup

Added normal workspace runner scripts:

- `scripts/dev.mjs`
- `scripts/run-workspace.mjs`

Updated root `package.json` scripts:

- `npm run dev`
- `npm run dev:api`
- `npm run dev:client`
- `npm run seed`

Why:

- Developers can now run the project from a regular terminal without Replit.
- API and frontend workspaces can be started together or independently.
- The scripts handle nested npm execution more reliably on Windows/local environments.

## Azure OpenAI Configuration

The backend AI client was changed from a generic OpenAI key setup to Azure OpenAI.

Required environment variables are now:

- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_API_VERSION`
- `AZURE_OPENAI_DEPLOYMENT`

Main file changed:

- `artifacts/api-server/src/lib/openai.ts`

Why:

- The project is now intended to use Azure OpenAI instead of a direct OpenAI API key.
- Azure requires endpoint, deployment name, API version, and API key.
- Keeping this config centralized makes routes easier to validate and maintain.

## Mock AI Removed

Removed mock AI and mock document generation code:

- `artifacts/api-server/src/lib/mockAi.ts`
- `artifacts/api-server/src/lib/mockDocs.ts`
- `artifacts/mockup-sandbox/`

Updated AI routes:

- `artifacts/api-server/src/routes/ai.ts`
- `artifacts/api-server/src/routes/launch.ts`

Why:

- Output should be based on the configured Azure OpenAI API.
- If Azure OpenAI is not configured, the backend should return a clear error.
- If Azure OpenAI fails, the frontend should show the error instead of silently returning fake output.

## Error Handling Changed

AI endpoints now return real errors instead of falling back to mock data.

Current behavior:

- Missing Azure env vars return `503`.
- Azure API failures return `502`.
- Frontend AI actions display backend error messages to the user.

Frontend file changed:

- `artifacts/dehix-live-room/src/pages/LiveRoom.tsx`

Why:

- This makes production behavior honest and debuggable.
- Users can immediately see when Azure configuration or API access is the problem.
- No fake AI response is shown when the actual API is unavailable.

## Documentation Updated

Updated docs and environment examples:

- `README.md`
- `.env.example`

Why:

- Setup instructions now match the normal npm workflow.
- Required Azure OpenAI variables are documented.
- Replit-specific setup instructions were removed.

## Workspace Cleanup

The root npm workspace list was changed to include only the real application workspaces:

- `artifacts/api-server`
- `artifacts/dehix-live-room`

Why:

- The deleted mockup sandbox should not be treated as an install/build workspace.
- Installs and builds are faster and cleaner.
- Workspace ownership is clearer.

## Build and Runtime Verification

The project was installed, built, and run locally.

Verified:

- `npm install` completed.
- `npm run build` completed successfully.
- API started on `http://localhost:5001`.
- Frontend started on `http://localhost:5173`.
- `GET /api/healthz` returned healthy status.
- Frontend loaded successfully in the browser.
- Azure-backed AI smoke test returned a real response through the backend.

Note:

- On this machine, portable Node/npm was used from `C:\tmp\node-v24.14.0-win-x64` because npm was not available on the system PATH.
- A regular Node.js installation can be used instead.

## Commits Created

The migration work was committed in these commits:

- `55848b6` - Remove Replit setup and use Azure OpenAI
- `10f4eb3` - Require Azure OpenAI and remove mocks
- `99dc254` - Fix local npm dev runners

## Final Result

The repo is now a normal npm-based local project. Replit-specific files and mock AI behavior have been removed. AI output now depends on Azure OpenAI configuration, and failures are shown as errors instead of being replaced with mock responses.
