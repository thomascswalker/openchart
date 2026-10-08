import type { IconProps } from "../Icon/Icon";
import { Button } from "./Button";
import type { ButtonProps } from "./Button";

interface ToolButtonProps extends ButtonProps {
  Icon: (props: Omit<IconProps, "svg">) => React.JSX.Element;
}

const ToolButton = ({ Icon, children, ...rest }: ToolButtonProps) => {
  return (
    <Button
      maxWidth={40}
      maxHeight={40}
      borderRadius={4}
      border="none"
      {...rest}
    >
      <Icon />
      {children}
    </Button>
  );
};

export { ToolButton };
export type { ToolButtonProps };
