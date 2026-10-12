# OpenChart

TypeScript libraries and applications for editing and reviewing MIDI files for rhythm games.

## What's in this repo

| Type    | Name                 | Description                                                                                                                                                                     |
| ------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package | `@openchart/core`    | Core MIDI parsing (read/write) library.                                                                                                                                         |
| Package | `@openchart/views`   | MIDI view library providing non-owning "views" of MIDI data. These views provide an abstraction of the MIDI data in order to more easily interface with a specific MIDI schema. |
| Package | `@openchart/mixer`   | Provides a simple audio mixing class for managing multitrack audio in a DAW-like environment.                                                                                   |
| App     | `@openchart/editor`  | React + Three.js web-based MIDI editor app.                                                                                                                                     |
| App     | `@openchart/desktop` | Tauri v2 desktop container for `@openchart/editor` across Windows, macOS, and Linux.                                                                                            |

## Prerequisites

### General (Libraries & Web App)

- **Node.js**: `v20.0.0` or higher
- **npm**: `v10.0.0` or higher (bundled with Node.js)

The easiest way to install and manage Node.js is via [fnm](https://github.com/Schniz/fnm) (Fast Node Manager), which works the same way across Windows, macOS, and Linux:

```bash
# macOS / Linux / WSL
curl -fsSL https://fnm.vercel.app/install | bash

# Windows (PowerShell)
winget install Schniz.fnm
```

Restart your shell, then install and use the latest LTS release of Node.js (npm is included automatically):

```bash
fnm install --lts
fnm use --lts
```

Alternatively, on macOS/Linux/WSL you can use [nvm](https://github.com/nvm-sh/nvm):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install --lts
nvm use --lts
```

Verify the install:

```bash
node -v
npm -v
```

### Desktop App (`@openchart/desktop`)

Building the desktop application requires the **Rust** toolchain and OS-specific C/C++ build tools & system libraries:

#### 1. Rust Toolchain

Install Rust via [rustup](https://rustup.rs/):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

#### 2. OS-Specific System Dependencies

- **Linux / WSL (Ubuntu/Debian)**:

  ```bash
  sudo apt update && sudo apt install -y \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libwebkit2gtk-4.1-dev
  ```

  _(Note: Use `libwebkit2gtk-4.0-dev` if `4.1` is not available on older distributions)._

- **macOS**:
  - Xcode Command Line Tools:
    ```bash
    xcode-select --install
    ```

- **Windows**:
  - [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload.

---

## Development & Building

### Install Dependencies

```bash
npm ci
```

### Build Everything (Libraries & Apps)

```bash
npm run build
```

### Web App (`@openchart/editor`)

```bash
# Install from the repository root
npm ci

# Start development server
npm run dev

# Build web editor static bundle
npm run build --workspace=@openchart/editor

```

### Piano Roll Storybook Harness

Run these commands from the repository root. Build the package exports first;
the editor imports `@openchart/core` and `@openchart/views` from their `dist`
directories.

```bash
npm ci
npm run build --workspace=@openchart/core
npm run build --workspace=@openchart/views
npm run storybook                    # open http://localhost:6006, then Views/Piano Roll
npm run build-storybook
npm run test:storybook --workspace=@openchart/editor
npm run check-types
npm run check
npm test
```

### Desktop App (`@openchart/desktop`)

```bash
# Launch desktop app in development mode
npm run desktop:dev

# Package native desktop application installers
npm run desktop:build
```

### Run Tests

```bash
npm run test
```

---

## Packages

Package-specific API documentation and examples:

- [`@openchart/core`](packages/core/README.md) — read, edit, and write Standard MIDI Files.
- [`@openchart/views`](packages/views/README.md) — create chart-oriented views and edit instrument charts.
- [`@openchart/mixer`](packages/mixer/README.md) — mix and control multitrack audio.
