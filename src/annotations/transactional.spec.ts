import { AppUser, Prisma, PrismaClient } from "@prisma/client";

import { prismaTxPropagationExtension } from "../services/prisma-tx-propagation-extension";
import { Transactional } from "./transactional";
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

// const prismaClient = new PrismaClient({
//   datasources: {
//     db: { url: "postgresql://postgres:postgres@localhost:6005/postgres" },
//   },
//   log: [
//     {
//       level: "query",
//       emit: "event",
//     },
//   ],
// }).$extends(txPrismaExtension);

// // const transactionManager = new TransactionManager(prismaClient);

// export class TestClass {
//   private prismaService = new PrismaClient();

//   @TransactionalDeprecated({ propagationType: "REQUIRED", prismaClient })
//   public async requiredTest(
//     user: AppUser,
//     prisma: PrismaClient = this.prismaService
//   ): Promise<AppUser> {
//     return prisma.appUser.create({
//       data: {
//         firstname: user.firstname,
//         lastname: user.lastname,
//         email: user.email,
//       },
//     });
//   }

//   @TransactionalDeprecated({ propagationType: "REQUIRED", prismaClient })
//   public async requiredAttachToTransactionTest(
//     foo: string,
//     bar = 5,
//     prisma: PrismaClient = this.prismaService
//   ): Promise<void> {
//     const firstname = faker.name.firstName() + foo;
//     const lastname = faker.name.lastName();
//     const email = faker.internet.email(firstname, lastname);
//     const user = await prisma.appUser.create({
//       data: {
//         firstname,
//         lastname,
//         email,
//       },
//     });
//     await this.requiredTest(user, prisma);
//   }

//   @TransactionalDeprecated({ propagationType: "REQUIRED", prismaClient })
//   public async requiredNestedRollbackTest(
//     foo: string,
//     errorToThrowInNestedMethod: Error,
//     prisma: PrismaClient = this.prismaService
//   ): Promise<void> {
//     const firstname = faker.name.firstName() + foo;
//     const lastname = faker.name.lastName();
//     const email = faker.internet.email(firstname, lastname);
//     const user = await prisma.appUser.create({
//       data: {
//         firstname,
//         lastname,
//         email,
//       },
//     });
//     await this.requiredRollbackTest(user, errorToThrowInNestedMethod, prisma);
//   }

//   @TransactionalDeprecated({ propagationType: "REQUIRED", prismaClient })
//   public async requiredRollbackTest(
//     user: AppUser,
//     errorToThrow: Error,
//     prisma: PrismaClient
//   ) {
//     const updatedUser = await prisma.appUser.update({
//       where: { id: user.id },
//       data: {
//         firstname: `${user.firstname}-II`,
//       },
//     });
//     if (errorToThrow) {
//       throw errorToThrow;
//     }
//     return updatedUser;
//   }

//   @TransactionalDeprecated({ propagationType: "REQUIRED", prismaClient })
//   public async requiresNewTestWithOneNestedMethodCall(
//     prismaClient: PrismaClient = this.prismaService
//   ) {
//     // create tom
//     await prismaClient.appUser.create({
//       data: {
//         firstname: "Tom",
//         lastname: "Felton",
//         email: "tom.felton@superduper.com",
//       },
//     });

//     // Create another person in the nested method in a saperate transaction
//     // No matter if the code proceed
//     const firstname = faker.name.firstName();
//     const lastname = faker.name.lastName();
//     const email = faker.internet.email(firstname, lastname);
//     await this.requiresNewTestForSingleInsert(
//       {
//         firstname,
//         lastname,
//         email,
//       } as AppUser,
//       prismaClient
//     );
//   }

//   @TransactionalDeprecated({ propagationType: "REQUIRED", prismaClient })
//   public async requiresNewTestWithMultipleNestedMethodCalls(
//     prismaClient: PrismaClient = this.prismaService
//   ) {
//     Array.from({ length: 2 }, () => {
//       const firstname = faker.name.firstName();
//       const lastname = faker.name.lastName();
//       const email = faker.internet.email(firstname, lastname);
//       return {
//         firstname,
//         lastname,
//         email,
//       } as AppUser;
//     }).forEach((user) => {
//       this.requiresNewTestForSingleInsert(user, prismaClient);
//     });
//   }

//   @TransactionalDeprecated({
//     propagationType: "REQUIRES_NEW",
//     prismaClient: prismaClient,
//   })
//   public async requiresNewTestForSingleInsert(
//     appUser: AppUser,
//     prisma: PrismaClient
//   ) {
//     return prisma.appUser.create({
//       data: appUser,
//     });
//   }
// }

// describe("Transactional Integration Test", () => {
//   const toTest = new TestClass();

//   beforeEach(async () => {
//     await prismaClient.appUser.deleteMany();
//     // await prismaClient.$connect();
//   });

//   afterEach(async () => {
//     await prismaClient.appUser.deleteMany();
//     await prismaClient.$disconnect();
//   });

//   describe("REQUIRED test", () => {
//     it(`should attach to pre existing transaction propagation type REQUIRED`, async () => {
//       const queryEvents: Prisma.QueryEvent[] = [];
//       prismaClient.$on("query", (event) => queryEvents.push(event));

//       await toTest.requiredAttachToTransactionTest("bar");
//       expect(queryEvents.length).toBe(6);
//       expect(queryEvents[0].query).toBe("BEGIN");
//       expect(queryEvents[1].query).toContain("INSERT");
//       expect(queryEvents[2].query).toContain("SELECT");
//       expect(queryEvents[3].query).toContain("INSERT");
//       expect(queryEvents[4].query).toContain("SELECT");
//       expect(queryEvents[5].query).toBe("COMMIT");
//     });

//     it(`should create new transaction for propagation type REQUIRED`, async () => {
//       const queryEvents: Prisma.QueryEvent[] = [];
//       prismaClient.$on("query", (event) => queryEvents.push(event));
//       const userArg = {
//         id: 1n,
//         email: "foo@bar.com",
//         firstname: "andy",
//         lastname: "Baum",
//       };
//       const user = await toTest.requiredTest(userArg);
//       expect(user.firstname).toBe(userArg.firstname);
//       expect(user.lastname).toBe(userArg.lastname);
//       expect(user.email).toBe(userArg.email);
//       expect(queryEvents.length).toBe(4);
//       expect(queryEvents[0].query).toBe("BEGIN");
//       expect(queryEvents[1].query).toContain("INSERT");
//       expect(queryEvents[2].query).toContain("SELECT");
//       expect(queryEvents[3].query).toBe("COMMIT");
//     });

//     it(`should rollback the transaction if something failed in the nested method for propagation type REQUIRED`, async () => {
//       const queryEvents: Prisma.QueryEvent[] = [];
//       prismaClient.$on("query", (event) => queryEvents.push(event));
//       const expectedError = new Error("some Error");
//       try {
//         await toTest.requiredNestedRollbackTest("bar", expectedError);
//       } catch (err) {
//         expect(queryEvents.length).toBe(7);
//         expect(queryEvents[0].query).toBe("BEGIN");
//         expect(queryEvents[1].query).toContain("INSERT");
//         expect(queryEvents[2].query).toContain("SELECT");
//         expect(queryEvents[3].query).toContain("SELECT");
//         expect(queryEvents[4].query).toContain("UPDATE");
//         expect(queryEvents[5].query).toContain("SELECT");
//         expect(queryEvents[6].query).toBe("ROLLBACK");

//         const user = await prismaClient.appUser.findFirst();
//         expect(user).toBeNull();
//       }
//     });
//   });

//   describe("REQUIRES_NEW test", () => {
//     it("should create a separate transaction for inside nested method call", async () => {
//       const queryEvents: Prisma.QueryEvent[] = [];
//       prismaClient.$on("query", (event) => queryEvents.push(event));
//       await toTest.requiresNewTestWithOneNestedMethodCall();
//       expect(queryEvents.length).toBe(8);
//       // the first transaction 1
//       expect(queryEvents[0].query).toBe("BEGIN");
//       expect(queryEvents[1].query).toContain("INSERT");
//       expect(queryEvents[2].query).toContain("SELECT");
//       // the new created separate transaction tx 1a
//       expect(queryEvents[3].query).toBe("BEGIN");
//       expect(queryEvents[4].query).toContain("INSERT");
//       expect(queryEvents[5].query).toContain("SELECT");
//       expect(queryEvents[6].query).toBe("COMMIT");

//       // end of first transaction
//       expect(queryEvents[7].query).toBe("COMMIT");
//     });

//     it.skip("should create a separate transaction for each nested method call", async () => {
//       const queryEvents: Prisma.QueryEvent[] = [];
//       prismaClient.$on("query", (event) => queryEvents.push(event));
//       await toTest.requiresNewTestWithMultipleNestedMethodCalls();
//       console.log(queryEvents.map((s) => s.query));
//       expect(1).toBe(1);
//     });
//   });
// });
