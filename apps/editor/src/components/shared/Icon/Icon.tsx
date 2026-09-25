import type { ComponentType, SVGProps } from "react";

const svgModules = import.meta.glob("../../../assets/*.svg", {
  query: "?react",
  eager: true,
}) as Record<string, { default: ComponentType<SVGProps<SVGSVGElement>> }>;

export interface IconProps {
  svg: ComponentType<SVGProps<SVGSVGElement>>;
  width?: number;
  height?: number;
}

const Icon = ({ svg: Svg, width = 24, height = 24 }: IconProps) => {
  return <Svg width={width} height={height} />;
};

const makeIcon = (svg: ComponentType<SVGProps<SVGSVGElement>>) => {
  return (props: Omit<IconProps, "svg">) => <Icon svg={svg} {...props} />;
};

const Icons: Record<string, ReturnType<typeof makeIcon>> = {};

Object.entries(svgModules).forEach(([path, module]) => {
  // Extract filename without extension (e.g., "../assets/arrow-left.svg" -> "arrow-left")
  const fileName = path.split("/").pop()?.replace(".svg", "") || "";

  // Convert kebab-case/snake_case to PascalCase (e.g., "arrow-left" -> "ArrowLeft")
  const componentName = fileName
    .replace(/[-_]([a-z])/g, (_, letter) => letter.toUpperCase())
    .replace(/^[a-z]/, (letter) => letter.toUpperCase());

  // Generate the functional component using your factory function
  Icons[`${componentName}Icon`] = makeIcon(module.default);
});

export const {
  CursorIcon,
  EraserIcon,
  NoteIcon,
  PencilIcon,
  MagnetIcon,
  PianoIcon,
  Highway3dIcon,
  EasyIcon,
  MediumIcon,
  HardIcon,
  ExpertIcon,
  GuitarIcon,
  BassIcon,
  DrumsIcon,
  VocalsIcon,
} = Icons;
