# Autonomous Content Factory

## Project Title
Autonomous Content Factory - Multi-Agent Marketing Campaign Generator

## The Problem
Marketing teams repeatedly repurpose the same product launch or technical source document into different channel formats such as blogs, social posts, and newsletters. This manual process creates creative burnout, slows launches, and increases the risk of factual drift or inconsistent tone across channels.

## The Solution
Autonomous Content Factory turns one source document into a coordinated multi-channel campaign through a specialized AI agent workflow.

The system uses:
- `Analytical Brain`: extracts core product features, target audience, value proposition, and ambiguities into a structured fact sheet.
- `The Voice`: generates a blog post, 5-post social thread, and email teaser from the fact sheet.
- `The Gatekeeper`: reviews drafts for hallucinations, tone, specificity, and factual grounding before approval.

The app includes a Campaign Assembly page, live Agent Room, Content Library review workspace, responsive desktop/mobile preview, human guidance, targeted regeneration, manual override, saved campaigns, artifact downloads, and campaign kit zip export.

## Tech Stack
Programming languages:
- JavaScript
- Python

Frontend:
- React
- Vite
- CSS

Backend:
- Node.js
- Express

Database:
- PostgreSQL via Supabase Postgres

APIs and third-party tools:
- Groq API with `groq-sdk` for agent LLM calls
- Supabase Postgres for campaign persistence
- `pg` for PostgreSQL access
- `multer` for PDF upload handling
- `pypdf` for PDF text extraction
- `jszip` for campaign kit export
- `cors` for frontend/backend deployment support
- `dotenv` for environment configuration

## Setup Instructions

### 1. Install Node dependencies
From the project root:

```bash
npm install
```

### 2. Install Python dependency for PDF extraction
From the project root:

```bash
python -m pip install -r backend/requirements.txt
```

If your system uses `python3` instead of `python`, run:

```bash
python3 -m pip install -r backend/requirements.txt
```

### 3. Configure backend environment variables
Create a file named `backend/.env`:

```env
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
PORT=4000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@YOUR_SUPABASE_HOST:5432/postgres
FRONTEND_URL=http://localhost:5173
```

Notes:
- Use your own Groq API key.
- Use your own Supabase Postgres connection string.
- For deployed Render + Vercel setup, set `FRONTEND_URL` to your Vercel frontend URL.

### 4. Run the backend locally
From the project root:

```bash
npm run backend
```

The backend runs on:

```text
http://localhost:4000
```

### 5. Run the frontend locally
Open a second terminal from the project root:

```bash
npm run client
```

The frontend runs on:

```text
http://localhost:5173
```

### 6. Use the app
Open `http://localhost:5173` and start a campaign by:
- pasting source text,
- uploading and reviewing a PDF,
- or entering a source URL.

Then follow the flow through:
- Campaign Assembly,
- Agent Room,
- Content Library,
- Responsive Preview,
- artifact download / campaign kit export.

### 7. Build the frontend
To create a production frontend build:

```bash
npm run build:client
```

The build output is generated in:

```text
client/dist
```

## Deployment Notes
For the current deployment setup:
- Backend can be deployed on Render with start command `node backend/index.js`.
- Frontend can be deployed on Vercel with root directory set to the repository root, build command `npm run build:client`, and output directory `client/dist`.
- If frontend and backend are on different domains, set the Vercel environment variable:

```env
VITE_API_BASE_URL=https://your-render-backend-url.onrender.com
```

On Render, set:

```env
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
DATABASE_URL=your_supabase_postgres_connection_string
FRONTEND_URL=https://your-vercel-frontend-url.vercel.app
```

For PDF extraction on Render, use this build command:

```bash
npm install && python3 -m pip install -r backend/requirements.txt
```
