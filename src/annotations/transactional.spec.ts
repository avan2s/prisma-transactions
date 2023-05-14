import { AppUser, Prisma, PrismaClient } from "@prisma/client";

import { Transactional } from "./transactional";
import {
  prismaTxPropagationExtension,
  proxyModelFunctions,
} from "../services/prisma-tx-propagation-extension";
import prismaTxClientExtension from "../services/prisma-tx-client-extension";
function createPrismaTestClient() {
  const prisma = new PrismaClient({
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
    .$extends(prismaTxClientExtension)
    .$extends(prismaTxPropagationExtension);
  return prisma;
}

export type IExtendedPrismaClient = ReturnType<typeof createPrismaTestClient>;
const prismaClient = createPrismaTestClient();

export type AppUserWithoutId = Omit<AppUser, "id">;

export class TestClass {
  constructor(private prisma: IExtendedPrismaClient) {}

  @Transactional({ propagationType: "REQUIRED", txTimeout: 60000 })
  public async requiredTest(user: AppUserWithoutId): Promise<AppUser> {
    return this.prisma.appUser.create({
      data: {
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
      },
    });
  }
}

describe("Transactional Integration Test", () => {
  const toTest = new TestClass(prismaClient);

  beforeEach(async () => {
    await prismaClient.appUser.deleteMany();
    await prismaClient.$connect();
  });

  afterEach(async () => {
    await prismaClient.appUser.deleteMany();
    await prismaClient.$disconnect();
  });

  describe("REQUIRED test", () => {
    it.only(`should create user inside a transactional context`, async () => {
      const queryEvents: Prisma.QueryEvent[] = [];
      prismaClient.$on("query", (event) => queryEvents.push(event));

      await toTest.requiredTest({
        email: "foo@bar.de",
        firstname: "John",
        lastname: "Doe",
      });

      expect(queryEvents.length).toBe(4);
      expect(queryEvents[0].query).toBe("BEGIN");
      expect(queryEvents[1].query).toContain("INSERT");
      expect(queryEvents[2].query).toContain("SELECT");
      expect(queryEvents[3].query).toBe("COMMIT");
    });

    it.skip(`should attach to pre existing transaction propagation type REQUIRED`, async () => {
      const queryEvents: Prisma.QueryEvent[] = [];
      prismaClient.$on("query", (event) => queryEvents.push(event));

      await toTest.requiredTest({
        email: "foo@bar.de",
        firstname: "John",
        lastname: "Doe",
      });
      console.log(queryEvents);

      expect(queryEvents.length).toBe(4);
      expect(queryEvents[0].query).toBe("BEGIN");
      expect(queryEvents[1].query).toContain("INSERT");
      expect(queryEvents[2].query).toContain("SELECT");
      expect(queryEvents[3].query).toBe("COMMIT");

      // expect(queryEvents.length).toBe(6);
      // expect(queryEvents[0].query).toBe("BEGIN");
      // expect(queryEvents[1].query).toContain("INSERT");
      // expect(queryEvents[2].query).toContain("SELECT");
      // expect(queryEvents[3].query).toContain("INSERT");
      // expect(queryEvents[4].query).toContain("SELECT");
      // expect(queryEvents[5].query).toBe("COMMIT");
    });
  });
});
