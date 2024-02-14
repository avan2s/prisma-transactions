import { Prisma, PrismaClient } from "@prisma/client";
import txPrismaExtension from "./prisma-tx-client-extension";

const baseClient = new PrismaClient({
  datasources: {
    db: { url: "postgresql://postgres:postgres@localhost:6005/postgres" },
  },
  log: [
    {
      level: "query",
      emit: "event",
    },
  ],
})
const prismaClient = baseClient.$extends(txPrismaExtension);

describe("prisma tx client extension tests", () => {
  beforeEach(async () => {
    await prismaClient.appUser.deleteMany();
  });

  afterEach(async () => {
    await prismaClient.appUser.deleteMany();
    await prismaClient.$disconnect();
  });

  it("should create 2 users in one transaction", async () => {
    const queryEvents: Prisma.QueryEvent[] = [];
    baseClient.$on("query", (event) => queryEvents.push(event));

    const tx = await prismaClient.$begin();

    await tx.appUser.create({
      data: {
        firstname: "John",
        lastname: "Doe",
        email: "John.Doe@gmail.com",
      },
    });

    await tx.appUser.create({
      data: {
        firstname: "Jane",
        lastname: "Smith",
        email: "Jane.Smith@yahoo.com",
      },
    });

    await tx.$commit();
    expect(queryEvents.length).toBe(4);
    expect(queryEvents[0].query).toBe("BEGIN");
    expect(queryEvents[1].query).toContain("INSERT");
    expect(queryEvents[2].query).toContain("INSERT");
    expect(queryEvents[3].query).toBe("COMMIT");

    expect(await prismaClient.appUser.count()).toBe(2);
  });

  it("should rollback 2 users in transaction", async () => {
    const queryEvents: Prisma.QueryEvent[] = [];
    baseClient.$on("query", (event) => queryEvents.push(event));

    const tx = await prismaClient.$begin();

    await tx.appUser.create({
      data: {
        firstname: "John",
        lastname: "Doe",
        email: "John.Doe@gmail.com",
      },
    });

    await tx.appUser.create({
      data: {
        firstname: "Jane",
        lastname: "Smith",
        email: "Jane.Smith@yahoo.com",
      },
    });

    await tx.$rollback();
    expect(queryEvents.length).toBe(4);
    expect(queryEvents[0].query).toBe("BEGIN");
    expect(queryEvents[1].query).toContain("INSERT");
    expect(queryEvents[2].query).toContain("INSERT");
    expect(queryEvents[3].query).toBe("ROLLBACK");

    expect(await prismaClient.appUser.count()).toBe(0);
  });
});
