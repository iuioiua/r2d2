export const CRLF = "\r\n";
export const encoder = new TextEncoder();
export const decoder = new TextDecoder();

export const SIMPLE_STRING_PREFIX = "+";
export const ERROR_PREFIX = "-";
export const INTEGER_PREFIX = ":";
export const BULK_STRING_PREFIX = "$";
export const ARRAY_PREFIX = "*";
export const MAP_PREFIX = "%";
export const BOOLEAN_PREFIX = "#";
export const NULL_PREFIX = "_";
export const DOUBLE_PREFIX = ",";
export const BLOB_ERROR_PREFIX = "!";
export const VERBATIM_STRING_PREFIX = "=";
export const BIG_NUMBER_PREFIX = "(";
