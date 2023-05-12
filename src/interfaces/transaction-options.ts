import { ITransactionManager } from "./transaction-manager.interface";

export type TransactionPropagation =
  | "REQUIRED"
  | "REQUIRES_NEW"
  | "SUPPORTS"
  | "NOT_SUPPORTED"
  | "MANDATORY"
  | "NEVER";

export interface TransactionOptions {
  propagationType: TransactionPropagation;
  txManager?: ITransactionManager;
  txTimeout?: number;
  // prismaClient: Omit<PrismaClient, "$use">;
}
