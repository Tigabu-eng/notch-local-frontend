# Notch Frontend (No Auth)

Simple React (Vite) frontend for the Notch backend (auth disabled).

## Features
- Upload a .docx to create a call
- Run analysis
- List calls
- Click a call to view insights

## Setup
```bash
npm install
cp .env.example .env
npm run dev
```

Set the backend URL in `.env`:

```bash
VITE_API_BASE_URL=http://localhost:8000
```
