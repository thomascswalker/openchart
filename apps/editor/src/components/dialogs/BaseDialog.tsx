import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "../shared/Button";
import { Section } from "../shared/Section";
import { Modal } from "../shared/Modal/Modal";
import { ListView } from "../shared/ListView";
import styles from "./BaseDialog.module.css";

interface BaseDialogProps {
  title: string;
  options: readonly string[];
  optionsLabel: string;
  isDirty: boolean;
  onApply: () => Promise<boolean>;
  onClose: () => void;
  onTabChange?: () => void;
  renderTab: (tab: string, index: number) => ReactNode;
}

const BaseDialog = ({
  title,
  options,
  optionsLabel,
  isDirty,
  onApply,
  onClose,
  onTabChange,
  renderTab,
}: BaseDialogProps) => {
  const [selectedTab, setSelectedTab] = useState(options[0] ?? "");
  const dialogRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, options.indexOf(selectedTab));

  const selectTab = (tab: string): void => {
    setSelectedTab(tab);
    if (tab !== selectedTab) onTabChange?.();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled])",
      ) ?? []),
    ];
    if (focusable.length === 0) return;
    const currentIndex = focusable.indexOf(
      document.activeElement as HTMLElement,
    );
    const nextIndex = event.shiftKey
      ? currentIndex <= 0
        ? focusable.length - 1
        : currentIndex - 1
      : currentIndex === focusable.length - 1
        ? 0
        : currentIndex + 1;
    event.preventDefault();
    focusable[nextIndex]?.focus();
  };

  const applyAndClose = async (): Promise<void> => {
    if (await onApply()) onClose();
  };

  return (
    <Modal
      dialogRef={dialogRef}
      onKeyDown={onKeyDown}
      className={styles.dialog}
      size={{ width: 760, height: 480, margin: 32 }}
      onBackdropClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Modal.Header title={title} onClick={onClose} />
      <Section className={styles.body}>
        <ListView
          id="dialog-sections"
          className={styles.navigation}
          options={options}
          value={selectedTab}
          ariaLabel={optionsLabel}
          onChange={selectTab}
        />
        <Section
          className={styles.panel}
          role="region"
          id="dialog-panel"
          aria-labelledby={`dialog-sections-option-${selectedIndex}`}
        >
          {renderTab(selectedTab, selectedIndex)}
        </Section>
      </Section>
      <Section
        className={styles.actions}
        flexDirection="row"
        alignItems="center"
        justifyContent="flex-end"
      >
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onApply} disabled={!isDirty}>
          Apply
        </Button>
        <Button onClick={applyAndClose} disabled={!isDirty}>
          OK
        </Button>
      </Section>
    </Modal>
  );
};

export { BaseDialog };
export type { BaseDialogProps };
