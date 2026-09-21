import type { ComponentType, SVGProps } from "react";
import { Button } from "../shared/Button";
import { Section } from "../shared/Section";
import Cursor from "../../assets/cursor.svg?react";

interface IconProps {
  svg: ComponentType<SVGProps<SVGSVGElement>>;
}

const Icon = ({ svg: Svg }: IconProps) => {
  return <Svg width={24} height={24} />;
};

const Toolbar = () => {
  return (
    <Section padding="0px">
      <Button>
        <Icon svg={Cursor} />
      </Button>
    </Section>
  );
};

export default Toolbar;
