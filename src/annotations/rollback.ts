import { PrismaClient } from "@prisma/client";

const ROLLBACK = {
  [Symbol.for("prisma.transactions.annotation.rollback")]: true,
};

export const Rollback = (prismaClient: PrismaClient) => {
  return (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) => {
    const originalMethod = descriptor.value;
    if (!(originalMethod instanceof Function)) {
      throw new Error(
        "The tansactional annotation can only be used on methods."
      );
    }

    descriptor.value = async function (...args: unknown[]) {
      let result = undefined;
      await prismaClient
        .$transaction(async (txClient) => {
          result = await originalMethod.apply(this, [...args, txClient]);
          throw ROLLBACK;
        })
        .catch((err) => {
          if (err !== ROLLBACK) {
            throw err;
          }
        });

      if (result === null || result !== void 0) {
        return result;
      }
    };

    return descriptor;
  };
};
