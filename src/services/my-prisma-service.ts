import { Prisma, PrismaClient } from "@prisma/client";
import { TransactionManager } from "./transaction-manager.service";
import { TransactionContextStore } from "./transaction-context-store";
import { FlatTransactionClient } from "./prisma-tx-client-extension";
import { TransactionForPropagationRequiredException } from "../exceptions/transaction-for-propagation-required-exception";
import { TransactionForPropagationNotSupportedException } from "../exceptions/transaction-for-propagation-not-supported-exception";

export class MyPrismaClient extends PrismaClient {
  constructor(
    optionsArg?: Prisma.PrismaClientOptions,
    private transactionManager: TransactionManager = new TransactionManager()
  ) {
    super(optionsArg);
    this.createModelProxies();
  }

  private getModelPropertyNames() {
    return this.getModels().map((m) => {
      const name = m.name;
      return name.charAt(0).toLocaleLowerCase() + name.slice(1);
    });
  }

  private getModels() {
    return Prisma.dmmf.datamodel.models;
  }

  private createModelProxies() {
    const modelPropertyNames = this.getModelPropertyNames();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _this = this as { [key: string]: any };

    modelPropertyNames.forEach((modelPropertyName) => {
      Object.keys(_this[modelPropertyName])
        .filter((key) => _this[modelPropertyName][key] instanceof Function)
        .forEach((functionName) => {
          _this[modelPropertyName][functionName] = new Proxy(
            _this[modelPropertyName][functionName],
            {
              apply(target, thisArg, args) {
                const txContext =
                  TransactionContextStore.getInstance().getTransactionContext();

                console.log(Object.keys(_this));
                if (txContext) {
                  const txOptions = txContext.options;
                  const propagationType = txOptions?.propagationType;
                  const txClient = txContext?.txClient;
                  const isRunningInTransaction = !!txClient;

                  const applyMethodInExistingTransaction = () => {
                    const tx = txClient as { [key: string]: any };
                    const newThisArg = tx[modelPropertyName];

                    return tx[modelPropertyName][functionName].apply(
                      newThisArg,
                      args
                    );
                  };

                  const applyInNewTransaction = () => {
                    return _this
                      .$begin()
                      .then((txClient: FlatTransactionClient) => {
                        if (txOptions) {
                          txContext.txClient = txClient;
                          const tx = txClient as { [key: string]: any };
                          const newThisArg = tx[modelPropertyName];
                          return tx[modelPropertyName][functionName].apply(
                            newThisArg,
                            args
                          );
                        }
                        return target.apply(thisArg, args);
                      });
                  };

                  if (propagationType === "REQUIRED") {
                    if (isRunningInTransaction) {
                      return applyMethodInExistingTransaction();
                    } else {
                      return applyInNewTransaction();
                    }
                  } else if (propagationType === "REQUIRES_NEW") {
                    // suspend the current transaction and create a complete new separate transaction, no matter if it is already running inside a transaction
                    return applyInNewTransaction();
                  } else if (propagationType === "MANDATORY") {
                    if (!isRunningInTransaction) {
                      throw new TransactionForPropagationRequiredException(
                        txOptions.propagationType
                      );
                    }
                    return applyMethodInExistingTransaction();
                  } else if (propagationType === "SUPPORTS") {
                    if (isRunningInTransaction) {
                      return applyMethodInExistingTransaction();
                    }
                    return target.apply(thisArg, args);
                  } else if (propagationType === "NEVER") {
                    if (isRunningInTransaction) {
                      throw new TransactionForPropagationNotSupportedException(
                        propagationType
                      );
                    }
                  } else if (propagationType === "NOT_SUPPORTED") {
                    return target.apply(thisArg, args);
                  } else {
                    throw new TransactionForPropagationNotSupportedException(
                      propagationType
                    );
                  }
                }
                return target.apply(thisArg, args);
              },
            }
          );
        });
    });
  }

  // _this[modelPropertyName] = this.createModelProxy({
  //   proxyTarget: _this[modelPropertyName],
  //   modelName: modelPropertyName,
  // });

  private createModelProxy(proxyArgs: {
    proxyTarget: object;
    modelName: string;
  }) {
    const modelPropertyName = proxyArgs.modelName;

    const handler: ProxyHandler<object> = {
      get: async (target: object, prop: string) => {
        const txContext =
          TransactionContextStore.getInstance().getTransactionContext();
        const txOptions = txContext?.options;
        const propagationType = txOptions?.propagationType;
        const txClient = txContext?.txClient;
        const isRunningInTransaction = !!txClient;

        if (propagationType === "REQUIRED") {
          if (isRunningInTransaction) {
            // use existing transaction client from current context
            return (txClient as { [key: string]: any })[modelPropertyName][
              prop
            ];
          }
          await this.appUser.findFirst();
          // txContext?.txClient = this.$begin();
        }
        const tx = this.getTransactionClient();
        if (tx && prop !== "$transaction") {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          const functionInsideTransaction = (tx as { [key: string]: any })[
            modelPropertyName
          ][prop];

          return functionInsideTransaction;
        }
        // @ts-expect-error - Fixing this type causes the TypeScript type checker to freeze
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return target[prop];
      },
      // apply(target, thisArg, argArray) {
      //   const _target = target as { [key: string]: any };
      //   console.log("apply called");
      //   return _target.apply(thisArg, argArray);
      // },
    };

    return new Proxy(proxyArgs.proxyTarget, handler);
  }

  public getTransactionClient(): MyPrismaClient | undefined {
    //the propagation is done in the Transactional annotation.
    // there the interactive transaction is started and commited around the function
    const tx = this.transactionManager.getTransaction();
    if (!tx) {
      return undefined;
    }
    return tx as MyPrismaClient;
  }

  public getClientFromContext(): MyPrismaClient {
    const txClient = this.getTransactionClient();
    if (txClient) {
      return txClient as MyPrismaClient;
    }
    return this;
  }
}
