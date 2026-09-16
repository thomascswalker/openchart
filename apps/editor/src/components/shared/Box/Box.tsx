import type { ReactNode } from "react";

interface BoxProps {
  children?: ReactNode;
}

const Box = ({ children }: BoxProps) => {
  return <div className="ui-box">{children}</div>;
};

export { Box };
