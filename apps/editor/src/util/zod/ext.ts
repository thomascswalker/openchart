/**
 * Utility functions and extensions for Zod schemas.
 */
import * as zod from 'zod/v4';

export const isObject = (o: zod.ZodType): o is zod.ZodObject => {
  return o instanceof zod.ZodObject;
};
export const isArray = (o: zod.ZodType): o is zod.ZodArray => {
  return o instanceof zod.ZodArray;
};
export const pickObject = (schema: zod.ZodType, path: string): zod.ZodType => {
  if (!isObject(schema)) {
    throw Error(`Schema is not an object`);
  }
  const newSchema = schema.shape?.[path];
  if (!newSchema)
    throw Error(
      `${path} does not exist on schema with keys: ${Object.keys(schema.shape)}`,
    );

  return newSchema;
};
export const filePicker = (
  types: FilePickerAcceptType[],
  refiner?: (value: string | null) => boolean,
) => {
  let schema = zod.string().nullable();
  if (refiner) {
    schema = schema.refine(refiner);
  }
  return schema.meta({ file: true, types });
};
export const directoryPicker = () =>
  zod.string().nullable().default(null).meta({ directory: true });
