# Overview

OpenChart is a Typescript-based chart editor which provides a MIDI-native backend.

See also: [Vocals](vocals.md), [Rendering](rendering.md),
[Shared components](components.md), [Hotkeys](hotkeys.md) and
[Controls](../controls.md).

## Architecture

### Frontend

```mermaid
flowchart TD
    START["Entrypoint"] ---> BOOTSTRAP["Bootstrap backend"]
    START --> SHELL["Shell"]

    subgraph RT["Runtime"]
      SHELL --> WS["Workspace"]
      SHELL --> MENU["Menu Bar"]
      SHELL --> DLG["Dialogs"]
      DLG ---> SETTINGS["Application Settings"]
      DLG ---> PROJECT["Project Settings"]
      WS --> VM

      subgraph VM["Viewport Manager (1 to 4 panels)"]
          direction TB
          subgraph P1["Viewport Panel 1"]
              direction TB
              TB["Toolbar"]
              TL["Track List<br/><i>(Piano Roll)</i>"] ---> PR
              subgraph CR["View Renderer"]
                  direction TB
                  PR["<b>Piano Roll Renderer</b><br/>2D orthographic"]
                  HW["<b>Highway Renderer</b><br/>3D perspective"]
              end
              TIME["Timeline"]
          end
          P2["Viewport Panel 2"]:::ghost
          P3["Viewport Panel 3"]:::ghost
          P4["Viewport Panel 4"]:::ghost
          P1 ~~~ P2
          P2 ~~~ P3
          P3 ~~~ P4
      end
    end

classDef ghost fill:#ffffff00,stroke:#999999,stroke-dasharray:5 5,color:#888888
```

### Backend

```mermaid
flowchart TD
    direction LR
        subgraph KERNEL["Platform Kernel"]
            direction TB
            NAMING["Bootstrap"]
            SR["<b>Service Registry</b><br/>Discover and register services"]
            AR["<b>Action Registry</b><br/>Discover and register actions which can be run"]
            ACTIONS["Command Actions"]
        end

        subgraph SERVICES["Services"]
            direction TB
            subgraph APPSVC["Application Services"]
                direction LR
                LOG["<b>Logger</b>"]
                FSYS["<b>File System</b><br/>Open, Save, Download"]
                DOC["<b>Document</b><br/>MIDI Data, Chart Metadata, History"]
                PB["<b>Playback</b><br/>Timeline and Transport"]
                SET["<b>Settings</b><br/>User preferences"]
            end
            subgraph EDSVC["Editor Services"]
                direction LR
                EST["<b>Editor State</b><br/>Dialogs and Errors"]
                VPS["<b>Viewports</b><br/>Panel sessions, Editing tools"]
                ACV["<b>Active Chart View</b><br/>Renderer"]
                CLIP["<b>Clipboard</b><br/>Copy, Cut, Paste"]
            end
        end

        NAMING --> SR
        NAMING --> AR
        AR --> ACTIONS
        SR --> SERVICES
        ACTIONS --> SERVICES
```
