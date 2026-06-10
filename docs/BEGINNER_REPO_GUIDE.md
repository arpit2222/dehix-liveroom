# DEHIX Live Room Beginner Repo Guide

This document is for a developer who is new to this repository and needs to find frontend files, backend files, AI prompts, API routes, models, PDF generation, and common bug-fix locations quickly.

## 1. What This Repo Is

DEHIX Live Room is a TypeScript monorepo with:

- React frontend: business dashboard, talent dashboard, launch flow, live room UI.
- Express backend: auth, rooms, launch phases, AI tools, PDFs, tickets, milestones, NDA.
- MongoDB/Mongoose models: users, rooms, launch sessions, tickets, roles, milestones.
- Generated API client packages: frontend hooks and backend Zod schemas generated from OpenAPI.

The root workspace is controlled by `package.json`.

Main folders:

```txt
artifacts/
  api-server/        Backend Express API
  dehix-live-room/   Frontend React app

lib/
  api-spec/          OpenAPI spec
  api-client-react/  Generated React API client/hooks
  api-zod/           Generated Zod schemas for backend request validation
  db/                Drizzle schema, currently separate from main Mongoose API

scripts/             Local dev runner scripts
attached_assets/     Reference assets and pasted prompt/product notes
```

## 2. How To Run The Project

Install dependencies:

```bash
npm install
```

Create environment file:

```txt
artifacts/api-server/.env
```

Use `.env.example` as reference.

Important variables:

```txt
MONGODB_URI=
SESSION_SECRET=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_API_VERSION=
AZURE_OPENAI_DEPLOYMENT=
FIREBASE_API_KEY=
FIREBASE_APP_ID=
FIREBASE_PROJECT_ID=
```

Run frontend and backend together:

```bash
npm run dev
```

Defaults:

```txt
Frontend: http://localhost:5173
Backend:  http://localhost:5001
API base: http://localhost:5001/api
```

Run checks before committing:

```bash
npm run typecheck
npm run build -w @workspace/api-server
npm run build -w @workspace/dehix-live-room
```

Seed demo data:

```bash
npm run build
npm run seed
```

Demo login from README:

```txt
Business: business@demo.com / demo123
Talent:   alex@demo.com / demo123
```

## 3. Frontend Map

Frontend app path:

```txt
artifacts/dehix-live-room/
```

Frontend entry files:

```txt
artifacts/dehix-live-room/src/main.tsx
artifacts/dehix-live-room/src/App.tsx
artifacts/dehix-live-room/src/index.css
```

Routing is in:

```txt
artifacts/dehix-live-room/src/App.tsx
```

Current routes:

```txt
/                       Landing page
/login                  Login
/register               Register
/business/dashboard     Business dashboard
/talent/dashboard       Talent dashboard
/talent/discovery       Talent search/discovery
/talent/profile/:id     Talent profile
/room/create            AI launch/create room flow
/room/:id               Live room dashboard
/room/join              Join room by code
```

Important frontend pages:

```txt
artifacts/dehix-live-room/src/pages/Landing.tsx
artifacts/dehix-live-room/src/pages/Login.tsx
artifacts/dehix-live-room/src/pages/Register.tsx
artifacts/dehix-live-room/src/pages/BusinessDashboard.tsx
artifacts/dehix-live-room/src/pages/TalentDashboard.tsx
artifacts/dehix-live-room/src/pages/TalentDiscovery.tsx
artifacts/dehix-live-room/src/pages/TalentProfile.tsx
artifacts/dehix-live-room/src/pages/CreateRoom.tsx
artifacts/dehix-live-room/src/pages/LiveRoom.tsx
artifacts/dehix-live-room/src/pages/JoinRoom.tsx
```

Shared frontend components:

```txt
artifacts/dehix-live-room/src/components/
artifacts/dehix-live-room/src/components/ui/
```

Auth context:

```txt
artifacts/dehix-live-room/src/context/AuthContext.tsx
```

Firebase chat setup:

```txt
artifacts/dehix-live-room/src/lib/firebase.ts
```

Frontend API calls are done in two styles:

- Generated React Query hooks from `@workspace/api-client-react`.
- Direct `fetch(...)` calls for newer/custom endpoints.

If you cannot find a frontend API call, search:

```bash
rg -n "fetch\\(|useGet|useCreate|useUpdate|/api/" artifacts/dehix-live-room/src
```

## 4. Backend Map

Backend app path:

```txt
artifacts/api-server/
```

Backend entry files:

```txt
artifacts/api-server/src/index.ts
artifacts/api-server/src/app.ts
```

`app.ts` mounts all API routes under:

```txt
/api
```

Route registration is in:

```txt
artifacts/api-server/src/routes/index.ts
```

Major backend route files:

```txt
artifacts/api-server/src/routes/auth.ts       Login/register/me/profile
artifacts/api-server/src/routes/rooms.ts      Room CRUD, room dashboard, export, PDF downloads
artifacts/api-server/src/routes/launch.ts     Multi-phase AI launch flow
artifacts/api-server/src/routes/ai.ts         Room AI tools, NDA, tickets, milestones, chat, docs
artifacts/api-server/src/routes/talent.ts     Talent search/profile/invites
artifacts/api-server/src/routes/tickets.ts    Room ticket subroutes
artifacts/api-server/src/routes/milestones.ts Room milestone subroutes
artifacts/api-server/src/routes/nda.ts        Room NDA subroutes
artifacts/api-server/src/routes/health.ts     Health check
```

Backend helpers:

```txt
artifacts/api-server/src/lib/openai.ts          Azure OpenAI client/env config
artifacts/api-server/src/lib/mongodb.ts         Mongo connection
artifacts/api-server/src/lib/jwt.ts             JWT helper
artifacts/api-server/src/lib/logger.ts          Pino logger
artifacts/api-server/src/lib/reportPdf.ts       HTML-to-PDF templates using Puppeteer
artifacts/api-server/src/lib/reportPdfCache.ts  Background PDF warmup/cache
artifacts/api-server/src/lib/simplePdf.ts       Older simple PDF builder
```

Auth middleware:

```txt
artifacts/api-server/src/middlewares/auth.ts
```

Socket setup:

```txt
artifacts/api-server/src/socket.ts
```

Seed data:

```txt
artifacts/api-server/src/seed.ts
```

## 5. Database Models

The main backend uses Mongoose models in:

```txt
artifacts/api-server/src/models/
```

Important models:

```txt
User.ts                User account, role, profile
LiveRoom.ts            Main room/dashboard entity
LaunchSession.ts       AI launch phase session and cached PDF metadata
LaunchClarification.ts Dynamic technical questions and answers
RoomRole.ts            Roles needed in a room
RoomParticipant.ts     Invited/joined talent in a room
Ticket.ts              Kanban tickets
Milestone.ts           Milestone/escrow simulation
Nda.ts                 NDA document and signatures
RoomActivity.ts        Activity feed
SbtCredential.ts       Talent reputation/skill credential data
GeneratedDoc.ts        AI-generated document records
```

If a page displays data and you cannot find where it comes from, first identify the route, then check the matching model.

Example:

```txt
LiveRoom.tsx frontend -> /api/rooms/:id backend route -> LiveRoom, RoomRole, RoomParticipant models
```

## 6. Where The AI Prompts Are

Important: prompts are currently inline inside backend route files. There is no separate `prompts/` folder.

To find all prompts:

```bash
rg -n "prompt|systemPrompt|userPrompt|You are|Return ONLY|chat\\.completions" artifacts/api-server/src
```

### Launch Flow Prompts

File:

```txt
artifacts/api-server/src/routes/launch.ts
```

This is the most important file for the "business idea -> analysis -> blueprint -> room" flow.

Prompts in `launch.ts`:

```txt
POST /api/launch
Purpose: Phase 1 business idea validation.
Search text: "You are DEHIX_Idea_Analysis_JSON_Prompt"

GET/POST /api/launch/:id/technical-questions
Purpose: Generate optional technical follow-up questions.
Search text: "You are a senior product manager preparing simple technical discovery questions"

POST /api/launch/:id/blueprint
Purpose: Phase 2 business and development blueprint.
Search text: "DEHIX_Business_Development_Blueprint_Generator"
Variables: blueprintSystemPrompt, userPrompt

POST /api/launch/:id/scope
Purpose: Convert launch session into live room dashboard data.
Search text: "You are a senior project manager and solution architect"
```

Frontend for this flow:

```txt
artifacts/dehix-live-room/src/pages/CreateRoom.tsx
```

Main frontend functions in `CreateRoom.tsx`:

```txt
validateIdea()                 Calls POST /api/launch
downloadValidationPdf()         Calls GET /api/launch/:id/business-validation.pdf
loadTechnicalQuestions()        Calls POST /api/launch/:id/technical-questions
generateBlueprint()             Calls POST /api/launch/:id/blueprint
downloadBlueprintPdf()          Calls GET /api/launch/:id/business-blueprint.pdf
generateTalentRecommendations() Calls POST /api/launch/:id/talent-recommendations
enterRoomDashboard()            Calls POST /api/launch/:id/scope
```

### Room AI Prompts

File:

```txt
artifacts/api-server/src/routes/ai.ts
```

Prompts in `ai.ts`:

```txt
POST /api/ai/scope
Purpose: Generate a project scope from a raw room description.
Search text: "You are a senior Web3 project manager"

POST /api/ai/generate-nda
Purpose: Generate NDA/agreement text.
Search text: "Generate a professional Web3 freelance NDA"

POST /api/ai/suggest-milestones
Purpose: Generate suggested milestones.
Search text: "You are a Web3 project manager. Given this project"

POST /api/ai/chat
Purpose: In-room AI assistant.
Search text: "You are the DEHIX Live Room AI"

POST /api/ai/suggest-tickets
Purpose: Generate development tickets.
Search text: "You are a Web3 engineering lead"

POST /api/ai/generate-document
Purpose: Generate pitch deck, technical deck, BD strategy, SOW, project brief.
Search text: "systemPrompts"

POST /api/ai/chat-summary
Purpose: Summarize room chat.
Search text: "You are a meeting summarization AI"
```

Frontend for room AI:

```txt
artifacts/dehix-live-room/src/pages/LiveRoom.tsx
```

## 7. Launch Flow: End-To-End

User starts at:

```txt
/room/create
```

Frontend file:

```txt
artifacts/dehix-live-room/src/pages/CreateRoom.tsx
```

Backend file:

```txt
artifacts/api-server/src/routes/launch.ts
```

Flow:

```txt
1. User enters raw business idea.
2. Frontend calls POST /api/launch.
3. Backend sends Phase 1 business validation prompt to Azure OpenAI.
4. Backend saves LaunchSession.researchText.
5. Backend starts background validation PDF warmup.
6. Frontend shows business analysis.
7. User can download validation PDF.
8. User moves to technical questions.
9. Frontend calls /api/launch/:id/technical-questions.
10. Backend generates optional questions and returns mandatory + optional questions.
11. User answers questions.
12. Frontend calls POST /api/launch/:id/blueprint.
13. Backend sends blueprint prompt to Azure OpenAI.
14. Backend saves LaunchSession.technicalDocText.
15. Backend starts background blueprint PDF warmup.
16. Frontend shows blueprint report.
17. User can download blueprint PDF.
18. User can generate talent recommendations.
19. User enters live room dashboard through POST /api/launch/:id/scope.
20. Backend creates LiveRoom, roles, milestones, tickets, and saves launchSessionId.
```

Related models:

```txt
LaunchSession.ts
LaunchClarification.ts
LiveRoom.ts
RoomRole.ts
Milestone.ts
Ticket.ts
```

## 8. PDF Generation

PDF files are generated on the backend.

PDF template/rendering:

```txt
artifacts/api-server/src/lib/reportPdf.ts
```

PDF cache/warmup:

```txt
artifacts/api-server/src/lib/reportPdfCache.ts
```

Launch PDF endpoints:

```txt
GET /api/launch/:id/business-validation.pdf
GET /api/launch/:id/business-blueprint.pdf
```

Room dashboard PDF endpoints:

```txt
GET /api/rooms/:id/business-validation.pdf
GET /api/rooms/:id/business-blueprint.pdf
```

Frontend buttons:

```txt
Phase pages: artifacts/dehix-live-room/src/pages/CreateRoom.tsx
Room page:   artifacts/dehix-live-room/src/pages/LiveRoom.tsx
```

How caching works:

```txt
1. After Phase 1 output is saved, warmBusinessValidationPdf(session) starts.
2. After Phase 2 blueprint is saved, warmBusinessBlueprintPdf(session) starts.
3. PDF state/path/hash are saved on LaunchSession.
4. Download endpoints call getOrCreateBusinessValidationPdf or getOrCreateBusinessBlueprintPdf.
5. If cached file exists and hash matches, backend returns the existing PDF.
6. If missing/not ready, backend generates it and stores it.
```

The generated PDFs are saved under:

```txt
generated-reports/launch/
```

or the custom env path:

```txt
REPORT_PDF_DIR=
```

## 9. Live Room Dashboard

Frontend:

```txt
artifacts/dehix-live-room/src/pages/LiveRoom.tsx
```

Backend:

```txt
artifacts/api-server/src/routes/rooms.ts
artifacts/api-server/src/routes/tickets.ts
artifacts/api-server/src/routes/milestones.ts
artifacts/api-server/src/routes/nda.ts
artifacts/api-server/src/routes/ai.ts
```

The room dashboard includes:

```txt
Room title/status/code
Export and PDF buttons
Roles
Participants
Project brief
Tickets/Kanban
Milestones
NDA
Activity feed
Chat/AI assistant
Generated docs
Meet link
Notes
```

If you need to change a visible button/text/action in the room dashboard, start in:

```txt
artifacts/dehix-live-room/src/pages/LiveRoom.tsx
```

Then find the matching backend endpoint in:

```txt
artifacts/api-server/src/routes/rooms.ts
artifacts/api-server/src/routes/ai.ts
```

## 10. API Client And Validation

OpenAPI spec:

```txt
lib/api-spec/openapi.yaml
```

Generated frontend client:

```txt
lib/api-client-react/src/generated/api.ts
lib/api-client-react/src/generated/api.schemas.ts
```

Generated backend Zod schemas:

```txt
lib/api-zod/src/generated/api.ts
```

Backend imports schemas from:

```txt
@workspace/api-zod
```

Frontend imports hooks from:

```txt
@workspace/api-client-react
```

Important warning:

Some newer endpoints are called manually with `fetch(...)` and may not exist in OpenAPI yet. If generated hooks are missing, search for direct `fetch` calls before assuming the endpoint does not exist.

Search command:

```bash
rg -n "fetch\\(|@workspace/api-client-react|@workspace/api-zod" artifacts lib
```

## 11. Common Bug-Fix Guide

### "I need to change the business validation prompt"

Open:

```txt
artifacts/api-server/src/routes/launch.ts
```

Search:

```txt
DEHIX_Idea_Analysis_JSON_Prompt
```

Also check frontend display in:

```txt
artifacts/dehix-live-room/src/pages/CreateRoom.tsx
```

### "I need to change the blueprint prompt"

Open:

```txt
artifacts/api-server/src/routes/launch.ts
```

Search:

```txt
DEHIX_Business_Development_Blueprint_Generator
blueprintSystemPrompt
userPrompt
```

If you change the JSON response shape, update frontend rendering in:

```txt
artifacts/dehix-live-room/src/pages/CreateRoom.tsx
```

Search:

```txt
BlueprintReport
```

### "I need to change the live room generated brief/roles/tickets/milestones"

Open:

```txt
artifacts/api-server/src/routes/launch.ts
```

Search:

```txt
Return this exact JSON structure:
"roles"
"milestones"
"tickets"
```

The generated data is saved into:

```txt
LiveRoom
RoomRole
Milestone
Ticket
```

Frontend display:

```txt
artifacts/dehix-live-room/src/pages/LiveRoom.tsx
```

### "I need to change PDF design"

Open:

```txt
artifacts/api-server/src/lib/reportPdf.ts
```

Important functions:

```txt
buildBusinessValidationPdf()
buildBusinessBlueprintPdf()
baseHtml()
renderPdf()
```

Cache behavior:

```txt
artifacts/api-server/src/lib/reportPdfCache.ts
```

### "PDF button exists but download fails"

Check:

```txt
Frontend button:
artifacts/dehix-live-room/src/pages/CreateRoom.tsx
artifacts/dehix-live-room/src/pages/LiveRoom.tsx

Backend endpoint:
artifacts/api-server/src/routes/launch.ts
artifacts/api-server/src/routes/rooms.ts

PDF renderer:
artifacts/api-server/src/lib/reportPdf.ts

Cache:
artifacts/api-server/src/lib/reportPdfCache.ts

Model fields:
artifacts/api-server/src/models/LaunchSession.ts
artifacts/api-server/src/models/LiveRoom.ts
```

Also confirm Puppeteer can run on the machine. If Chromium is missing or blocked, PDF generation can fail even when TypeScript passes.

### "Login or auth is broken"

Frontend:

```txt
artifacts/dehix-live-room/src/pages/Login.tsx
artifacts/dehix-live-room/src/pages/Register.tsx
artifacts/dehix-live-room/src/context/AuthContext.tsx
```

Backend:

```txt
artifacts/api-server/src/routes/auth.ts
artifacts/api-server/src/middlewares/auth.ts
artifacts/api-server/src/lib/jwt.ts
artifacts/api-server/src/models/User.ts
```

### "Talent search or recommendations are wrong"

Frontend:

```txt
artifacts/dehix-live-room/src/pages/TalentDiscovery.tsx
artifacts/dehix-live-room/src/pages/TalentProfile.tsx
artifacts/dehix-live-room/src/pages/CreateRoom.tsx
```

Backend:

```txt
artifacts/api-server/src/routes/talent.ts
artifacts/api-server/src/routes/launch.ts
artifacts/api-server/src/models/SbtCredential.ts
```

Search:

```txt
calculateTalentRecommendation
talent-recommendations
```

### "Chat is not working"

Frontend:

```txt
artifacts/dehix-live-room/src/pages/LiveRoom.tsx
artifacts/dehix-live-room/src/lib/firebase.ts
```

Backend AI assistant:

```txt
artifacts/api-server/src/routes/ai.ts
```

Search:

```txt
/api/ai/chat
DEHIX Live Room AI
```

Firebase env variables must be configured for live chat.

### "Generated docs are wrong"

Frontend:

```txt
artifacts/dehix-live-room/src/pages/LiveRoom.tsx
artifacts/dehix-live-room/src/components/DocModal.tsx
```

Backend:

```txt
artifacts/api-server/src/routes/ai.ts
artifacts/api-server/src/models/GeneratedDoc.ts
```

Search:

```txt
generate-document
systemPrompts
pitch_deck
technical_deck
bd_strategy
sow
project_brief
```

## 12. Search Commands You Will Use Often

Find a route:

```bash
rg -n "router\\.(get|post|put|delete)" artifacts/api-server/src/routes
```

Find frontend page text:

```bash
rg -n "text you see in browser" artifacts/dehix-live-room/src
```

Find an API call:

```bash
rg -n "/api/rooms|/api/launch|/api/ai|fetch\\(" artifacts/dehix-live-room/src
```

Find a model field:

```bash
rg -n "fieldName" artifacts/api-server/src/models artifacts/api-server/src/routes
```

Find prompts:

```bash
rg -n "You are|Return ONLY|prompt|systemPrompt|userPrompt" artifacts/api-server/src/routes
```

Find PDF code:

```bash
rg -n "pdf|PDF|reportPdf|business-validation|business-blueprint" artifacts
```

Find socket events:

```bash
rg -n "emit\\(|socket|room:" artifacts/api-server/src artifacts/dehix-live-room/src
```

## 13. How To Safely Make A Change

Use this workflow:

```txt
1. Find the visible UI or endpoint using rg.
2. Read the frontend page/component.
3. Find the backend endpoint it calls.
4. Read the model fields used by that endpoint.
5. Make the smallest code change.
6. Run typecheck.
7. Build frontend/backend if the change touched them.
8. Test the exact browser flow manually.
9. Commit only related files.
```

Commands:

```bash
npm run typecheck
npm run build -w @workspace/api-server
npm run build -w @workspace/dehix-live-room
git status --short
git diff
```

## 14. Files To Be Careful With

These files affect large parts of the app:

```txt
artifacts/api-server/src/routes/launch.ts
artifacts/api-server/src/routes/ai.ts
artifacts/api-server/src/routes/rooms.ts
artifacts/dehix-live-room/src/pages/CreateRoom.tsx
artifacts/dehix-live-room/src/pages/LiveRoom.tsx
artifacts/api-server/src/models/LaunchSession.ts
artifacts/api-server/src/models/LiveRoom.ts
lib/api-spec/openapi.yaml
lib/api-client-react/src/generated/api.ts
lib/api-zod/src/generated/api.ts
```

Avoid editing generated files directly unless you know the generator flow. Generated files can be overwritten later.

## 15. Quick Feature Ownership Table

```txt
Feature                         Frontend file                                      Backend file
Landing page                    pages/Landing.tsx                                  -
Login/register                  pages/Login.tsx, pages/Register.tsx                routes/auth.ts
Business dashboard              pages/BusinessDashboard.tsx                        routes/rooms.ts
Talent dashboard                pages/TalentDashboard.tsx                          routes/talent.ts
Talent discovery/profile        pages/TalentDiscovery.tsx, TalentProfile.tsx       routes/talent.ts
Create room launch flow         pages/CreateRoom.tsx                               routes/launch.ts
Business validation prompt      pages/CreateRoom.tsx                               routes/launch.ts
Blueprint prompt/report         pages/CreateRoom.tsx                               routes/launch.ts
Talent recommendations          pages/CreateRoom.tsx                               routes/launch.ts, models/SbtCredential.ts
Live room dashboard             pages/LiveRoom.tsx                                 routes/rooms.ts
Tickets                         pages/LiveRoom.tsx                                 routes/tickets.ts, routes/ai.ts
Milestones                      pages/LiveRoom.tsx                                 routes/milestones.ts, routes/ai.ts
NDA                             pages/LiveRoom.tsx                                 routes/nda.ts, routes/ai.ts
Room AI chat                    pages/LiveRoom.tsx                                 routes/ai.ts
Generated docs                  pages/LiveRoom.tsx, components/DocModal.tsx        routes/ai.ts
PDF generation                  pages/CreateRoom.tsx, pages/LiveRoom.tsx           lib/reportPdf.ts, lib/reportPdfCache.ts
```

## 16. Mental Model For Debugging

Most bugs fit this pattern:

```txt
Frontend state -> API request -> backend route -> model/database -> response -> frontend render
```

Example:

```txt
User clicks "Download PDF"
-> LiveRoom.tsx calls /api/rooms/:id/business-blueprint.pdf
-> rooms.ts finds the LiveRoom
-> rooms.ts finds LaunchSession
-> reportPdfCache.ts returns cached PDF or generates one
-> reportPdf.ts renders PDF with Puppeteer
-> browser downloads blob
```

When debugging, follow the chain in that order.

