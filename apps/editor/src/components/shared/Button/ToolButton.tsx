import type { IconProps } from "../Icon/Icon";
import { Button } from "./Button";
import type { ButtonProps } from "./Button";

interface ToolButtonProps extends ButtonProps {
  Icon: (props: Omit<IconProps, "svg">) => React.JSX.Element;
}

const ToolButton = ({ Icon, children, ...rest }: ToolButtonProps) => {
  const hasText = Boolean(children);
  const maxWidth = hasText ? undefined : 40;

  const padding = "--space-small";
  const paddingRight = hasText ? `var(${padding})` : 0;
  const paddingLeft = hasText ? `calc(var(${padding}) / 2)` : 0;

  return (
    <Button
      maxWidth={maxWidth}
      maxHeight={40}
      borderRadius={4}
      border="none"
      paddingRight={paddingRight}
      paddingLeft={paddingLeft}
      {...rest}
    >
      <Icon />
      {children}
    </Button>
  );
};

export { ToolButton };
export type { ToolButtonProps };
