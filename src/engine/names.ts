/**
 * react-hook-form treats `.` and `[ ]` in field names as nested paths. Formify field ids are arbitrary
 * strings, so ids are encoded to safe RHF names (and decoded again at the resolver / submit boundary).
 */
export const toFieldName = (id: string): string =>
  id.replace(/\./g, "__dot__").replace(/\[/g, "__lb__").replace(/\]/g, "__rb__");

export const fromFieldName = (name: string): string =>
  name.replace(/__dot__/g, ".").replace(/__lb__/g, "[").replace(/__rb__/g, "]");

export const decodeValues = (values: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = {};
  Object.keys(values || {}).forEach((k) => {
    out[fromFieldName(k)] = values[k];
  });
  return out;
};

export const fieldNameCodec = { encode: toFieldName, decode: fromFieldName };
