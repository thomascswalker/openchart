import type { IconProps } from "../Icon/Icon";
import { Button } from "./Button";
import type { ButtonProps } from "./Button";

interface ToolButtonProps extends ButtonProps {
  Icon: (props: Omit<IconProps, "svg">) => React.JSX.Element;
}

const ToolbarSize = 24;
const IconSize = ToolbarSize - 4;

const ToolButton = ({ Icon, children, ...rest }: ToolButtonProps) => {
  const hasText = Boolean(children);
  const maxWidth = hasText ? undefined : ToolbarSize;

  return (
    <Button
      width={ToolbarSize}
      height={ToolbarSize}
      minWidth={0}
      minHeight={0}
      maxWidth={maxWidth}
      maxHeight={ToolbarSize}
      borderRadius={4}
      border="none"
      padding={0}
      {...rest}
    >
      <Icon width={IconSize} height={IconSize} />
      {children}
    </Button>
  );
};

export { ToolButton };
export type { ToolButtonProps };
