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

export class TransactionContext {
  private _txId: string;
  private _txClient?: FlatTransactionClient;
  private _options: PropagationTransactionOptions;
  private _isTxClientInProgress?: boolean;
  private _clientEventEmitter: PrismaClientEventEmitter;

  private constructor({
    txId,
    txClient,
    options,
    isTxClientInProgress,
    clientEventEmitter,
  }: TransactionContextArgs) {
    this._txId = txId;
    this._txClient = txClient;
    this._options = options;
    this._isTxClientInProgress = isTxClientInProgress;
    this._clientEventEmitter = clientEventEmitter;
  }

  public static forTransactionOptions(
    options: PropagationTransactionOptions,
    currentContext?: TransactionContext
  ): TransactionContext {
    const propagationType =
      options.propagationType || currentContext?.options.propagationType;
    const client =
      propagationType === "REQUIRES_NEW" ? undefined : currentContext?.txClient;
    const txTimeout =
      options.txTimeout || currentContext?.options?.txTimeout || 5000;
    const eventEmitter =
      propagationType === "REQUIRES_NEW"
        ? new PrismaClientEventEmitter()
        : currentContext?._clientEventEmitter || new PrismaClientEventEmitter();
    return new TransactionContext({
      txId: uuidv4(),
      txClient: client,
      clientEventEmitter: eventEmitter,
      options: {
        propagationType: propagationType,
        txTimeout: txTimeout,
      },
    });
  }

  public close() {
    this.clientEventEmitter.removeAllListeners();
  }

  public takeTxClientInProgress() {
    this._isTxClientInProgress = true;
  }

  public takeTxClientOffProgress(): void {
    this._isTxClientInProgress = false;
  }

  public set txClient(txClient: FlatTransactionClient | undefined) {
    this._txClient = txClient;
  }

  public get txClient(): FlatTransactionClient | undefined {
    return this._txClient;
  }

  public get txId(): string {
    return this._txId;
  }

  public get options(): PropagationTransactionOptions {
    return this._options;
  }

  public get isTxClientInProgress(): boolean | undefined {
    return this._isTxClientInProgress;
  }

  public get clientEventEmitter(): PrismaClientEventEmitter {
    return this._clientEventEmitter;
  }
}

interface TransactionContextArgs {
  txId: string;
  txClient?: FlatTransactionClient;
  options: PropagationTransactionOptions;
  isTxClientInProgress?: boolean;
  clientEventEmitter: PrismaClientEventEmitter;
}
