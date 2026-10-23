import { useState, type ReactNode } from "react";
import { Button } from "../Button";
import { Popup } from ".";

interface PopupButtonProps {
  icon: ReactNode;
  className: string;
  title: string;
  width: number;
  children: ReactNode;
}

export const PopupButton = ({
  icon,
  className,
  title,
  width,
  children,
}: PopupButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={className}>
      <Popup
        trigger={
          <Button
            aria-label={title}
            icon={icon}
            border="none"
            minWidth={0}
            minHeight={0}
            maxWidth={32}
            maxHeight={32}
            padding="4px"
            checked={isOpen}
          />
        }
        title={title}
        width={width}
        onOpen={() => setIsOpen((open) => !open)}
        onClose={() => setIsOpen(false)}
      >
        {children}
      </Popup>
    </div>
  );
};
