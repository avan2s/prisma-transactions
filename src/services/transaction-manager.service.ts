import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { ITransactionManager } from "../interfaces/transaction-manager.interface";
import {
  TransactionContext,
  TransactionContextStore,
} from "./transaction-context-store";

export type IPrismaClient = Omit<PrismaClient, "$use">;

// $transaction<R>(fn: (prisma: Omit<this, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use">) => Promise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): Promise<R>

export class TransactionManager implements ITransactionManager {
  private transactionContextToDbClient = new Map<string, PrismaClient>();

  constructor(
    private transactionContextStore = TransactionContextStore.getInstance()
  ) {}

  private getTransactionContext(): TransactionContext | undefined {
    return this.transactionContextStore.getTransactionContext();
  }

  public async startTransaction(): Promise<void> {
    return;
  }
  public async commitTransaction(): Promise<void> {
    return;
  }

  public async rollbackTransaction(): Promise<void> {
    return;
  }

  public async createTransaction() {
    const key = this.generateRandomTransactionNumber();
    // this.transactionContextToDbClient.set(key, value);
    return key;
  }

  public getTransaction(): PrismaClient | undefined {
    const context = this.getTransactionContext();
    if (!context) {
      return undefined;
    }
    return undefined;
  }

  private generateRandomTransactionNumber() {
    return uuidv4();
  }
}
