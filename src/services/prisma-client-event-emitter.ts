import { EventEmitter } from "events";
import { FlatTransactionClient } from "./prisma-tx-client-extension";

export class PrismaClientEventEmitter extends EventEmitter {
  private EVENT_INSTANTIATED = "clientInstantiated";

  constructor() {
    super();
    // this.setMaxListeners();
  }

  public subscribeToClientInstantiated(callbackHandler: () => void) {
    this.once(this.EVENT_INSTANTIATED, callbackHandler);
  }

  public emitClientInstantiated(txClient: FlatTransactionClient) {
    this.emit(this.EVENT_INSTANTIATED, txClient);
  }

  public waitForClientInstantiated(
    timeoutMs: number
  ): Promise<FlatTransactionClient> {
    return new Promise<FlatTransactionClient>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for clientInstantiated event"));
      }, timeoutMs);

      this.once(this.EVENT_INSTANTIATED, (client) => {
        clearTimeout(timeout);
        resolve(client);
      });
    });
  }
}
