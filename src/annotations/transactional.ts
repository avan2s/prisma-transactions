import { Prisma, PrismaClient } from "@prisma/client";
import { TransactionOptions } from "../interfaces/transaction-options";
import "reflect-metadata";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isPrismaClient = (obj: any): boolean => {
  return (
    obj &&
    ((obj.$executeRaw && obj.$queryRaw) ||
      obj.constructor?.name === "ṔrismaClient")
  );
};

const fillArgs = (
  args: any[],
  numberOfAllMethodArgs: number,
  prismaClient: PrismaClient | Prisma.TransactionClient
) => {
  const numberOfUndefinedArgs = numberOfAllMethodArgs - args.length - 1;
  const undefinedArgs = [];
  if (numberOfUndefinedArgs > 0) {
    undefinedArgs.push(...Array.from({ length: numberOfUndefinedArgs }));
  }
  return args.concat(undefinedArgs, prismaClient);
};

/**
 * implements the behaviour of springs transaction propagation types https://www.baeldung.com/spring-transactional-propagation-isolation
 * @param options
 * @returns
 */
export const Transactional = (options: TransactionOptions) => {
  return (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) => {
    const originalMethod = descriptor.value;
    // originalmethod.length ignores optional parameters, that are defines like (foo, bar='john'). John would not count it it would return 1 instead of 2.
    // Therefore Reflection is used to receive the abolute possible number of arguments
    const numberOfAllMethodArgs = Reflect.getMetadata(
      "design:paramtypes",
      target,
      propertyKey
    ).length;
    if (!(originalMethod instanceof Function)) {
      throw new Error(
        "The tansactional annotation can only be used on methods."
      );
    }

    descriptor.value = async function (...args: unknown[]) {
      // assuming a @Transactional annotated method has multiple optional values, it is expected that the prisma Client is always the last argument
      // Example: myMethod(foo?,bar?,prismaClient=this.prismaClient) => this is the expected args format. If the caller calls the method with myMethod(), the prismaClient
      // and reason why numberOfAllMethodArgs has to match in case the caller of the method does provide
      // TODO: write a test for this method with args
      const isLastArgAPrismaClient =
        args.length > 0 && isPrismaClient(args[args.length - 1]);
      const prisma = isLastArgAPrismaClient
        ? (args[args.length - 1] as PrismaClient)
        : options.prismaClient;

      if (!prisma) {
        throw new Error("Unable to find a prisma client.");
      }

      // the $transaction method is NOT available in a transactional Prisma client
      const isRunningInTransaction =
        typeof prisma["$transaction"] !== "function" &&
        typeof prisma["$executeRaw"] === "function";

      const propagationType = options.propagationType;
      let result = null;

      if (propagationType === "REQUIRED") {
        if (isRunningInTransaction) {
          // reuse the current prisma client
          const txArgs = fillArgs(args, numberOfAllMethodArgs, prisma);
          result = await originalMethod.apply(this, txArgs);
        } else {
          // create a new transaction
          await prisma.$transaction(
            async (txClient) => {
              const txArgs = fillArgs(args, numberOfAllMethodArgs, txClient);
              result = await originalMethod.apply(this, txArgs);
            },
            { timeout: 300000 }
          );
        }
      } else if (propagationType === "SUPPORTS") {
        // reuse the current prisma client nevertheless it is running inside a transation or not
        // NOTE: that prisma creates a transaction automatically for create and update operations, because nested create statements should run in a single transaction. This way prisma ensures consitenccy
        const txArgs = fillArgs(args, numberOfAllMethodArgs, prisma);
        result = await originalMethod.apply(this, txArgs);
      }

      // else if (propagationType === "NEVER") {
      //     if (isRunningInsideTransaction) {
      //         throw new Error('transactions are not supported for this method');
      //     }
      //     console.log('use db client without any transactional behaviour');
      // } else if (propagationType === 'REQUIRES_NEW') {
      //     if (isRunningInsideTransaction) {
      //         console.log('suspend the current transaction and create a new transaction');
      //     } else {
      //         console.log('create a new independent transaction')
      //     }
      // } else if (propagationType === 'MANDATORY') {
      //     if (!isRunningInsideTransaction) {
      //         throw new Error('a pre existing transaction is required');
      //     }
      //     console.log('use existing transaction');
      // }
      if (result === null || result !== void 0) {
        return result;
      }
    };
    return descriptor;
  };
};
