import { Prisma, PrismaClient } from "@prisma/client";
import { TransactionManager } from "./transaction-manager.service";

export class MyPrismaClient extends PrismaClient {
  constructor(
    optionsArg?: Prisma.PrismaClientOptions,
    private transactionManager: TransactionManager = new TransactionManager()
  ) {
    super(optionsArg);
  }

  public getTransactionClient(): MyPrismaClient {
    //the propagation is done in the Transactional annotation.
    // there the interactive transaction is started and commited arount the function
    const txClient = this.transactionManager.getTransaction();
    if (txClient) {
      // get the prisma client from the current context
      return txClient as MyPrismaClient;
    }
    return this;
  }
}
