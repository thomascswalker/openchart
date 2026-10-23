import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, Heading, HorizontalSeparator } from "..";
import styles from "./popup.module.css";

interface PopupProps {
  trigger: ReactNode;
  title: string;
  width?: CSSProperties["width"];
  onOpen?: () => void;
  onClose?: () => void;
  children: ReactNode;
}

interface PopupTriggerProps {
  onClick?: MouseEventHandler<HTMLButtonElement>;
  "aria-haspopup"?: React.AriaAttributes["aria-haspopup"];
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  "data-popup-trigger"?: string;
}

interface PopupPosition {
  top: number;
  left: number;
  arrowX: number;
  placement: "top" | "bottom";
  maxHeight: number;
}

type PopupCSSProperties = CSSProperties & { "--popup-arrow-x": string };

const VIEWPORT_GUTTER = 8;
const POPUP_GAP = 6;
const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

const Popup = ({
  trigger,
  title,
  children,
  width,
  onOpen,
  onClose,
}: PopupProps) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopupPosition | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const getTriggerElement = useCallback(
    (): HTMLButtonElement | null =>
      document.querySelector<HTMLButtonElement>(`[data-popup-trigger="${id}"]`),
    [id],
  );

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const triggerElement = getTriggerElement();
    const popupElement = popupRef.current;
    if (!triggerElement || !popupElement) return;

    const updatePosition = (): void => {
      popupElement.style.maxHeight = `calc(100vh - ${VIEWPORT_GUTTER * 2}px)`;
      const triggerRect = triggerElement.getBoundingClientRect();
      const initialPopupRect = popupElement.getBoundingClientRect();
      const spaceBelow =
        window.innerHeight - VIEWPORT_GUTTER - triggerRect.bottom - POPUP_GAP;
      const spaceAbove = triggerRect.top - POPUP_GAP - VIEWPORT_GUTTER;
      const fitsBelow = initialPopupRect.height <= spaceBelow;
      const fitsAbove = initialPopupRect.height <= spaceAbove;
      const placement =
        fitsBelow || (!fitsAbove && spaceBelow >= spaceAbove)
          ? "bottom"
          : "top";
      const maxHeight = Math.max(
        0,
        placement === "bottom" ? spaceBelow : spaceAbove,
      );

      popupElement.style.maxHeight = `${maxHeight}px`;
      const popupRect = popupElement.getBoundingClientRect();
      const left = clamp(
        triggerRect.left,
        VIEWPORT_GUTTER,
        window.innerWidth - popupRect.width - VIEWPORT_GUTTER,
      );
      const top = clamp(
        placement === "bottom"
          ? triggerRect.bottom + POPUP_GAP
          : triggerRect.top - popupRect.height - POPUP_GAP,
        VIEWPORT_GUTTER,
        window.innerHeight - popupRect.height - VIEWPORT_GUTTER,
      );
      const arrowX = clamp(
        triggerRect.left + triggerRect.width / 2 - left,
        12,
        popupRect.width - 12,
      );

      setPosition({ top, left, arrowX, placement, maxHeight });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updatePosition);
    resizeObserver?.observe(triggerElement);
    resizeObserver?.observe(popupElement);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
      resizeObserver?.disconnect();
    };
  }, [getTriggerElement, open]);

  useEffect(() => {
    if (!open) return;
    const popupElement = popupRef.current;
    const firstFocusable =
      popupElement?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? popupElement)?.focus();

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (
        target instanceof Node &&
        !getTriggerElement()?.contains(target) &&
        !popupRef.current?.contains(target)
      ) {
        setOpen(false);
        onClose?.();
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      onClose?.();
      getTriggerElement()?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [getTriggerElement, open]);

  const popupStyle: PopupCSSProperties | undefined = position
    ? {
        top: position.top,
        left: position.left,
        maxHeight: position.maxHeight,
        width,
        "--popup-arrow-x": `${position.arrowX}px`,
      }
    : undefined;
  const handleTriggerClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    if (isValidElement<PopupTriggerProps>(trigger)) {
      trigger.props.onClick?.(event);
      onOpen?.();
    }
    if (!event.defaultPrevented) {
      setOpen((current) => !current);
    }
  };
  const triggerElement = isValidElement<PopupTriggerProps>(trigger) ? (
    cloneElement(trigger, {
      "aria-haspopup": "dialog",
      "aria-expanded": open,
      "aria-controls": open ? id : undefined,
      "data-popup-trigger": id,
      onClick: handleTriggerClick,
    })
  ) : (
    <Button
      aria-label={title}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? id : undefined}
      data-popup-trigger={id}
      onClick={handleTriggerClick}
    >
      {trigger}
    </Button>
  );

  return (
    <>
      {triggerElement}
      {open &&
        createPortal(
          <div
            id={id}
            ref={popupRef}
            className={styles.popup}
            data-placement={position?.placement ?? "bottom"}
            role="dialog"
            style={popupStyle}
          >
            <div
              style={{
                padding: "6px",
                paddingLeft: "12px",
                backgroundColor: "var(--primary)",
              }}
            >
              <Heading level={5}>{title}</Heading>
            </div>
            <HorizontalSeparator thickness={1} width="100%" maxWidth="100vw" />
            {children}
          </div>,
          document.body,
        )}
    </>
  );
};

export { Popup };
export type { PopupProps };
