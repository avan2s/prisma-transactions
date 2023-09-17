import { PrismaClient } from "@prisma/client";

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
            Firstname: true,
            Lastname: true,
          },
          compute(model) {
            return `${model.Firstname} ${model.Lastname}`;
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
