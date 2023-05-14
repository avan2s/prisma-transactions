import { Prisma, PrismaClient } from "@prisma/client";
import { TransactionContextStore } from "./transaction-context-store";
import { TransactionForPropagationNotSupportedException } from "../exceptions/transaction-for-propagation-not-supported-exception";
import txPrismaExtension, {
  FlatTransactionClient,
} from "./prisma-tx-client-extension";
import { TransactionForPropagationRequiredException } from "../exceptions/transaction-for-propagation-required-exception";

const prismaClient = new PrismaClient({
  datasources: {
    db: { url: "postgresql://postgres:postgres@localhost:6005/postgres" },
  },
  log: [
    {
      level: "query",
      emit: "event",
    },
  ],
}).$extends(txPrismaExtension);

const getModels = () => {
  return Prisma.dmmf.datamodel.models;
};

const getModelPropertyNames = () => {
  return getModels().map((m) => {
    const name = m.name;
    return name.charAt(0).toLocaleLowerCase() + name.slice(1);
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _prismaClient = prismaClient as { [key: string]: any };

getModelPropertyNames().forEach((modelPropertyName) => {
  Object.keys(_prismaClient[modelPropertyName])
    .filter((key) => _prismaClient[modelPropertyName][key] instanceof Function)
    .forEach((functionName) => {
      const proxyFunc = new Proxy(
        _prismaClient[modelPropertyName][functionName],
        {
          apply(target, thisArg, args) {
            console.log("proxy called");
            const txContext =
              TransactionContextStore.getInstance().getTransactionContext();
            const runInOriginalContext = () => {
              return target.apply(thisArg, args);
            };
            if (!txContext) {
              // a Transactional annotation must create a new transaction context in each case
              // otherwise the prisma client can not make any transaction decisions what to do
              // of course the transactional annotation is not a must have annotation - so if a method
              // is not annotated with Tranactional, the client should behave as normal
              return runInOriginalContext();
            }
            const isRunningInTransaction = !!txContext?.txClient;
            const propagationType = txContext.options.propagationType;
            const runInNewTransaction = () => {
              return _prismaClient
                .$begin()
                .then((tx: { [key: string]: any }) => {
                  txContext.txClient = tx as FlatTransactionClient;
                  const newThisArg = tx[modelPropertyName];
                  return tx[modelPropertyName][functionName].apply(
                    newThisArg,
                    args
                  );
                });
            };

            const runInCurrentTransaction = () => {
              const txClient = txContext?.txClient;
              const tx = txClient as { [key: string]: any };
              const newThisArg = tx[modelPropertyName];
              return tx[modelPropertyName][functionName].apply(
                newThisArg,
                args
              );
            };

            if (isRunningInTransaction) {
              if (
                propagationType === "REQUIRED" ||
                propagationType === "SUPPORTS" ||
                propagationType === "MANDATORY"
              ) {
                return runInCurrentTransaction();
              } else if (propagationType === "REQUIRES_NEW") {
                return runInNewTransaction();
              } else if (propagationType === "NOT_SUPPORTED") {
                // transaction is suspended and default method without transaction context is called
                return runInOriginalContext();
              } else if (propagationType === "NEVER") {
                // throw hard exception if running inside transaction context
                throw new TransactionForPropagationNotSupportedException(
                  propagationType
                );
              } else {
                return runInOriginalContext();
              }
            } else {
              // without running transaction
              if (
                propagationType === "REQUIRED" ||
                propagationType === "REQUIRES_NEW"
              ) {
                return runInNewTransaction();
              } else if (propagationType === "MANDATORY") {
                throw new TransactionForPropagationRequiredException(
                  propagationType
                );
              } else {
                // NOT_SUPPORTED,NEVER,SUPPORTS propagations accept to run in non transactional context
                return runInOriginalContext();
              }
            }
          },
        }
      );
      _prismaClient[modelPropertyName][functionName] = proxyFunc;
    });
});

describe("My Prisma Client test", () => {
  it("test transactional propagation", async () => {
    const users = await prismaClient.appUser.findMany();
    expect(users.length).toBe(0);
  });
});
