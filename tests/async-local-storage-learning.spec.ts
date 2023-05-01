import { AsyncLocalStorage } from "async_hooks";

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
});
