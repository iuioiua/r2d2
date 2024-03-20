export type RedisCommand = (string | number)[];

export class RedisEncoderStream extends TransformStream<RedisCommand, string> {
  constructor() {
    super({
      transform(command, controller) {
        controller.enqueue(
          `*${command.length}\r\n${
            command.map((arg) => {
              const stringArg = String(arg);
              return `$${stringArg.length}\r\n${stringArg}\r\n`;
            }).join("")
          }`,
        );
      },
    });
  }
}
