import { v4 as uuidv4 } from "uuid";
import { PropagationTransactionOptions } from "../interfaces";
import { FlatTransactionClient, PrismaClientEventEmitter } from "../services";

// export interface TransactionContext {
//   txId: string;
//   txClient?: FlatTransactionClient;
//   options: PropagationTransactionOptions;
//   isTxClientInProgress?: boolean;
//   clientEventEmitter: PrismaClientEventEmitter;
// }

interface TransactionContextArgs {
  txId: string;
  txClient?: FlatTransactionClient;
  options: PropagationTransactionOptions;
  isTxClientInProgress?: boolean;
  clientEventEmitter: PrismaClientEventEmitter;
}

export class TransactionContext {
  txId: string;
  txClient?: FlatTransactionClient;
  options: PropagationTransactionOptions;
  isTxClientInProgress?: boolean;
  clientEventEmitter: PrismaClientEventEmitter;

  private constructor({
    txId,
    txClient,
    options,
    isTxClientInProgress,
    clientEventEmitter,
  }: TransactionContextArgs) {
    this.txId = txId;
    this.txClient = txClient;
    this.options = options;
    this.isTxClientInProgress = isTxClientInProgress;
    this.clientEventEmitter = clientEventEmitter;
  }

  public static forTransactionOptions(
    options: PropagationTransactionOptions,
    currentContext?: TransactionContext
  ): TransactionContext {
    const propagationType =
      currentContext?.options.propagationType || options.propagationType;
    const client =
      propagationType === "REQUIRES_NEW" ? undefined : currentContext?.txClient;
    const txTimeout = currentContext?.options?.txTimeout || 5000;
    return new TransactionContext({
      txId: uuidv4(),
      txClient: client,
      clientEventEmitter: new PrismaClientEventEmitter(),
      options: {
        propagationType: propagationType,
        txTimeout: txTimeout,
      },
    });
  }
}
