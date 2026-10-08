# Midi Edit

TypeScript libraries and applications for editing and reviewing MIDI files for rhythm games.

## What's in this repo

| Type    | Name                | Description                                                                                                                                                                     |
| ------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package | `@midiedit/core`    | Core MIDI parsing (read/write) library.                                                                                                                                         |
| Package | `@midiedit/views`   | MIDI view library providing non-owning "views" of MIDI data. These views provide an abstraction of the MIDI data in order to more easily interface with a specific MIDI schema. |
| Package | `@midiedit/mixer`   | Provides a simple audio mixing class for managing multitrack audio in a DAW-like environment.                                                                                   |
| App     | `@midiedit/editor`  | React + Three.js web-based MIDI editor app.                                                                                                                                     |
| App     | `@midiedit/desktop` | Tauri v2 desktop container for `@midiedit/editor` across Windows, macOS, and Linux.                                                                                             |

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

### Desktop App (`@midiedit/desktop`)

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
npm install
```

### Build Everything (Libraries & Apps)

```bash
npm run build
```

### Web App (`@midiedit/editor`)

```bash
# Start development server
npm run dev

# Build web editor static bundle
npm run build --workspace=@midiedit/editor

# Browse shared editor components in isolation
npm run storybook
```

### Desktop App (`@midiedit/desktop`)

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

### `@midiedit/core`

#### Construction

```ts
import { Midi, MidiTrack } from "@midiedit/core";

// Create in memory
const midi = new Midi();
const track = new MidiTrack("My Track");
midi.tracks.push(track);

// Load from file
const midi = Midi.fromFile("song.mid");
```

#### Mutating notes

```ts
// Place four notes (C4, D4, D#4, F4) a quarter note apart (assuming ppqn=480), starting at tick 0.
track.addNote(60 /* Pitch */, 0 /* Delta from previous note */);
track.addNote(62, 480);
track.addNote(63, 480);
track.addNote(65, 480);

// A delta of 0 means the note is placed at the same position of the previous note (creating a chord).
track.addNote(63, 0);
track.addNote(62, 0);

// Remove some notes
const notes = track.getNoteEvents();
track.removeNote(notes[0] /* NoteOn */, notes[1] /* NoteOff */);
```
