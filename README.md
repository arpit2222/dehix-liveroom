# DEHIX Live Room

Full-stack real-time AI-powered Web3 hiring platform. A standard npm monorepo with TypeScript throughout.

## Features
- AI-generated project briefs, Kanban boards, NDAs, and Milestones.
- In-room AI assistant.
- Firebase-powered real-time live chat.
- Role-based access and matchmaking based on simulated on-chain credentials.

## Prerequisites
- Node.js version 24
- MongoDB (running locally or via Atlas)
- Firebase (for Live Chat)
- Azure OpenAI chat deployment or a Gemini API key for AI features

## Setup & Running

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   Copy `.env.example` to `artifacts/api-server/.env` and fill in your details:
   - `MONGODB_URI`: Your MongoDB connection string.
   - `AI_PROVIDER`: `auto`, `azure-openai`, or `gemini`. `auto` uses Azure OpenAI when fully configured, otherwise Gemini when `GEMINI_API_KEY` is set.
   - `AZURE_OPENAI_ENDPOINT`: Your Azure OpenAI endpoint, for example `https://your-resource-name.openai.azure.com`.
   - `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key.
   - `AZURE_OPENAI_API_VERSION`: Azure OpenAI API version used by your resource.
   - `AZURE_OPENAI_DEPLOYMENT`: The deployment name of your chat model in Azure OpenAI.
   - `GEMINI_API_KEY`: Your Google Gemini API key.
   - `GEMINI_MODEL`: Gemini model name, defaults to `gemini-2.5-flash`.
   - Firebase credentials (if you want live chat).

3. **Seed Database (Demo Data)**
   Populate MongoDB with demo accounts and dummy rooms:
   ```bash
   npm run build
   npm run seed
   ```

4. **Run Locally**
   Start the API and React app together:
   ```bash
   npm run dev
   ```

   By default, the API runs on `http://localhost:5001` and the frontend runs on `http://localhost:5173`.
   You can also run them separately with `npm run dev:api` and `npm run dev:client`.

## Production Handoff Checklist

Before deploying, set these environment variables on the hosting platform:

- `NODE_ENV=production`
- `PORT`: API port supplied by the platform.
- `MONGODB_URI`: Production MongoDB/Atlas connection string.
- `SESSION_SECRET`: At least 32 random characters. The API refuses to start in production without this.
- `CORS_ORIGINS` or `CLIENT_ORIGIN`: Exact frontend URL, for example `https://app.example.com`. Use comma-separated values for multiple allowed origins.
- `VITE_API_URL`: Public API origin used by the frontend build when the API is not served from the same origin. Use the origin only, for example `https://api.example.com`, not `https://api.example.com/api`.
- `VITE_ALLOWED_HOSTS`: Comma-separated hostnames allowed by Vite preview/dev, for example `app.example.com`.
- `TRUST_PROXY`: Reverse proxy hop count for the API. Production defaults to `1`; on Azure Container Apps set this to the correct trusted hop count if auth rate limits appear shared by all users.
- `AUTH_RATE_LIMIT`: Failed login/register attempts allowed per 15 minutes, default `300`.
- AI provider and Firebase values from `.env.example` as needed.

Run these checks before handing a build to production:

```bash
npm ci
npm run build
npm audit --omit=dev
```

Security hardening included in the backend:

- HTTP security headers via Helmet.
- API and auth rate limits via `API_RATE_LIMIT` and `AUTH_RATE_LIMIT`; the stricter auth limiter applies only to login/register and successful attempts are not counted.
- Production CORS allowlist.
- JWT secret enforcement in production.
- Room owner/member authorization on room, ticket, milestone, NDA, AI document, and Socket.IO room access paths.

Keep the seeded demo accounts out of production databases. Use `npm run seed` only for local demos or isolated staging data.

If production login returns `Invalid credentials`, first verify which database and user collection the API is reading:

```bash
npm run auth:diagnose --workspace @workspace/api-server -- --email business@demo.com --password <account-password>
```

This checks the Live Room `dl_users` collection and reports whether the same email appears in likely main-platform collections such as `users`, `businesses`, or `freelancers`. To create missing demo users without deleting production data:

```bash
npm run auth:diagnose --workspace @workspace/api-server -- --ensure-demo-users
```

Set `AUTH_DIAGNOSTIC_DEMO_PASSWORD` at runtime before running that command.

## AI Provider Notes

- Azure OpenAI uses deployment names in API calls. Set `AZURE_OPENAI_DEPLOYMENT` to the deployment name you created in Azure, not just the model family name.
- Gemini uses `GEMINI_API_KEY` and optional `GEMINI_MODEL`. Set `AI_PROVIDER=gemini` to force Gemini even when Azure OpenAI variables are also present.
- With `AI_PROVIDER=auto`, the backend uses Azure OpenAI first when all Azure chat variables are valid, then falls back to Gemini when `GEMINI_API_KEY` is configured.
- If you add image, audio, or transcription deployments later, set `AZURE_OPENAI_IMAGE_DEPLOYMENT`, `AZURE_OPENAI_AUDIO_DEPLOYMENT`, or `AZURE_OPENAI_TRANSCRIPTION_DEPLOYMENT`.
- If no AI provider is configured or the provider request fails, AI endpoints return an error instead of generated placeholder content.

## Demo Accounts

The `npm run seed` command automatically creates the following dummy accounts for testing out the workflows. Use the demo password configured in the seed script for local-only demos.

- **Business:** `business@demo.com` (Nexus Protocol)
- **Talent (Solidity):** `alex@demo.com`
- **Talent (React):** `priya@demo.com`
- **Talent (ZK Proofs):** `marco@demo.com`
- **Talent (Solidity + Node):** `yuki@demo.com`
- **Talent (React):** `sara@demo.com`

**Demo Room:**
You can join the test room using the code: `NEXUS001`

## Future Scope
Based on the Product Requirements Document (PRD), the following features are planned for future sprints:
- **Business & Technical Documents:** Auto-generate structured PRDs and Technical Specifications directly from the Launch Room workflow.
- **Team Recommendation Engine:** AI analyzes the project scope and recommends an exact team structure (e.g., 1 Senior Solidity Dev, 1 Fractional PM) before beginning the talent matching phase.
- **On-Chain Smart Contract Escrow:** Transition the milestone payments from simulated escrow to real on-chain smart contracts (e.g., Polygon/Arbitrum).
- **GitHub Integration:** Automatically synchronize AI-generated Kanban tickets into an actual GitHub repository.
