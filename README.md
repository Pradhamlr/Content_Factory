# Autonomous Content Factory

Minimal MVP structure for an AI-assisted content generation workflow with:

- `backend/`: Express + Groq API
- `client/`: React + Vite frontend

Once you add your Groq API key, the app is ready for basic end-to-end AI integration.

## Project Structure

```text
backend/
  index.js
  package.json
  .env.example
  config/
    groq.js
  agents/
    researcher.js
    writer.js
    editor.js
  routes/
    generate.js
  utils/
    safeJson.js

client/
  index.html
  package.json
  vite.config.js
  src/
    App.jsx
    main.jsx
    styles.css
```

## What It Does

The backend exposes:

- `POST /api/generate`

Request:

```json
{
  "input": "Your raw source material"
}
```

Flow:

1. Research agent extracts structured facts
2. Writer agent generates blog, tweet thread, and email teaser
3. Editor agent validates the output
4. If rejected, the writer retries with editor feedback
5. Response returns facts, final content, status, feedback, and attempts

The frontend provides:

- source text input
- generate button wired to the backend
- fact extraction view
- generated content tabs
- editor feedback and attempt summary

## Setup

Install dependencies from the repo root:

```bash
npm install
```

Create your backend env file:

```bash
cd backend
cp .env.example .env
```

Then add your Groq key in `backend/.env`:

```env
GROQ_API_KEY=your_key_here
GROQ_MODEL=llama-3.3-70b-versatile
PORT=4000
```

## Run

Start the backend:

```bash
npm run backend
```

Start the frontend in another terminal:

```bash
npm run client
```

Open:

```text
http://localhost:5173
```

## Build The Client

```bash
npm run build:client
```

## Example API Request

```bash
curl -X POST http://localhost:4000/api/generate \
  -H "Content-Type: application/json" \
  -d "{\"input\":\"Our platform helps marketers turn one product update into blog posts, tweets, and email campaigns faster.\"}"
```

## Notes

- `.env` files are ignored through the root `.gitignore`
- the frontend proxies `/api` requests to `http://localhost:4000`
- the backend defaults to `llama-3.3-70b-versatile`
- you can override the model with `GROQ_MODEL` in `backend/.env`

## Next Good Steps

- add request validation middleware
- add prompt constants or templates
- add logging and rate-limit handling
- persist generations in a database
- replace plain alerts with richer UI feedback states
