import { TransactionOptions } from "./transaction-options";

export type TransactionPropagation =
  | "REQUIRED"
  | "REQUIRES_NEW"
  | "SUPPORTS"
  | "NOT_SUPPORTED"
  | "MANDATORY"
  | "NEVER";

export interface PropagationTransactionOptions extends TransactionOptions {
  propagationType: TransactionPropagation;
}
