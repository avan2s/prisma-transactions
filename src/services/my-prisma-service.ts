import { Prisma, PrismaClient } from "@prisma/client";
import { TransactionManager } from "./transaction-manager.service";

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
      _this[modelPropertyName] = this.createModelProxy({
        proxyTarget: _this[modelPropertyName],
        modelName: modelPropertyName,
      });
    });
  }

  private createModelProxy(proxyArgs: {
    proxyTarget: object;
    modelName: string;
  }) {
    const modelPropertyName = proxyArgs.modelName;
    const handler: ProxyHandler<object> = {
      get: (target: object, prop: string) => {
        console.log(proxyArgs.modelName);
        const tx = this.getTransactionClient();

        if (tx) {
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
