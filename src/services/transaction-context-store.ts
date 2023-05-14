import { AsyncLocalStorage } from "async_hooks";
import { FlatTransactionClient } from "./prisma-tx-client-extension";
import { TransactionOptions } from "../interfaces/transaction-options";

export interface TransactionContext {
  txClient?: FlatTransactionClient;
  options: TransactionOptions;
  isReadyToApply: boolean;
}

export class TransactionContextStore {
  private transactionContextStore = new AsyncLocalStorage<TransactionContext>();

  private static instance: TransactionContextStore;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  public static getInstance(): TransactionContextStore {
    if (!TransactionContextStore.instance) {
      TransactionContextStore.instance = new TransactionContextStore();
    }
    return TransactionContextStore.instance;
  }

  public run(context: TransactionContext, callback: () => Promise<void>) {
    return this.transactionContextStore.run(context, callback);
  }

  public getTransactionContext(): TransactionContext | undefined {
    return this.transactionContextStore.getStore();
  }
}
