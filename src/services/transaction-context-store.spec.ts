import { FlatTransactionClient } from "./prisma-tx-client-extension";
import {
  TransactionContext,
  TransactionContextStore,
} from "./transaction-context-store";
import { v4 as uuidv4 } from "uuid";

describe("test transaction context store", () => {
  it("should receive singleton instance", () => {
    const txContextStore = TransactionContextStore.getInstance();
    expect(txContextStore).toBeDefined();
    const secondTxContextStore = TransactionContextStore.getInstance();
    expect(txContextStore === secondTxContextStore).toBeTruthy();
    expect(txContextStore).toBe(secondTxContextStore);
  });

  it("should set the txClient in transaction context in a child asyc call. The parent call can access the txClient from the current transactionContext without accessing the store second time", async () => {
    const toTest = TransactionContextStore.getInstance();
    expect(toTest.getTransactionContext()).toBeUndefined();
    const mockTxClient: jest.Mocked<FlatTransactionClient> =
      {} as jest.Mocked<FlatTransactionClient>;

    const beginTransaction = async () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          const txContext =
            TransactionContextStore.getInstance().getTransactionContext();
          expect(txContext).toBeDefined();
          if (txContext) {
            txContext.txClient = mockTxClient;
          }
          resolve("begin simulated transaction");
        }, 500);
      });
    };

    const newContext: TransactionContext = {
      options: { propagationType: "REQUIRED" },
      isReadyToApply: false,
      txId: uuidv4(),
    };
    await toTest.run(newContext, async () => {
      await beginTransaction();
      expect(newContext.txClient).toBeDefined();
    });

    // test if its waiting for the whole run before proceeding
    expect(newContext.txClient).toBeDefined();
  });
});
