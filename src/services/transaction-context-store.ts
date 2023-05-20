import { AsyncLocalStorage } from "async_hooks";
import { FlatTransactionClient } from "./prisma-tx-client-extension";
import { PropagationTransactionOptions } from "../interfaces";

export interface TransactionContext {
  txId: string;
  txClient?: FlatTransactionClient;
  baseClient?: { [key: string]: any };
  options: PropagationTransactionOptions;
  isReadyToApply: boolean;
}

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
