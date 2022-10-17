export const CRLF = "\r\n";
export const encoder = new TextEncoder();

export const ARRAY_PREFIX = "*";
export const ATTRIBUTE_PREFIX = "|";
export const BIG_NUMBER_PREFIX = "(";
export const BLOB_ERROR_PREFIX = "!";
export const BOOLEAN_PREFIX = "#";
export const BULK_STRING_PREFIX = "$";
export const DOUBLE_PREFIX = ",";
export const ERROR_PREFIX = "-";
export const INTEGER_PREFIX = ":";
export const MAP_PREFIX = "%";
export const NULL_PREFIX = "_";
export const SET_PREFIX = "~";
export const SIMPLE_STRING_PREFIX = "+";
export const VERBATIM_STRING_PREFIX = "=";

export const STREAMED_REPLY_START_DELIMITER = "?";
export const STREAMED_STRING_END_DELIMITER = ";0";
export const STREAMED_AGGREGATE_END_DELIMITER = ".";
