import { PrismaClient } from "@prisma/client";
import { ITransactionManager } from "./transaction-manager.interface";

export type Propagation =
  | "REQUIRED"
  | "REQUIRES_NEW"
  | "SUPPORTS"
  | "NOT_SUPPORTED"
  | "MANDATORY"
  | "NEVER";

export interface TransactionOptions {
  propagationType: Propagation;
  txManager?: ITransactionManager;
  prismaClient: Omit<PrismaClient, "$use">;
}
