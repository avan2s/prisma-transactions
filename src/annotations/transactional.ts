import "reflect-metadata";
import { TransactionForPropagationNotSupportedException } from "../exceptions/transaction-for-propagation-not-supported-exception";
import { TransactionForPropagationRequiredException } from "../exceptions/transaction-for-propagation-required-exception";
import { TransactionOptions } from "../interfaces/transaction-options";
import {
  TransactionContext,
  TransactionContextStore,
} from "../services/transaction-context-store";

const defaultOptions: TransactionOptions = {
  propagationType: "REQUIRED",
  txTimeout: 10000,
};
/**
 * implements the behaviour of springs transaction propagation types https://www.baeldung.com/spring-transactional-propagation-isolation
 * @param options
 * @returns
 */
export const Transactional = (options: TransactionOptions = defaultOptions) => {
  return (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) => {
    options = Object.assign({}, defaultOptions, options);
    const originalMethod = descriptor.value;
    const methodName = propertyKey;
    if (!(originalMethod instanceof Function)) {
      throw new Error(
        `The tansactional annotation can only be used on methods. Currently it is used on ${methodName}`
      );
    }

    descriptor.value = async function (...args: unknown[]) {
      const txContextStore = TransactionContextStore.getInstance();
      const txClient = txContextStore.getTransactionContext()?.txClient;
      const isRunningInTransaction = !!txClient;
      const propagationType = options.propagationType;
      let result = null;

      const runInExistingTransactionContext = async () => {
        result = await originalMethod.apply(this, args);
      };

      const runInNewTransactionContext = async (
        context: TransactionContext
      ) => {
        // Set the current context using the AsyncLocalStorage instance
        await txContextStore.run(context, async () => {
          try {
            result = await originalMethod.apply(this, args);
          } catch (err) {
            txClient?.$rollback();
          }
          await txClient?.$commit();
        });
      };

      if (propagationType === "REQUIRED") {
        if (isRunningInTransaction) {
          await runInExistingTransactionContext();
          // reuse the current prisma client
          result = await originalMethod.apply(this, args);
        } else {
          await runInNewTransactionContext({
            options: { propagationType: propagationType },
            txTimeout: 300000,
          });
        }
      } else if (propagationType === "SUPPORTS") {
        // reuse the current prisma client nevertheless it is running inside a transation or not
        // NOTE: that prisma creates a transaction automatically for create and update operations, because nested create statements should run in a single transaction. This way prisma ensures consitenccy
        result = await originalMethod.apply(this, args);
      } else if (propagationType === "NEVER") {
        if (isRunningInTransaction) {
          throw new TransactionForPropagationNotSupportedException(
            propagationType
          );
        }
        // use db client without any transactional behaviour
        result = await originalMethod.apply(this, args);
      } else if (propagationType === "REQUIRES_NEW") {
        // suspend the current transaction and create a complete new separate transaction, no matter if it is already running inside a transaction
        await runInNewTransactionContext({
          options: { propagationType: propagationType },
          txTimeout: 300000,
          txClient: undefined,
        });
      } else if (propagationType === "MANDATORY") {
        if (!isRunningInTransaction) {
          throw new TransactionForPropagationRequiredException(propagationType);
        }
        await runInExistingTransactionContext();
      }
      if (result === null || result !== void 0) {
        return result;
      }
    };
    return descriptor;
  };
};
