import { Prisma } from "@prisma/client";
import { FlatTransactionClient } from "./prisma-tx-client-extension";
import { TransactionContextStore } from "./transaction-context-store";

import { AsyncLocalStorage } from "async_hooks";
import {
  TransactionForPropagationNotSupportedException,
  TransactionForPropagationRequiredException,
} from "../exceptions";
import { TransactionContext } from "../models";

const getModels = () => {
  return Prisma.dmmf.datamodel.models;
};

const getModelPropertyNames = () => {
  return getModels().map((m) => {
    const name = m.name;
    return name.charAt(0).toLocaleLowerCase() + name.slice(1);
  });
};

export interface MethodContext {
  isReadyToApply: boolean;
}

const runInExistingTransaction = (txData: {
  methodContext?: MethodContext;
  txContext?: TransactionContext;
  functionName: string;
  modelPropertyName?: string;
  thisArg?: any;
  args?: any;
}) => {
  const txContext = txData.txContext;
  const modelPropertyName = txData.modelPropertyName;
  const txClient = txContext?.txClient;
  const thisArg = txData.thisArg;
  const args = txData.args;
  const methodContext = txData.methodContext;
  const functionName = txData.functionName;
  const tx = txClient as { [key: string]: any };
  const newThisArg = modelPropertyName ? tx[modelPropertyName] : thisArg;
  if (methodContext) {
    methodContext.isReadyToApply = true;
  }
  if (modelPropertyName) {
    return tx[modelPropertyName][functionName].apply(newThisArg, args);
  } else {
    return tx[functionName].apply(newThisArg, args);
  }
};

const proxyMethodExecutionContext = new AsyncLocalStorage<MethodContext>();

const createProxyHandlerForFunction = (
  _prismaClient: { [key: string]: any },
  functionName: string,
  modelPropertyName?: string
) => {
  const proxyHandler: ProxyHandler<(...args: any[]) => any> = {
    apply(target, thisArg, args) {
      let methodContext = proxyMethodExecutionContext.getStore();

      // console.log(`${modelPropertyName}.${functionName} called`);
      const txContext =
        TransactionContextStore.getInstance().getTransactionContext();

      if (!txContext || methodContext?.isReadyToApply) {
        // a Transactional annotation must create a new transaction context in each case
        // otherwise the prisma client can not make any transaction decisions what to do
        // of course the transactional annotation is not a must have annotation - so if a method
        // is not annotated with Tranactional, the client should behave as normal
        // txConctext.isReadyToApply prevents endless loop, when new txClient is created, because txClient is also holding the proxied methods.
        return target.apply(thisArg, args);
      }

      const getTargetMethod = async (
        txContext: TransactionContext,
        methodContext: MethodContext
      ) => {
        let isRunningInTransaction = !!txContext?.txClient;
        const propagationType = txContext.options.propagationType;
        const isTxClientRequired =
          !txContext.txClient &&
          (propagationType === "REQUIRES_NEW" ||
            propagationType === "REQUIRED" ||
            propagationType === "MANDATORY" ||
            (propagationType === "SUPPORTS" && isRunningInTransaction));

        if (isTxClientRequired && !!txContext.isTxClientInProgress) {
          // handle parallel calls. The first one will emit the event. This makes sure same txClient is used
          txContext.txClient =
            await txContext.clientEventEmitter.waitForClientInstantiated(5000);
          txContext.isTxClientInProgress = false;
          isRunningInTransaction = true;
        } else if (isTxClientRequired) {
          txContext.isTxClientInProgress = true;
        }

        const runInNewTransaction = () => {
          return _prismaClient
            .$begin(txContext.options)
            .then((tx: { [key: string]: any }) => {
              txContext.txClient = tx as FlatTransactionClient;
              txContext.clientEventEmitter.emitClientInstantiated(
                txContext.txClient
              );
              methodContext.isReadyToApply = true;
              const newThisArg = modelPropertyName ? tx[modelPropertyName] : tx;

              if (modelPropertyName) {
                return tx[modelPropertyName][functionName].apply(
                  newThisArg,
                  args
                );
              } else {
                return tx[functionName].apply(newThisArg, args);
              }
            });
        };

        if (isRunningInTransaction) {
          if (
            propagationType === "REQUIRED" ||
            propagationType === "SUPPORTS" ||
            propagationType === "MANDATORY"
          ) {
            return runInExistingTransaction({
              functionName: functionName,
              args: args,
              methodContext: methodContext,
              modelPropertyName: modelPropertyName,
              thisArg: thisArg,
              txContext: txContext,
            });
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
            throw new TransactionForPropagationRequiredException(
              propagationType
            );
          } else {
            // NOT_SUPPORTED,NEVER,SUPPORTS propagations accept to run in non transactional context
            return target.apply(thisArg, args);
          }
        }
      };

      if (!methodContext) {
        // each execution should start to run inside a separate context with its own isReadyToApplu
        // otherwise two prisma calls in the same @Transactional method will use different prisma Client, which results
        // for @Transactional("REQUIRED") inside a call to the base client - dont think about is recursive ding dong :D
        methodContext = { isReadyToApply: false };
        return proxyMethodExecutionContext.run(methodContext, () => {
          return getTargetMethod(txContext, methodContext as MethodContext);
        });
      } else {
        return getTargetMethod(txContext, methodContext as MethodContext);
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
        (key) => typeof _prismaClient[modelPropertyName][key] === "function"
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
