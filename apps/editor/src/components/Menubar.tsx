import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export type MenuCommandId = string;

interface MenuItemDefinition {
  id: MenuCommandId;
  label: string;
  accelerator?: string;
  checkable?: boolean;
}

interface MenuDefinition {
  id: string;
  label: string;
  items: MenuItemDefinition[];
}

interface MenubarProps {
  menus?: MenuDefinition[];
  canExecute: (command: MenuCommandId) => boolean;
  isChecked?: (command: MenuCommandId) => boolean;
  onCommand: (command: MenuCommandId) => void;
}

const MENUS: MenuDefinition[] = [
  {
    id: "file",
    label: "File",
    items: [
      { id: "document.new", label: "New" },
      { id: "document.open", label: "Open", accelerator: "Ctrl/Cmd+O" },
      { id: "document.save", label: "Save", accelerator: "Ctrl/Cmd+S" },
      {
        id: "document.save-as",
        label: "Save As…",
        accelerator: "Ctrl/Cmd+Shift+S",
      },
      { id: "document.export-midi", label: "Export" },
      { id: "dialog.open-project", label: "Project..." },
      {
        id: "dialog.open-settings",
        label: "Settings...",
        accelerator: "Ctrl/Cmd+,",
      },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    items: [
      { id: "clipboard.cut", label: "Cut", accelerator: "Ctrl/Cmd+X" },
      { id: "clipboard.copy", label: "Copy", accelerator: "Ctrl/Cmd+C" },
      { id: "clipboard.paste", label: "Paste", accelerator: "Ctrl/Cmd+V" },
    ],
  },
  {
    id: "playback",
    label: "Playback",
    items: [
      {
        id: "playback.toggle-metronome",
        label: "Metronome",
        accelerator: "M",
        checkable: true,
      },
      {
        id: "playback.toggle-clap",
        label: "Highway Clap",
        accelerator: "N",
        checkable: true,
      },
    ],
  },
  {
    id: "window",
    label: "Window",
    items: [
      { id: "dialog.open-debug", label: "Debugger..." },
      { id: "dialog.close-debug", label: "Close Debugger" },
    ],
  },
];

function enabledItemIndexes(
  items: MenuItemDefinition[],
  canExecute: (command: MenuCommandId) => boolean,
): number[] {
  return items.reduce<number[]>((indexes, item, index) => {
    if (canExecute(item.id)) indexes.push(index);
    return indexes;
  }, []);
}

export function Menubar({
  menus = MENUS,
  canExecute,
  isChecked,
  onCommand,
}: MenubarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [activeTrigger, setActiveTrigger] = useState(0);
  const menubarRef = useRef<HTMLDivElement>(null);
  const focusFrameRef = useRef<number | null>(null);
  const focusRequestRef = useRef(0);
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const itemRefs = useRef<Record<string, Array<HTMLButtonElement | null>>>({});

  const scheduleFocus = (callback: () => void): void => {
    focusRequestRef.current += 1;
    const requestId = focusRequestRef.current;

    if (focusFrameRef.current !== null) {
      cancelAnimationFrame(focusFrameRef.current);
    }

    focusFrameRef.current = requestAnimationFrame(() => {
      if (requestId !== focusRequestRef.current) {
        return;
      }

      focusFrameRef.current = null;
      callback();
    });
  };

  const focusTrigger = (menuIndex: number): void => {
    setActiveTrigger(menuIndex);
    triggerRefs.current[menuIndex]?.focus();
  };

  const focusItem = (menuIndex: number, itemIndex: number): void => {
    itemRefs.current[menus[menuIndex].id]?.[itemIndex]?.focus();
  };

  const openMenuAt = (menuIndex: number, itemIndex = 0): void => {
    setOpenMenu(menus[menuIndex].id);
    scheduleFocus(() => focusItem(menuIndex, itemIndex));
  };

  const closeMenu = (returnFocus = true): void => {
    if (focusFrameRef.current !== null) {
      cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = null;
    }
    focusRequestRef.current += 1;

    const menuIndex = menus.findIndex((menu) => menu.id === openMenu);
    setOpenMenu(null);
    if (returnFocus && menuIndex >= 0) {
      scheduleFocus(() => focusTrigger(menuIndex));
    }
  };

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!menubarRef.current?.contains(target as Node)) {
        if (focusFrameRef.current !== null) {
          cancelAnimationFrame(focusFrameRef.current);
          focusFrameRef.current = null;
        }
        focusRequestRef.current += 1;
        setOpenMenu(null);

        if (target instanceof HTMLElement) {
          target.focus();
        }
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(
    () => () => {
      if (focusFrameRef.current !== null) {
        cancelAnimationFrame(focusFrameRef.current);
      }
    },
    [],
  );

  const moveTrigger = (currentIndex: number, delta: number): void => {
    const nextIndex = (currentIndex + delta + menus.length) % menus.length;
    focusTrigger(nextIndex);
    setOpenMenu(null);
  };

  const handleTriggerKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    menuIndex: number,
  ): void => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        moveTrigger(menuIndex, 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        moveTrigger(menuIndex, -1);
        break;
      case "ArrowDown":
      case "Enter":
      case " ":
        event.preventDefault();
        if (openMenu === menus[menuIndex].id) {
          closeMenu(false);
        } else {
          const enabled = enabledItemIndexes(
            menus[menuIndex].items,
            canExecute,
          );
          openMenuAt(menuIndex, enabled[0] ?? 0);
        }
        break;
      case "Escape":
        event.preventDefault();
        closeMenu(true);
        break;
      case "Home":
        event.preventDefault();
        focusTrigger(0);
        break;
      case "End":
        event.preventDefault();
        focusTrigger(menus.length - 1);
        break;
    }
  };

  const handleItemKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    menuIndex: number,
    itemIndex: number,
  ): void => {
    const menu = menus[menuIndex];
    const enabled = enabledItemIndexes(menu.items, canExecute);
    const enabledPosition = enabled.indexOf(itemIndex);

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (enabled.length > 0) {
          focusItem(
            menuIndex,
            enabled[(enabledPosition + 1 + enabled.length) % enabled.length],
          );
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (enabled.length > 0) {
          focusItem(
            menuIndex,
            enabled[(enabledPosition - 1 + enabled.length) % enabled.length],
          );
        }
        break;
      case "Home":
        event.preventDefault();
        focusItem(menuIndex, enabled[0] ?? itemIndex);
        break;
      case "End":
        event.preventDefault();
        focusItem(menuIndex, enabled[enabled.length - 1] ?? itemIndex);
        break;
      case "ArrowLeft":
        event.preventDefault();
        moveTrigger(menuIndex, -1);
        break;
      case "ArrowRight":
        event.preventDefault();
        moveTrigger(menuIndex, 1);
        break;
      case "Escape":
        event.preventDefault();
        closeMenu(true);
        break;
      case "Tab":
        closeMenu(false);
        break;
    }
  };

  return (
    <nav ref={menubarRef} className="midi-menubar" aria-label="Application">
      <div className="midi-menubar__menus" role="menubar">
        {menus.map((menu, menuIndex) => {
          const isOpen = openMenu === menu.id;
          const menuId = `menu-${menu.id}`;
          const itemRefList = itemRefs.current[menu.id] ?? [];
          itemRefs.current[menu.id] = itemRefList;

          return (
            <div className="midi-menubar__menu" key={menu.id}>
              <button
                ref={(element) => {
                  triggerRefs.current[menuIndex] = element;
                }}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls={isOpen ? menuId : undefined}
                className="midi-menubar__trigger"
                tabIndex={activeTrigger === menuIndex ? 0 : -1}
                onFocus={() => setActiveTrigger(menuIndex)}
                onClick={() => {
                  setActiveTrigger(menuIndex);
                  if (isOpen) closeMenu(false);
                  else {
                    const enabled = enabledItemIndexes(menu.items, canExecute);
                    openMenuAt(menuIndex, enabled[0] ?? 0);
                  }
                }}
                onKeyDown={(event) => handleTriggerKeyDown(event, menuIndex)}
              >
                {menu.label}
              </button>
              {isOpen ? (
                <div id={menuId} className="midi-menubar__popup" role="menu">
                  {menu.items.map((item, itemIndex) => {
                    const disabled = !canExecute(item.id);
                    const checked = isChecked?.(item.id) ?? false;
                    return (
                      <button
                        ref={(element) => {
                          itemRefList[itemIndex] = element;
                        }}
                        key={item.id}
                        type="button"
                        role={item.checkable ? "menuitemcheckbox" : "menuitem"}
                        className="midi-menubar__item"
                        disabled={disabled}
                        aria-disabled={disabled}
                        aria-checked={item.checkable ? checked : undefined}
                        data-command={item.id}
                        onClick={() => {
                          if (disabled) return;
                          onCommand(item.id);
                          closeMenu(true);
                        }}
                        onKeyDown={(event) =>
                          handleItemKeyDown(event, menuIndex, itemIndex)
                        }
                      >
                        <span>
                          {checked ? "✓ " : ""}
                          {item.label}
                        </span>
                        {item.accelerator ? (
                          <span className="midi-menubar__accelerator">
                            {item.accelerator}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
