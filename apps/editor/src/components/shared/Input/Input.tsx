import { useState, type InputHTMLAttributes } from "react";
import classNames from "classnames";
import styles from "./input.module.css";
import { Button, CloseButton } from "../Button";
import {
  border,
  color,
  compose,
  layout,
  space,
  type BorderProps,
  type ColorProps,
  type LayoutProps,
  type SpaceProps,
  type styleFn,
} from "styled-system";
import Platform from "../../../platform";
import type { FileSystemService } from "../../../services/filesystem";
import type { LoadFile } from "../../../services/filesystem/types";
import { DirectoryIcon } from "../Icon/Icon";

const getSystemStyles: styleFn = compose(space, color, layout, border);
const systemPropNames = new Set(getSystemStyles.propNames ?? []);

type StyleProps = SpaceProps & ColorProps & LayoutProps & BorderProps;
type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  keyof StyleProps
> &
  StyleProps;

const defaultInputProps: Pick<InputProps, "type" | "placeholder"> = {
  type: "text",
  placeholder: "Enter text...",
};

const Input = ({ className, ...props }: InputProps) => {
  const inputProps = { ...defaultInputProps, ...props };
  const style = getSystemStyles(inputProps);
  const htmlProps = Object.fromEntries(
    Object.entries(inputProps).filter(
      ([propName]) => !systemPropNames.has(propName),
    ),
  );
  const inputClassName = classNames(styles["ui-input"], className);
  return <input {...htmlProps} className={inputClassName} style={style} />;
};

interface FileInputProps extends InputProps {
  directory?: boolean;
  types?: FilePickerAcceptType[];
  rootDirectoryHandle?: FileSystemDirectoryHandle | null;
  getRootDirectoryPath?: () => string | null;
  onFileChange?: (file: LoadFile | null) => void;
  onPathChange?: (path: string | null) => void;
  onFileError?: (error: Error) => void;
}

const FileInput = ({
  directory = false,
  types = [],
  rootDirectoryHandle,
  getRootDirectoryPath,
  onFileChange,
  onPathChange,
  onFileError,
  ...props
}: FileInputProps) => {
  const [file, setFile] = useState<LoadFile | undefined>(undefined);
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const hasFile = directory
    ? selectedPath !== undefined || Boolean(props.value)
    : Boolean(file || props.value);
  const size = "var(--size-med)";

  const handleOnClick = async () => {
    try {
      if (!rootDirectoryHandle) {
        throw new Error(
          "Save or open a project folder before selecting project files.",
        );
      }
      const fs = Platform.services.get<FileSystemService>("filesystem");
      if (directory) {
        const loadedDirectory = await fs.readDirectory(rootDirectoryHandle);
        setSelectedPath(loadedDirectory.relativePath);
        onPathChange?.(loadedDirectory.relativePath);
        return;
      }
      const loadedFile = await fs.read(
        types,
        rootDirectoryHandle,
        getRootDirectoryPath?.() ?? undefined,
      );
      if (!loadedFile) {
        return;
      }
      if (!loadedFile.relativePath) {
        throw new Error(
          "The selected audio file has no path relative to the project folder.",
        );
      }
      setFile(loadedFile);
      onFileChange?.(loadedFile);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const fileError =
        error instanceof Error ? error : new Error(String(error));
      if (onFileError) onFileError(fileError);
      else throw fileError;
    }
  };

  const handleOnClose = () => {
    setFile(undefined);
    setSelectedPath(undefined);
    if (directory) onPathChange?.(null);
    else onFileChange?.(null);
  };

  return (
    <div style={{ display: "flex" }}>
      <Input
        {...props}
        value={
          directory
            ? (selectedPath ?? props.value)
            : (file?.relativePath ?? props.value)
        }
        readOnly
        borderTopRightRadius={0}
        borderBottomRightRadius={0}
        borderRightColor="transparent"
      />
      <Button
        minHeight={size}
        minWidth={size}
        maxHeight={size}
        maxWidth={size}
        border="1px solid transparent"
        borderTopLeftRadius={0}
        borderBottomLeftRadius={0}
        borderTopRightRadius={0}
        borderBottomRightRadius={0}
        onClick={handleOnClick}
        padding={"2px"}
        icon={<DirectoryIcon size={16} />}
      />
      <CloseButton
        minHeight={size}
        minWidth={size}
        maxHeight={size}
        maxWidth={size}
        borderTopLeftRadius={0}
        borderBottomLeftRadius={0}
        disabled={!hasFile}
        aria-label="Clear selected file"
        title="Clear selected file"
        onClick={handleOnClose}
      />
    </div>
  );
};

export { Input, FileInput };
