import {
  Propagation,
  TransactionOptions,
} from "../interfaces/transaction-options";

/**
 * implements the behaviour of springs transaction propagation types https://www.baeldung.com/spring-transactional-propagation-isolation
 * @param options
 * @returns
 */
export const Transactional = (options: TransactionOptions) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    if (!(originalMethod instanceof Function)) {
      throw new Error(
        "The tansactional annotation can only be used on methods."
      );
    }
    descriptor.value = async function (...args: any[]) {
      const result = originalMethod.apply(this, args);
      const existingTransaction = false;
      const isRunningInsideTransaction = !!existingTransaction;
      // const propagationType = options.
      // if (propagationType === 'REQUIRED') {
      //     if (isRunningInsideTransaction) {
      //         const t = transactionManager.createTransaction();
      //         console.log('append to existing transaction');
      //     } else {
      //         console.log('create new transaction');
      //     }
      // } else if (propagationType === 'SUPPORTS') {
      //     if (isRunningInsideTransaction) {
      //         console.log('use existing transaction')
      //     }
      //     console.log('use db client without any transactional behaviour')
      // } else if (propagationType === "NEVER") {
      //     if (isRunningInsideTransaction) {
      //         throw new Error('transactions are not supported for this method');
      //     }
      //     console.log('use db client without any transactional behaviour');
      // } else if (propagationType === 'REQUIRES_NEW') {
      //     if (isRunningInsideTransaction) {
      //         console.log('suspend the current transaction and create a new transaction');
      //     } else {
      //         console.log('create a new independent transaction')
      //     }
      // } else if (propagationType === 'MANDATORY') {
      //     if (!isRunningInsideTransaction) {
      //         throw new Error('a pre existing transaction is required');
      //     }
      //     console.log('use existing transaction');
      // }
      if (result === null || result !== void 0) {
        return result;
      }
      // return result === void 0 ? Promise.resolve(undefined) : result;
    };
    return descriptor;
  };
};
