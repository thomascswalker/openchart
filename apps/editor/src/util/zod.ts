import { z } from "zod";

function isObject(o: z.ZodTypeAny): o is z.ZodObject {
  return o instanceof z.ZodObject;
}

function isArray(o: z.ZodTypeAny): o is z.ZodArray {
  return o instanceof z.ZodArray;
}

function pickObject(schema: z.ZodTypeAny, path: string): z.ZodTypeAny {
  if (!isObject(schema)) {
    throw Error("Not a zod object");
  }
  const newSchema = schema.shape?.[path];
  if (!newSchema)
    throw Error(
      `${path} does not exist on schema with keys: ${Object.keys(schema.shape)}`,
    );

  return newSchema;
}

export { isObject, isArray, pickObject };
