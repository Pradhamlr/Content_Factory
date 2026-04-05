# Autonomous Content Factory

## Project Title
Autonomous Content Factory

## The Problem
Marketing teams often need to turn one source document into multiple channel-specific assets, but doing that manually is slow, repetitive, and inconsistent. This project addresses the challenge of transforming a single source such as text, a PDF, or a URL into a blog post, social thread, and email teaser through a guided multi-agent workflow.

## The Solution
Autonomous Content Factory is a multi-agent content generation system with a production-style frontend and backend. It uses a Researcher agent to extract facts and ambiguities, a Writer agent to create channel-specific content, and an Editor agent to validate quality and factual grounding. The app supports pasted text, PDF upload with extraction, and URL ingestion, then lets users review, regenerate, approve, override, preview, and export campaign assets through a live agent-room interface.

Key features:
- Multi-source campaign ingestion: text, PDF, and URL
- Multi-agent pipeline: Researcher, Writer, and Gatekeeper
- Iterative review and regeneration workflow
- Human-in-the-loop guidance and manual override
- Final review workspace for blog, social thread, and email teaser
- Responsive preview for desktop and mobile channels
- Campaign persistence with Postgres
- Artifact generation and zip export

## Tech Stack
- Languages:
  - JavaScript
  - Python
- Frontend:
  - React
  - Vite
  - CSS
- Backend:
  - Node.js
  - Express
- Database:
  - PostgreSQL (Supabase Postgres)
- APIs / SDKs / Tools:
  - Groq API via `groq-sdk`
  - `multer` for PDF uploads
  - `pypdf` for PDF text extraction
  - `jszip` for export packaging
  - `cors`
  - `dotenv`

## Setup Instructions

### 1. Clone and install dependencies
Run these commands from the project root:

```bash
npm install
cd backend && npm install
cd ../client && npm install
cd ..
```

### 2. Configure environment variables
Create `backend/.env` and add:

```env
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
PORT=4000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.hnamuhpbjlswktowgktf.supabase.co:5432/postgres
```

### 3. Install Python dependency for PDF extraction
If `pypdf` is not installed:

```bash
python -m pip install pypdf
```

### 4. Run the backend
From the project root:

```bash
npm run backend
```

### 5. Run the frontend
In a second terminal from the project root:

```bash
npm run client
```

### 6. Open the app
Visit:

```text
http://localhost:5173
```

### Optional build check
To build the frontend:

```bash
npm run build:client
```
