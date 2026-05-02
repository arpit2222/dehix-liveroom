# DEHIX Live Room — Workspace

## Overview

Full-stack real-time AI-powered Web3 hiring platform. pnpm monorepo with TypeScript throughout.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 + Socket.io v4
- **Primary database**: MongoDB (Mongoose) — all collections prefixed `test_livechat_`
- **Live chat**: Firebase Firestore — path `test_livechat/rooms/{roomId}/messages`
- **Auth**: JWT (signed with `SESSION_SECRET`), stored in `localStorage` as `dehix_token`
- **AI**: OpenAI via Replit AI Integrations proxy (`AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY`), model `gpt-5.2`
- **Validation**: Zod (`zod/v4`)
- **API codegen**: Orval (from OpenAPI spec in `lib/api-spec`)
- **Build**: esbuild (ESM bundle)
- **Frontend**: React 19 + Vite 7 + Tailwind CSS v4 + shadcn/ui

## Artifacts

### `artifacts/api-server` (`@workspace/api-server`)
Express + Socket.io backend. Port 8080. Serves `/api` and `/socket.io`.
- `src/index.ts` — HTTP server + Socket.io setup
- `src/app.ts` — Express app, all routes mounted
- `src/socket.ts` — Socket.io room event handlers
- `src/routes/` — auth, rooms, ai, talent, tickets, milestones, nda
- `src/models/` — Mongoose models (User, SbtCredential, LiveRoom, RoomRole, RoomParticipant, Ticket, Milestone, Nda)
- `src/seed.ts` — demo data seed script

### `artifacts/dehix-live-room` (`@workspace/dehix-live-room`)
React + Vite frontend. Dark purple Web3 theme.
- `src/pages/Landing.tsx` — marketing landing page
- `src/pages/Login.tsx` / `Register.tsx` — auth pages
- `src/pages/CreateRoom.tsx` — AI project scoping + room creation
- `src/pages/LiveRoom.tsx` — 3-panel live room (roles/participants | brief/tickets/milestones/nda | video/chat)
- `src/pages/BusinessDashboard.tsx` / `TalentDashboard.tsx` / `TalentProfile.tsx`
- `src/components/` — ReputationRing, StatusBadge, SBTCredentialCard, OnlineIndicator
- `src/context/AuthContext.tsx` — JWT auth context
- `src/lib/firebase.ts` — Firestore client

## Shared Libraries

- `lib/api-spec` — OpenAPI spec (source of truth for all routes)
- `lib/api-zod` — Generated Zod schemas
- `lib/api-client-react` — Generated React Query hooks

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/api-server run seed` — seed demo accounts and room data

## Demo Accounts (after seed)

- `business@demo.com` / `demo123` — Business account (Nexus Protocol)
- `alex@demo.com` / `demo123` — Talent (Solidity + DeFi, rep 920)
- `priya@demo.com` / `demo123` — Talent (React + Node.js, rep 875)
- `marco@demo.com` / `demo123` — Talent (ZK Proofs, rep 960)
- `yuki@demo.com` / `demo123` — Talent (Solidity + Node.js)
- `sara@demo.com` / `demo123` — Talent (React)
- Demo room: `NEXUS001` (status: open)

## Environment Secrets

- `MONGODB_URI` — MongoDB connection string
- `SESSION_SECRET` — JWT signing secret
- `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_PROJECT_ID` — Firebase config
- `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI proxy (Replit-managed)

## Architecture Notes

- MongoDB collection names ALL prefixed `test_livechat_`
- Socket.io path `/socket.io` is proxied alongside `/api` through the shared Replit proxy
- Firebase Firestore used exclusively for live chat (real-time messages)
- OpenAI model: `gpt-5.2`
- All generated React Query hooks pass `{ id, data }` shape to mutate — never a positional ID argument
