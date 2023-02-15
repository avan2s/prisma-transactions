import { Prisma, PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { ITransactionManager } from "../interfaces/transaction-manager.interface";

export type IPrismaClient = Omit<PrismaClient, "$use">;

// $transaction<R>(fn: (prisma: Omit<this, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use">) => Promise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): Promise<R>

export class TransactionManager implements ITransactionManager {
  private transactionNumberToDbClient = new Map<string, string>();

  constructor(private prisma: IPrismaClient) {}

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
    const value = `DB-Client-${key}`;
    this.transactionNumberToDbClient.set(key, value);
    return key;
  }

  public async getTransaction(transactionNumber: string) {
    return this.transactionNumberToDbClient.get(transactionNumber);
  }

  public deleteTransaction(transactionNumber: string) {
    return this.transactionNumberToDbClient.delete(transactionNumber);
  }

  public generateRandomTransactionNumber() {
    return uuidv4();
  }
}
