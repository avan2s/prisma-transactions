import { AsyncLocalStorage } from "async_hooks";
export class TransactionContextStore {
  private transactionContextStore = new AsyncLocalStorage<string>();

  private static instance: TransactionContextStore;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  public static getInstance(): TransactionContextStore {
    if (!TransactionContextStore.instance) {
      TransactionContextStore.instance = new TransactionContextStore();
    }
    return TransactionContextStore.instance;
  }

  public getTransactionContext(): string | undefined {
    return this.transactionContextStore.getStore();
  }
}
