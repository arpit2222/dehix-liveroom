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
- Azure OpenAI resource, API key, API version, and deployed chat model name

## Setup & Running

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   Copy `.env.example` to `artifacts/api-server/.env` and fill in your details:
   - `MONGODB_URI`: Your MongoDB connection string.
   - `AZURE_OPENAI_ENDPOINT`: Your Azure OpenAI endpoint, for example `https://your-resource-name.openai.azure.com`.
   - `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key.
   - `AZURE_OPENAI_API_VERSION`: Azure OpenAI API version used by your resource.
   - `AZURE_OPENAI_DEPLOYMENT`: The deployment name of your chat model in Azure OpenAI.
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

## Azure OpenAI Notes

- Azure OpenAI uses deployment names in API calls. Set `AZURE_OPENAI_DEPLOYMENT` to the deployment name you created in Azure, not just the model family name.
- If you add image, audio, or transcription deployments later, set `AZURE_OPENAI_IMAGE_DEPLOYMENT`, `AZURE_OPENAI_AUDIO_DEPLOYMENT`, or `AZURE_OPENAI_TRANSCRIPTION_DEPLOYMENT`.
- If Azure OpenAI variables are missing, the app falls back to the included mock AI responses for local development.

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
