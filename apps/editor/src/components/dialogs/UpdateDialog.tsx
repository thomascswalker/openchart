import {
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useDocumentSnapshot } from "../../hooks/useDocumentSnapshot";
import { useService } from "../../platform";
import type { UpdaterService, UpdaterSnapshot } from "../../services/updater";
import { Button } from "../shared/Button";
import { Modal } from "../shared/Modal/Modal";
import { Section } from "../shared/Section";
import { Text } from "../shared/Text";
import styles from "./UpdateDialog.module.css";

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function progressLabel(snapshot: UpdaterSnapshot): string {
  const { downloadedBytes, totalBytes } = snapshot;
  if (totalBytes && totalBytes > 0) {
    const percent = Math.min(
      100,
      Math.floor((downloadedBytes / totalBytes) * 100),
    );
    return `Downloading update… ${percent}%`;
  }
  return `Downloading update… ${formatMegabytes(downloadedBytes)}`;
}

const UpdateDialog = () => {
  const updater = useService<UpdaterService>("updater");
  const snapshot = useSyncExternalStore(
    updater.subscribe,
    updater.getSnapshot,
    updater.getSnapshot,
  );
  const { isDirty } = useDocumentSnapshot();

  const dismiss = (): void => {
    if (updater.canDismiss()) updater.dismiss();
  };
  const install = (): void => {
    void updater.install();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
    }
  };

  let body: ReactNode = null;
  let actions: ReactNode = null;

  switch (snapshot.status) {
    case "checking":
      body = <Text role="status">Checking for updates…</Text>;
      break;
    case "up-to-date":
      body = (
        <Text role="status">
          {snapshot.currentVersion
            ? `You're running the latest version (v${snapshot.currentVersion}).`
            : "You're running the latest version."}
        </Text>
      );
      actions = <Button onClick={dismiss}>OK</Button>;
      break;
    case "available":
      body = (
        <>
          <Text>
            {`Version ${snapshot.availableVersion} is available (you have v${snapshot.currentVersion}).`}
          </Text>
          {snapshot.notes ? (
            <pre className={styles.notes} aria-label="Release notes">
              {snapshot.notes}
            </pre>
          ) : null}
          {isDirty ? (
            <Text className={styles.warning} role="alert">
              You have unsaved changes. They will be lost when OpenChart
              restarts.
            </Text>
          ) : null}
        </>
      );
      actions = (
        <>
          <Button onClick={dismiss}>Later</Button>
          <Button onClick={install}>Install and restart</Button>
        </>
      );
      break;
    case "downloading":
      body = (
        <>
          <Text role="status">{progressLabel(snapshot)}</Text>
          {snapshot.totalBytes ? (
            <progress
              className={styles.progress}
              max={snapshot.totalBytes}
              value={snapshot.downloadedBytes}
            />
          ) : null}
        </>
      );
      break;
    case "installing":
      body = (
        <Text role="status">Installing update… OpenChart will restart.</Text>
      );
      break;
    case "error":
      body = (
        <Text role="alert">
          {`Couldn't ${snapshot.errorPhase === "install" ? "install the update" : "check for updates"}: ${snapshot.error}`}
        </Text>
      );
      actions = <Button onClick={dismiss}>Close</Button>;
      break;
    case "idle":
      return null;
  }

  return (
    <Modal
      className={styles.dialog}
      onKeyDown={onKeyDown}
      onBackdropClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <Modal.Header title="Check for Updates" onClick={dismiss} />
      <Section className={styles.body} aria-live="polite">
        {body}
      </Section>
      {actions ? (
        <Section
          className={styles.actions}
          flexDirection="row"
          alignItems="center"
          justifyContent="flex-end"
        >
          {actions}
        </Section>
      ) : null}
    </Modal>
  );
};

export { UpdateDialog };
