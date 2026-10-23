import classNames from "classnames";
import type { ReactNode } from "react";
import { type ButtonProps, Button } from "../../shared";
import styles from "./AudioMixer.module.css";

interface AudioTrackButtonProps extends Omit<ButtonProps, "type"> {
  type: "solo" | "mute" | "reset";
  checked?: boolean;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  children?: ReactNode;
}

export const AudioTrackButton = ({
  type,
  icon,
  checked,
  onClick,
  disabled = false,
  ariaLabel,
  children,
}: AudioTrackButtonProps) => {
  return (
    <Button
      icon={icon}
      width={24}
      height={24}
      minWidth={24}
      minHeight={24}
      maxWidth={24}
      maxHeight={24}
      checked={checked}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      flat
      className={classNames(
        styles["ui-track-mixer-button"],
        styles[`ui-track-mixer-${type}-button`],
      )}
    >
      {children}
    </Button>
  );
};
