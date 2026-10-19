import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "./shared/Button";
import { HorizontalSeparator } from "./shared/Separator";
import { Text } from "./shared/Text";

export type MenuCommandId = string;

interface MenuCommandDefinition {
  type?: "item";
  id: MenuCommandId;
  label: string;
  shortcut?: string;
  checkable?: boolean;
}

interface MenuSeparatorDefinition {
  type: "separator";
}

type MenuItemDefinition = MenuCommandDefinition | MenuSeparatorDefinition;

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
      { id: "document.new", label: "New Project" },
      { id: "document.open", label: "Open Project...", shortcut: "Ctrl/Cmd+O" },
      { id: "document.save", label: "Save", shortcut: "Ctrl/Cmd+S" },
      {
        id: "document.save-as",
        label: "Save As...",
        shortcut: "Ctrl/Cmd+Shift+S",
      },
      { type: "separator" },
      { id: "document.import-midi", label: "Import" },
      { id: "document.export-midi", label: "Export" },
      { type: "separator" },
      { id: "dialog.open-project", label: "Project..." },
      {
        id: "dialog.open-settings",
        label: "Settings...",
        shortcut: "Ctrl/Cmd+,",
      },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    items: [
      { id: "clipboard.cut", label: "Cut", shortcut: "Ctrl/Cmd+X" },
      { id: "clipboard.copy", label: "Copy", shortcut: "Ctrl/Cmd+C" },
      { id: "clipboard.paste", label: "Paste", shortcut: "Ctrl/Cmd+V" },
    ],
  },
  {
    id: "playback",
    label: "Playback",
    items: [
      {
        id: "playback.toggle-metronome",
        label: "Metronome",
        shortcut: "M",
        checkable: true,
      },
      {
        id: "playback.toggle-clap",
        label: "Highway Clap",
        shortcut: "N",
        checkable: true,
      },
      {
        id: "playback.toggle-vocal-pitch-feedback",
        label: "Vocal Pitch Feedback",
        shortcut: "P",
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
  {
    id: "help",
    label: "Help",
    items: [
      { id: "updater.check", label: "Check for updates..." },
      { id: "dialog.open-about", label: "About" },
    ],
  },
];

function enabledItemIndexes(
  items: MenuItemDefinition[],
  canExecute: (command: MenuCommandId) => boolean,
): number[] {
  return items.reduce<number[]>((indexes, item, index) => {
    if (item.type !== "separator" && canExecute(item.id)) indexes.push(index);
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
          const handleMenuClick = () => {
            setActiveTrigger(menuIndex);
            if (isOpen) closeMenu(false);
            else {
              const enabled = enabledItemIndexes(menu.items, canExecute);
              openMenuAt(menuIndex, enabled[0] ?? 0);
            }
          };
          const size = "24px";

          return (
            <div className="midi-menubar__menu" key={menu.id}>
              <Button
                ref={(element) => {
                  triggerRefs.current[menuIndex] = element;
                }}
                flat
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls={isOpen ? menuId : undefined}
                className="midi-menubar__trigger"
                tabIndex={activeTrigger === menuIndex ? 0 : -1}
                onClick={handleMenuClick}
                onKeyDown={(event) => handleTriggerKeyDown(event, menuIndex)}
                height={size}
                minHeight={size}
                maxHeight={size}
              >
                {menu.label}
              </Button>
              {isOpen ? (
                <div id={menuId} className="midi-menubar__popup" role="menu">
                  {menu.items.map((item, itemIndex) => {
                    if (item.type === "separator") {
                      return (
                        <HorizontalSeparator
                          key={`separator-${itemIndex}`}
                          thickness={1}
                          marginY={0}
                          marginX={0}
                          minWidth="100%"
                        />
                      );
                    }

                    const disabled = !canExecute(item.id);
                    const checked = isChecked?.(item.id) ?? false;
                    const handleItemClick = () => {
                      if (disabled) return;
                      onCommand(item.id);
                      closeMenu(true);
                    };
                    return (
                      <Button
                        ref={(element) => {
                          const refs = itemRefs.current[menu.id] ?? [];
                          refs[itemIndex] = element;
                          itemRefs.current[menu.id] = refs;
                        }}
                        key={item.id}
                        flat
                        role={item.checkable ? "menuitemcheckbox" : "menuitem"}
                        className="midi-menubar__item"
                        disabled={disabled}
                        aria-disabled={disabled}
                        aria-checked={item.checkable ? checked : undefined}
                        data-command={item.id}
                        onClick={handleItemClick}
                        onKeyDown={(event) =>
                          handleItemKeyDown(event, menuIndex, itemIndex)
                        }
                        height={size}
                        maxWidth={"calc(100% - 4px)"}
                        minHeight={size}
                        maxHeight={size}
                        paddingX="var(--size-med)"
                        marginY="1px"
                        marginX="2px"
                      >
                        <Text
                          disabled={disabled}
                          textAlign="left"
                          flexWrap={"nowrap"}
                        >
                          {checked ? "✓ " : ""}
                          {item.label}
                        </Text>
                        {item.shortcut && (
                          <Text disabled={disabled} textAlign="right">
                            {item.shortcut}
                          </Text>
                        )}
                      </Button>
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
