import "reflect-metadata";
import {
  TransactionForPropagationNotSupportedException,
  TransactionForPropagationRequiredException,
} from "../exceptions";
import {
  PropagationTransactionOptions,
  TransactionPropagation,
} from "../interfaces";
import { TransactionContextStore } from "../services";
import { TransactionContext } from "../models";

const defaultOptions: PropagationTransactionOptions = {
  propagationType: "REQUIRED",
  txTimeout: 10000,
};
/**
 * implements the behaviour of springs transaction propagation types https://www.baeldung.com/spring-transactional-propagation-isolation
 * @param options
 * @returns
 */
export const Transactional = (
  options: PropagationTransactionOptions = defaultOptions
) => {
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
      const annotationPropagationType = options.propagationType;

      const txContextStore = TransactionContextStore.getInstance();
      let txContext = txContextStore.getTransactionContext();
      const isRunningInTransactionBeforeMethodCall = !!txContext?.txClient;
      validateTransactionPropagation(txContext, annotationPropagationType);

      const runInNewTransactionContext = async (
        context: TransactionContext
      ) => {
        // Set the current context using the AsyncLocalStorage instance
        await txContextStore.run(context, async () => {
          // in this method, the context.txClient will be set in case the propgation type is defining this
          try {
            result = await originalMethod.apply(this, args);
          } catch (err) {
            if (context?.txClient) {
              await context.txClient.$rollback();
              context.close();
            }
            throw err;
          }
          const isCommittable =
            annotationPropagationType === "REQUIRES_NEW" ||
            (!isRunningInTransactionBeforeMethodCall &&
              annotationPropagationType === "REQUIRED");

          // context.txClient is now expected to be set
          if (context.txClient && isCommittable) {
            await context.txClient.$commit();
            context.close();
          } else if (
            !isRunningInTransactionBeforeMethodCall &&
            annotationPropagationType === "REQUIRED"
          ) {
            throw Error(
              `Unable to commit transaction for propgation ${annotationPropagationType} - no commitable transaction client was found in the TransactionContext. Make sure that the end of the method represents a finished state of the transactional database operations. Often this is caused by missing await statemtns inside the annotated method. Otherwise remove the ${Transactional.name} annotation`
            );
          }
        });
      };

      let result = null;

      if (
        !txContext ||
        annotationPropagationType !== txContext.options.propagationType ||
        annotationPropagationType === "REQUIRES_NEW"
      ) {
        // a transaction context holds information about the transaction context with all its options
        // this is created for all propagation types to ensure later that the prismaclient model functions
        // will have a running context to decide, if a transaction client has to be created or reused
        // if the propagation of a nested method is different a new transaction context is created in the child call
        txContext = TransactionContext.forTransactionOptions(
          options,
          txContext
        ) as TransactionContext;

        //TODO: try to create a promise with a prisma client here, which will not wait
        await runInNewTransactionContext(txContext);
      } else {
        // run in existing context. The prisma model proxy methods will know what to do by transaction context information and their txClients
        try {
          result = await originalMethod.apply(this, args);
        } catch (err) {
          if (txContext?.txClient) {
            await txContext.txClient.$rollback();
            txContext.close();
          }
          throw err;
        }
      }

      if (result === null || result !== void 0) {
        return result;
      }
    };
    return descriptor;
  };
};

const validateTransactionPropagation = (
  txContext: TransactionContext | undefined,
  propagation: TransactionPropagation
) => {
  const isRunningInTransactionBeforeMethodCall = !!txContext?.txClient;
  const propagationType = propagation;
  if (isRunningInTransactionBeforeMethodCall && propagationType === "NEVER") {
    throw new TransactionForPropagationNotSupportedException(propagationType);
  }

  if (
    !isRunningInTransactionBeforeMethodCall &&
    propagationType === "MANDATORY"
  ) {
    throw new TransactionForPropagationRequiredException(propagationType);
  }
};
