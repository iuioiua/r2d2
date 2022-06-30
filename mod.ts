import { BufReader, TextProtoReader, writeAll } from "./deps.ts";

export type Command = (string | number)[];
export type Reply = string | number | null | Reply[];

const CRLF = "\r\n";
const encoder = new TextEncoder();

const PREFIXES: Readonly<Record<string, string>> = {
  SIMPLE_STRING: "+",
  ERROR: "-",
  INTEGER: ":",
  BULK_STRING: "$",
  ARRAY: "*",
};

function removePrefix(line: string): string {
  return line.slice(1);
}

function parseInteger(line: string): number {
  return Number(removePrefix(line));
}

function stringifyRequest(command: Command): string {
  let request = "*" + command.length + CRLF;
  for (const arg of command) {
    request += "$" + arg.toString().length + CRLF;
    request += arg + CRLF;
  }
  return request;
}

async function writeRequest(
  conn: Deno.Conn,
  request: string,
): Promise<void> {
  await writeAll(conn, encoder.encode(request));
}

async function readLineOrLines(tpReader: TextProtoReader): Promise<Reply> {
  const line = await tpReader.readLine();
  return await {
    [PREFIXES.SIMPLE_STRING]: () => removePrefix(line!),
    [PREFIXES.ERROR]: () => {
      throw new Error(removePrefix(line!));
    },
    [PREFIXES.INTEGER]: () => parseInteger(line!),
    [PREFIXES.BULK_STRING]: () =>
      parseInteger(line!) === -1 ? null : readLineOrLines(tpReader),
    [PREFIXES.ARRAY]: async () => {
      const lines = [];
      for (let i = 0; i < parseInteger(line!); i++) {
        const lineOrLines = await readLineOrLines(tpReader);
        lines.push(lineOrLines);
      }
      return lines;
    },
  }[line!.charAt(0)]?.() ?? line;
}

async function readReply(conn: Deno.Conn): Promise<Reply> {
  const bufReader = new BufReader(conn);
  const tpReader = new TextProtoReader(bufReader);
  return await readLineOrLines(tpReader);
}

export async function sendCommand(
  conn: Deno.Conn,
  command: Command,
): Promise<Reply> {
  await writeRequest(conn, stringifyRequest(command));
  return await readReply(conn);
}
