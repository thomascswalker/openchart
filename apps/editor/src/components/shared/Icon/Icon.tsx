import { memo } from "react";
import type { NamedExoticComponent } from "react";
import type { ComponentType, CSSProperties, SVGProps } from "react";

const svgModules = import.meta.glob("../../../assets/*.svg", {
  query: "?raw",
  eager: true,
}) as Record<string, { default: string }>;

const makeSvgComponent = (
  source: string,
): NamedExoticComponent<SVGProps<SVGSVGElement>> => {
  const normalizedSource = source.replace(
    /(\b(?:stroke|fill)\s*[:=]\s*)(["']?)(?:rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|#[\da-f]{3,8})\2/gi,
    "$1$2currentColor$2",
  );
  const svgMatch = normalizedSource.match(
    /<svg\b([^>]*)>([\s\S]*?)<\/svg\s*>/i,
  );

  if (!svgMatch) {
    throw new Error("Unable to parse SVG icon source");
  }

  const [, rootAttributes, contents] = svgMatch;
  const viewBox = rootAttributes.match(
    /\bviewBox\s*=\s*["']([^"']+)["']/i,
  )?.[1];
  const rootStyleSource = rootAttributes.match(
    /\bstyle\s*=\s*["']([^"']*)["']/i,
  )?.[1];
  const rootStyle = Object.fromEntries(
    (rootStyleSource?.split(";") ?? [])
      .map((declaration) => declaration.split(":").map((part) => part.trim()))
      .filter(
        (declaration): declaration is [string, string] =>
          declaration.length === 2 &&
          declaration[0] !== "" &&
          declaration[1] !== "",
      )
      .map(([property, value]) => [
        property.replace(/-([a-z])/g, (_, letter: string) =>
          letter.toUpperCase(),
        ),
        value,
      ]),
  ) as CSSProperties;

  return memo((props) => (
    <svg
      viewBox={viewBox}
      {...props}
      style={{ ...rootStyle, ...props.style }}
      dangerouslySetInnerHTML={{ __html: contents }}
    />
  ));
};

type SvgComponent =
  | ComponentType<SVGProps<SVGSVGElement>>
  | NamedExoticComponent<SVGProps<SVGSVGElement>>;

export interface IconProps {
  svg: SvgComponent;
  width?: number;
  height?: number;
  size?: number;
  disabled?: boolean;
  style?: CSSProperties;
}

const Icon = ({
  svg: Svg,
  width = 32,
  height = 32,
  size = 32,
  disabled = false,
  style = undefined,
}: IconProps) => {
  if (size) {
    width = size;
    height = size;
  }
  const color = disabled ? "var(--text-disabled)" : "var(--text-primary)";
  return <Svg width={width} height={height} color={color} style={style} />;
};

const makeIcon = (svg: SvgComponent) => {
  return (props: Omit<IconProps, "svg">) => <Icon svg={svg} {...props} />;
};

const icons: Record<string, ReturnType<typeof makeIcon>> = {};

Object.entries(svgModules).forEach(([path, module]) => {
  // Extract filename without extension (e.g., "../assets/arrow-left.svg" -> "arrow-left")
  const fileName = path.split("/").pop()?.replace(".svg", "") || "";

  // Convert kebab-case/snake_case to PascalCase (e.g., "arrow-left" -> "ArrowLeft")
  const componentName = fileName
    .replace(/[-_]([a-z])/g, (_, letter) => letter.toUpperCase())
    .replace(/^[a-z]/, (letter) => letter.toUpperCase());

  // Generate the functional component using your factory function
  icons[`${componentName}Icon`] = makeIcon(makeSvgComponent(module.default));
});

// Generated icon components are resolved by asset names at module load.
// eslint-disable-next-line react-refresh/only-export-components
export const {
  CursorIcon,
  EraserIcon,
  NoteIcon,
  PencilIcon,
  SnapIcon,
  PianoIcon,
  Highway3dIcon,
  EasyIcon,
  MediumIcon,
  HardIcon,
  ExpertIcon,
  GuitarIcon,
  FourpadIcon,
  FivepadIcon,
  BassIcon,
  DrumsIcon,
  VocalsIcon,
  SoloIcon,
  StagepowerIcon,
  PhraseIcon,
  ActivateIcon,
  VolumeIcon,
  SplitIcon,
  SettingsIcon,
  RemoveIcon,
  AddIcon,
  DownIcon,
  RightIcon,
  ElipsesIcon,
  LockIcon,
  UnlockIcon,
  DirectoryIcon,
  MixerIcon,
  ResetIcon,
  TracksIcon,
} = icons;
export { Icon };
