export type TransactionPropagation =
  | "REQUIRED"
  | "REQUIRES_NEW"
  | "SUPPORTS"
  | "NOT_SUPPORTED"
  | "MANDATORY"
  | "NEVER";

export interface TransactionOptions {
  propagationType: TransactionPropagation;
  txTimeout?: number;
}
