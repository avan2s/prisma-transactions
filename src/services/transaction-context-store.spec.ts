import { TransactionContext } from "../models";
import { FlatTransactionClient } from "./prisma-tx-client-extension";
import { TransactionContextStore } from "./transaction-context-store";

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

    const newContext: TransactionContext =
      TransactionContext.forTransactionOptions({ propagationType: "REQUIRED" });

    await toTest.run(newContext, async () => {
      await beginTransaction();
      expect(newContext.txClient).toBeDefined();
    });

    // test if its waiting for the whole run before proceeding
    expect(newContext.txClient).toBeDefined();
  });
});
