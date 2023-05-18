import { Prisma } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

export type FlatTransactionClient = Prisma.TransactionClient & {
  $commit: () => Promise<void>;
  $rollback: () => Promise<void>;
  txId: string;
};

const ROLLBACK = { [Symbol.for("prisma.client.extension.rollback")]: true };

export default Prisma.defineExtension({
  client: {
    async $begin() {
      const prisma = Prisma.getExtensionContext(this);
      let setTxClient: (txClient: Prisma.TransactionClient) => void;
      let commit: () => void;
      let rollback: () => void;

      // a promise for getting the tx inner client
      const txClient = new Promise<Prisma.TransactionClient>((res) => {
        setTxClient = (txClient) => res(txClient);
      });

      // a promise for controlling the transaction
      const txPromise = new Promise((_res, _rej) => {
        commit = () => _res(undefined);
        rollback = () => _rej(ROLLBACK);
      });

      // opening a transaction to control externally
      if (
        "$transaction" in prisma &&
        typeof prisma.$transaction === "function"
      ) {
        const tx = prisma
          .$transaction(
            (txClient: Prisma.TransactionClient) => {
              const txId = uuidv4();
              (txClient as FlatTransactionClient).txId = txId;
              console.log(`create transactionClient ${txId}`);
              setTxClient(txClient);
              return txPromise;
            },
            { timeout: 300000 }
          )
          .catch((e: Error | { [x: symbol]: boolean }) => {
            if (e === ROLLBACK) return;
            throw e;
          });

        // return a proxy TransactionClient with `$commit` and `$rollback` methods
        return new Proxy(await txClient, {
          get(target, prop) {
            if (prop === "$commit") {
              console.log("proxy.commit called");
              return () => {
                commit();
                return tx;
              };
            }
            if (prop === "$rollback") {
              console.log("rollback called");
              return () => {
                rollback();
                return tx;
              };
            }
            // @ts-expect-error - Fixing this type causes the TypeScript type checker to freeze
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return target[prop];
            // return target[prop as keyof typeof target];
          },
        }) as FlatTransactionClient;
      }

      throw new Error("Transactions are not supported by this client");
    },
  },
});
