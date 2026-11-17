# Workflow

This workspace contains the Workflow application. Its Vite entry point and application sources live in this directory, and its desktop wrapper is in [`desktop`](./desktop).

Run the app in a browser with `npx turbo run dev --filter=@openchart/workflow`, or launch it in Tauri with `npm run dev --workspace=@openchart/workflow-desktop`.

The desktop development server requires port 5174 to be available. Build the desktop application with `npm run build --workspace=@openchart/workflow-desktop`.
