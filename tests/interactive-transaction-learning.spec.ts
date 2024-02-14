import { Prisma, PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";

import { extendTransaction } from "../src/services/extend-transaction";

describe("prisma learning tests", () => {
  const prismaClient = new PrismaClient({
    datasources: {
      db: { url: "postgresql://postgres:postgres@localhost:6005/postgres" },
    },
    log: [
      {
        level: "query",
        emit: "event",
      },
    ],
  });

  beforeEach(async () => {
    await prismaClient.appUser.deleteMany();
  });

  afterEach(async () => {
    await prismaClient.appUser.deleteMany();
    await prismaClient.$disconnect();
  });

  it("should rollback interactive transaction", async () => {
    const queryEvents: Prisma.QueryEvent[] = [];
    const expectedError = new Error("some Error");
    prismaClient.$on("query", (event) => queryEvents.push(event));
    await prismaClient
      .$transaction(
        async (txClient) => {
          // create twins on one transaction, either both or nobody
          const firstname = faker.name.firstName();
          const lastname = faker.name.lastName();
          const emailTwin1 = `${firstname}.${lastname}@${faker.internet.domainName()}`;
          const twin1 = await txClient.appUser.create({
            data: {
              firstname,
              lastname,
              email: emailTwin1,
            },
          });
          const firstname2 = faker.name.firstName();
          const emailTwin2 = `${firstname2}.${lastname}@${faker.internet.domainName()}`;
          const twin2 = await txClient.appUser.create({
            data: {
              firstname: firstname2,
              lastname: lastname,
              email: emailTwin2,
            },
          });
          throw new Error("some Error");
        },
        { timeout: 300000 }
      )
      .catch(async (err) => {
        expect(err.message).toBe(expectedError.message);
      });

    expect(queryEvents.length).toBe(4);
    expect(queryEvents[0].query).toBe("BEGIN");
    expect(queryEvents[1].query).toContain("INSERT");
    expect(queryEvents[2].query).toContain("INSERT");
    expect(queryEvents[3].query).toBe("ROLLBACK");
    const user = await prismaClient.appUser.findFirst();

    expect(user).toBeNull();
  });

  it("extend transaction client to use nested transaction inside transaction", async () => {
    const queryEvents: Prisma.QueryEvent[] = [];
    prismaClient.$on("query", (event) => queryEvents.push(event));
    await prismaClient.$transaction(async (tx) => {
      const user = await tx.appUser.create({
        data: {
          firstname: "John",
          lastname: "Doe",
          email: "john.doe@gmail.com",
        },
      });

      const composedClient = extendTransaction(tx) as PrismaClient;
      await composedClient.$transaction(async (tx) => {
        await tx.appUser.create({
          data: {
            firstname: "foo",
            lastname: "bar",
            email: "foo.bar@gmail.com",
          },
        });
      });
    });
  });
});
