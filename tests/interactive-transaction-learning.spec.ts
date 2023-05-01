import { Prisma, PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";

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

    expect(queryEvents.length).toBe(6);
    expect(queryEvents[0].query).toBe("BEGIN");
    expect(queryEvents[1].query).toContain("INSERT");
    expect(queryEvents[2].query).toContain("SELECT");
    expect(queryEvents[3].query).toContain("INSERT");
    expect(queryEvents[4].query).toContain("SELECT");
    expect(queryEvents[5].query).toBe("ROLLBACK");
    const user = await prismaClient.appUser.findFirst();

    expect(user).toBeNull();
  });
});
