import { Prisma } from "@prisma/client";

export const extendTransaction = (tx: Prisma.TransactionClient) => {
  return new Proxy(tx, {
    get(target, prop) {
      if (prop === "$transaction") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return async (func: any) => {
          return func(tx);
        };
      }
      // @ts-expect-error - Fixing this type causes the TypeScript type checker to freeze
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return target[prop];
    },
  });
};
