import { AsyncLocalStorage } from "async_hooks";
import { type TransactionPropagation } from "../src/interfaces/transaction-options";

describe("async local storage - learning tests", () => {
  it("example usage AsyncLocalStorage", () => {
    const asyncLocalStorage = new AsyncLocalStorage<string>();
    const runDatabaseTransaction = async (context: string) => {
      // Set the current context using the AsyncLocalStorage instance
      asyncLocalStorage.run(context, async () => {
        console.log(`Running database transaction with context: ${context}`);
        // Simulate a database operation
        console.log(asyncLocalStorage.getStore());
        const nestedContext = context + "-nested";
        asyncLocalStorage.run(nestedContext, async () => {
          console.log(asyncLocalStorage.getStore());
        });
        console.log(asyncLocalStorage.getStore());
        await new Promise((resolve) => setTimeout(resolve, 1000));
      });
    };
    // Call the function with two different contexts
    runDatabaseTransaction("context1");
    runDatabaseTransaction("context2");
  });

  it("example usage AsyncLocalStorage non primitive type", async () => {
    interface Foo {
      name: string;
      age: number;
      propagationType: TransactionPropagation;
    }

    const asyncLocalStorage = new AsyncLocalStorage<Foo>();
    const runDatabaseTransaction = async (context: Foo) => {
      // Set the current context using the AsyncLocalStorage instance
      asyncLocalStorage.run(
        { age: 12, name: "foo", propagationType: "REQUIRED" },
        async () => {
          // Simulate a database operation
          console.log(asyncLocalStorage.getStore());
          const nestedContext = Object.assign(context, {
            name: context.name + "nested",
          });
          asyncLocalStorage.run(nestedContext, async () => {
            console.log(asyncLocalStorage.getStore());
          });
          console.log(asyncLocalStorage.getStore());
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      );
    };
    // // Call the function with two different contexts
    await runDatabaseTransaction({
      name: "context1",
      age: 10,
      propagationType: "REQUIRED",
    });
    // runDatabaseTransaction("context2");
  });
});
