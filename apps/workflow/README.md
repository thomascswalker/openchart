# Workflow

This workspace contains the Workflow application. Its Vite entry point and application sources live in this directory, and its desktop wrapper is in [`desktop`](./desktop).

Run the app in a browser with `npx turbo run dev --filter=@openchart/workflow`, or launch it in Tauri with `npm run dev --workspace=@openchart/workflow-desktop`.

The desktop development server requires port 5174 to be available. Build the desktop application with `npm run build --workspace=@openchart/workflow-desktop`.

The GitHub token exchange runs as a Netlify function at `/api/auth/github/token`.
For local function testing, run `netlify dev --filter @openchart/workflow` from
the repository root and use the URL it reports. Configure the OAuth callback for that origin and provide
the frontend and server variables shown in [`.env.example`](./.env.example).
Set server secrets in Netlify's environment, not in frontend variables or
committed files. Deploy changes before testing the production callback.

Run the workflow browser tests with `npm run test --workspace=@openchart/workflow`.
