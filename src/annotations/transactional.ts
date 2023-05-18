import "reflect-metadata";
import {
  TransactionForPropagationNotSupportedException,
  TransactionForPropagationRequiredException,
} from "../exceptions";
import { TransactionContext, TransactionContextStore } from "../services";
import { TransactionOptions, TransactionPropagation } from "../interfaces";
import { v4 as uuidv4 } from "uuid";

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
      const annotationPropagationType = options.propagationType;

      const txContextStore = TransactionContextStore.getInstance();
      let txContext = txContextStore.getTransactionContext();

      validateTransactionPropagation(txContext, annotationPropagationType);

      const isRunningInTransactionBeforeMethodCall = !!txContext?.txClient;

      if (txContext) {
        txContext.isReadyToApply = false;
      }

      const runInNewTransactionContext = async (
        context: TransactionContext
      ) => {
        // Set the current context using the AsyncLocalStorage instance
        await txContextStore.run(context, async () => {
          // in this method, the context.txClient will be set in case the propgation type is defining this
          // console.log(
          //   `@Transactional.runInNewTransactionContext ${txContext?.txId}`
          // );
          result = await originalMethod.apply(this, args);
          const isCommittable =
            annotationPropagationType === "REQUIRES_NEW" ||
            (!isRunningInTransactionBeforeMethodCall &&
              annotationPropagationType === "REQUIRED");

          // context.txClient is now expected to be set
          if (context.txClient && isCommittable) {
            await context.txClient.$commit();
          } else if (
            !isRunningInTransactionBeforeMethodCall &&
            annotationPropagationType === "REQUIRED"
          ) {
            throw Error(
              `Unable to commit transaction for propgation ${annotationPropagationType} - no commitable transaction client was found in the TransactionContext. Make sure you use the prisma client methods in this annotated method. Otherwise remove the ${Transactional.name} annotation`
            );
          }
        });
      };

      let result = null;

      if (
        !txContext ||
        annotationPropagationType !== txContext.options.propagationType
      ) {
        // a transaction context holds information about the transaction context with all its options
        // this is created for all propagation types to ensure later that the prismaclient model functions
        // will have a running context to decide, if a transaction client has to be created or reused
        // if the propagation of a nested method is different a new transaction context is created in the child call
        txContext = {
          txId: uuidv4(),
          txClient: txContext?.txClient,
          options: {
            propagationType: annotationPropagationType,
            txTimeout: options.txTimeout,
          },
          isReadyToApply: false,
        };

        //TODO: try to create a promise with a prisma client here, which will not wait
        await runInNewTransactionContext(txContext);
      } else {
        // run in existing context. The prisma model proxy methods will know what to do by transaction context information and their txClients
        result = await originalMethod.apply(this, args);
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
