import { Prisma } from "@prisma/client";
import { TransactionForPropagationNotSupportedException } from "../exceptions/transaction-for-propagation-not-supported-exception";
import { TransactionForPropagationRequiredException } from "../exceptions/transaction-for-propagation-required-exception";
import { FlatTransactionClient } from "./prisma-tx-client-extension";
import { TransactionContextStore } from "./transaction-context-store";

const getModels = () => {
  return Prisma.dmmf.datamodel.models;
};

const getModelPropertyNames = () => {
  return getModels().map((m) => {
    const name = m.name;
    return name.charAt(0).toLocaleLowerCase() + name.slice(1);
  });
};

const createProxyHandlerForFunction = (
  _prismaClient: { [key: string]: any },
  functionName: string,
  modelPropertyName?: string
) => {
  const proxyHandler: ProxyHandler<(...args: any[]) => any> = {
    apply(target, thisArg, args) {
      // console.log(`${modelPropertyName}.${functionName} called`);
      const txContext =
        TransactionContextStore.getInstance().getTransactionContext();

      console.log(
        `proxy.${modelPropertyName}.${functionName} in context: ${txContext?.txId} - txClientId: ${txContext?.txClient?.txId} `
      );
      if (!txContext || txContext.isReadyToApply) {
        // a Transactional annotation must create a new transaction context in each case
        // otherwise the prisma client can not make any transaction decisions what to do
        // of course the transactional annotation is not a must have annotation - so if a method
        // is not annotated with Tranactional, the client should behave as normal
        // txConctext.isReadyToApply prevents endless loop, when new txClient is created, because txClient is also holding the proxied methods.
        // if (txContext) {
        //   txContext.isReadyToApply = false;
        // }
        // if (txContext && txContext.isReadyToApply) {
        //   txContext.isReadyToApply = false;
        // }
        console.log(
          `proxy.apply ${modelPropertyName}.${functionName} in context: ${txContext?.txId} - txClientId = ${txContext?.txClient?.txId}`
        );
        return target.apply(thisArg, args);
      }
      const isRunningInTransaction = !!txContext?.txClient;
      const propagationType = txContext.options.propagationType;
      const runInNewTransaction = () => {
        return _prismaClient.$begin().then((tx: { [key: string]: any }) => {
          txContext.txClient = tx as FlatTransactionClient;
          txContext.baseClient = _prismaClient;
          txContext.isReadyToApply = true;
          const newThisArg = modelPropertyName ? tx[modelPropertyName] : tx;

          if (modelPropertyName) {
            return tx[modelPropertyName][functionName].apply(newThisArg, args);
          } else {
            return tx[functionName].apply(newThisArg, args);
          }
        });
      };

      const runInExistingTransaction = () => {
        const txClient = txContext?.txClient;
        const tx = txClient as { [key: string]: any };
        const newThisArg = modelPropertyName ? tx[modelPropertyName] : thisArg;
        txContext.isReadyToApply = true;
        console.log(
          `proxy run in current transaction txClient.${modelPropertyName}.${functionName} ${txContext.txId}`
        );
        if (modelPropertyName) {
          return tx[modelPropertyName][functionName].apply(newThisArg, args);
        } else {
          return tx[functionName].apply(newThisArg, args);
        }
      };

      if (isRunningInTransaction) {
        if (
          propagationType === "REQUIRED" ||
          propagationType === "SUPPORTS" ||
          propagationType === "MANDATORY"
        ) {
          return runInExistingTransaction();
        } else if (propagationType === "REQUIRES_NEW") {
          return runInNewTransaction();
        } else if (propagationType === "NOT_SUPPORTED") {
          // transaction is suspended and default method without transaction context is called
          return target.apply(thisArg, args);
        } else if (propagationType === "NEVER") {
          // throw hard exception if running inside transaction context
          throw new TransactionForPropagationNotSupportedException(
            propagationType
          );
        } else {
          return target.apply(thisArg, args);
        }
      } else {
        // without running transaction
        if (
          propagationType === "REQUIRED" ||
          propagationType === "REQUIRES_NEW"
        ) {
          return runInNewTransaction();
        } else if (propagationType === "MANDATORY") {
          throw new TransactionForPropagationRequiredException(propagationType);
        } else {
          // NOT_SUPPORTED,NEVER,SUPPORTS propagations accept to run in non transactional context
          return target.apply(thisArg, args);
        }
      }
    },
  };
  return proxyHandler;
};

const proxyModelFunctions = (prismaClient: object) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _prismaClient = prismaClient as { [key: string]: any };
  getModelPropertyNames().forEach((modelPropertyName) => {
    Object.keys(_prismaClient[modelPropertyName])
      .filter(
        (key) => _prismaClient[modelPropertyName][key] instanceof Function
      )
      .forEach((functionName) => {
        _prismaClient[modelPropertyName][functionName] = new Proxy(
          _prismaClient[modelPropertyName][functionName],
          createProxyHandlerForFunction(
            _prismaClient,
            functionName,
            modelPropertyName
          )
        );
        // _prismaClient[modelPropertyName][functionName] = proxyFunc;
      });
    _prismaClient.$queryRaw = new Proxy(
      _prismaClient.$queryRaw,
      createProxyHandlerForFunction(_prismaClient, "$queryRaw")
    );
  });
};

export const prismaTxPropagationExtension = Prisma.defineExtension((client) => {
  proxyModelFunctions(client);
  return client;
});
