import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { EditorCommandId } from "../commands/EditorCommand";

interface MenuItemDefinition {
  id: EditorCommandId;
  label: string;
  accelerator?: string;
}

interface MenuDefinition {
  id: string;
  label: string;
  items: MenuItemDefinition[];
}

interface MenubarProps {
  menus?: MenuDefinition[];
  canExecute: (command: EditorCommandId) => boolean;
  onCommand: (command: EditorCommandId) => void;
}

const MENUS: MenuDefinition[] = [
  {
    id: "file",
    label: "File",
    items: [
      { id: "new", label: "New" },
      { id: "open", label: "Open", accelerator: "Ctrl/Cmd+O" },
      { id: "save", label: "Save", accelerator: "Ctrl/Cmd+S" },
      {
        id: "save-as",
        label: "Save As…",
        accelerator: "Ctrl/Cmd+Shift+S",
      },
      { id: "export", label: "Export" },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    items: [{ id: "settings", label: "Settings", accelerator: "Ctrl/Cmd+," }],
  },
  {
    id: "window",
    label: "Window",
    items: [{ id: "toggle-debug", label: "Debugger..." }],
  },
];

function enabledItemIndexes(
  items: MenuItemDefinition[],
  canExecute: (command: EditorCommandId) => boolean,
): number[] {
  return items.reduce<number[]>((indexes, item, index) => {
    if (canExecute(item.id)) indexes.push(index);
    return indexes;
  }, []);
}

export function Menubar({
  menus = MENUS,
  canExecute,
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
        focusRequestRef.current += 1;
        closeMenu(false);

        if (target instanceof HTMLElement) {
          target.focus();
        }
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

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
                    return (
                      <button
                        ref={(element) => {
                          itemRefList[itemIndex] = element;
                        }}
                        key={item.id}
                        type="button"
                        role="menuitem"
                        className="midi-menubar__item"
                        disabled={disabled}
                        aria-disabled={disabled}
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
                        <span>{item.label}</span>
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
