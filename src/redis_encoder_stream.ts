export type RedisCommand = (string | number)[];

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
