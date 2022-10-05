export const CRLF = "\r\n";
export const encoder = new TextEncoder();
export const decoder = new TextDecoder();

export const SIMPLE_STRING_PREFIX = "+";
export const ERROR_PREFIX = "-";
export const INTEGER_PREFIX = ":";
export const BULK_STRING_PREFIX = "$";
export const ARRAY_PREFIX = "*";
