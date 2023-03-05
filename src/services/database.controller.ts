import { PrismaClient } from "@prisma/client";

const TEST = "someurl";
const HOST = "someHost";
const DB = "someDatabase";

function createExtendedClient(databaseUrl: string) {
  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  }).$extends({
    // name: "Testclient",
    result: {
      appUser: {
        Name: {
          needs: {
            firstname: true,
            lastname: true,
          },
          compute(model) {
            return `${model.firstname} ${model.lastname}`;
          },
        },
      },
    },
  });
}

export type IExtendedPrismaClient = ReturnType<typeof createExtendedClient>;

export class DatabaseController {
  public static createBaseClient(database: string) {
    return new PrismaClient({
      datasources: {
        db: {
          url: database,
        },
      },
    });
  }

  public static createExtendedClient(database: string): IExtendedPrismaClient {
    return createExtendedClient(database);
  }

  public static async initializeClientMap(): Promise<
    Map<string, IExtendedPrismaClient>
  > {
    const map = new Map<string, IExtendedPrismaClient>();
    const client1 = await DatabaseController.createExtendedClient("foo");
    const client2 = await DatabaseController.createExtendedClient("bar");
    map.set("foo", client1);
    map.set("bar", client2);
    return map;
  }
}

// // this one will have the property NAME available = no type error
// const client: IExtendedPrismaClient =
//   DatabaseController.createExtendedClient("someUselessUrl");

// client.appUser.findFirst().then((u) => u?.Name);

// DatabaseController.initializeClientMap().then((map) => {
//   map
//     .get("foo")
//     ?.appUser.findFirst()
//     .then((u) => u?.Name);

//   const prisma = map.get("bar");
// });

// this will not have the Name property available - type error
// DatabaseController.createBaseClient("someUselessUrl")
//   .appUser.findFirst()
//   .then((u) => u?.Name);

// export interface MethodResult {
//   name: string;
// }

// export type ExtendedResult<T extends Record<string, any>> = MethodResult & T;

// export function someMethod(): MethodResult {
//   return {
//     name: "method result",
//   };
// }

// export function withExtension<T extends Record<string, any>>(
//   obj: T
// ): ExtendedResult<T> {
//   return {
//     ...someMethod(),
//     ...obj,
//   };
// }

// withExtension({ foo: "bar", age: 12, person: { name: "foo" } });
