import { PropagationTransactionOptions } from "../interfaces";
import { FlatTransactionClient, PrismaClientEventEmitter } from "../services";

export interface TransactionContext {
  txId: string;
  txClient?: FlatTransactionClient;
  baseClient?: { [key: string]: any };
  options: PropagationTransactionOptions;
  isTxClientInProgress?: boolean;
  clientEventEmitter: PrismaClientEventEmitter;
}
