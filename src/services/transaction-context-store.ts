import { AsyncLocalStorage } from "async_hooks";
import { TransactionContext } from "../models";

export class TransactionContextStore {
  private transactionContextStore = new AsyncLocalStorage<TransactionContext>();

  private static instance: TransactionContextStore;

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
