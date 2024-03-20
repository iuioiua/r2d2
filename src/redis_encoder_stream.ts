export type RedisCommand = (string | number)[];

type X = ["SET", string, (number | string | Uint8Array)];

export class RedisEncoderStream extends TransformStream<RedisCommand, string> {
  constructor() {
    super({
      transform(command, controller) {
        const encodedCommand = command
          .map((arg) => `$${String(arg).length}\r\n${arg}\r\n`)
          .join("");
        controller.enqueue(`*${command.length}\r\n${encodedCommand}`);
      },
    });
  }
}
