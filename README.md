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
- OpenAI API Key

## Setup & Running

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   Copy `.env.example` to `artifacts/api-server/.env` and fill in your details:
   - `MONGODB_URI`: Your MongoDB connection string.
   - `AI_INTEGRATIONS_OPENAI_API_KEY`: Your OpenAI API key.
   - Firebase credentials (if you want live chat).

3. **Seed Database (Demo Data)**
   Populate MongoDB with demo accounts and dummy rooms:
   ```bash
   # This requires MONGODB_URI to be exported or present in the .env file!
   set -o allexport; source artifacts/api-server/.env; set +o allexport
   npm run build
   npm run seed --workspace=@workspace/api-server
   ```

4. **Run Locally**
   Start the backend server:
   ```bash
   npm run dev --workspace=@workspace/api-server
   ```
   Start the frontend React app in a new terminal window:
   ```bash
   npm run dev --workspace=@workspace/dehix-live-room
   ```

## Demo Accounts

The `npm run seed` command automatically creates the following dummy accounts for testing out the workflows (all passwords are **`demo123`**):

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
