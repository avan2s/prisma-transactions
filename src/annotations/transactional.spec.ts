import { faker } from "@faker-js/faker";
import { AppUser, Prisma, PrismaClient } from "@prisma/client";
import { TransactionManager } from "../services/transaction-manager.service";
import { Transactional } from "./transactional";

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
}); //.$extends(txPrismaExtension);

const transactionManager = new TransactionManager(prismaClient);

export class TestClass {
  private prismaService = new PrismaClient();

  @Transactional({ propagationType: "REQUIRED", prismaClient })
  public async requiredTest(
    user: AppUser,
    prisma: PrismaClient = this.prismaService
  ): Promise<AppUser> {
    return prisma.appUser.create({
      data: {
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
      },
    });
  }

  @Transactional({ propagationType: "REQUIRED", prismaClient })
  public async requiredAttachToTransactionTest(
    foo: string,
    bar = 5,
    prisma: PrismaClient = this.prismaService
  ): Promise<void> {
    const firstname = faker.name.firstName() + foo;
    const lastname = faker.name.lastName();
    const email = `${firstname}.${lastname}@${faker.internet.domainName()}`;
    const user = await prisma.appUser.create({
      data: {
        firstname,
        lastname,
        email,
      },
    });
    await this.requiredTest(user, prisma);
  }

  public async requiredNestedRollbackTest(
    foo: string,
    errorToThrowInNestedMethod: Error,
    prisma: PrismaClient = this.prismaService
  ): Promise<void> {
    const firstname = faker.name.firstName() + foo;
    const lastname = faker.name.lastName();
    const email = `${firstname}.${lastname}@${faker.internet.domainName()}`;
    const user = await prisma.appUser.create({
      data: {
        firstname,
        lastname,
        email,
      },
    });
    await this.requiredRollbackTest(user, errorToThrowInNestedMethod, prisma);
  }

  @Transactional({ propagationType: "REQUIRED", prismaClient })
  public async requiredRollbackTest(
    user: AppUser,
    errorToThrow: Error,
    prisma: PrismaClient
  ) {
    const updatedUser = await prisma.appUser.update({
      where: { id: user.id },
      data: {
        firstname: `${user.firstname}-II`,
      },
    });
    if (errorToThrow) {
      throw errorToThrow;
    }
    return updatedUser;
  }
}

describe("Example Test", () => {
  const toTest = new TestClass();

  beforeEach(async () => {
    await prismaClient.appUser.deleteMany();
    // await prismaClient.$connect();
  });

  afterEach(async () => {
    await prismaClient.appUser.deleteMany();
    await prismaClient.$disconnect();
  });

  it(`should attach to pre existing transaction propagation type REQUIRED`, async () => {
    const queryEvents: Prisma.QueryEvent[] = [];
    prismaClient.$on("query", (event) => queryEvents.push(event));

    await toTest.requiredAttachToTransactionTest("bar");
    expect(queryEvents.length).toBe(6);
    expect(queryEvents[0].query).toBe("BEGIN");
    expect(queryEvents[1].query).toContain("INSERT");
    expect(queryEvents[2].query).toContain("SELECT");
    expect(queryEvents[3].query).toContain("INSERT");
    expect(queryEvents[4].query).toContain("SELECT");
    expect(queryEvents[5].query).toBe("COMMIT");
  });

  it(`should create new transaction for propagation type REQUIRED`, async () => {
    const queryEvents: Prisma.QueryEvent[] = [];
    prismaClient.$on("query", (event) => queryEvents.push(event));
    const userArg = {
      id: 1n,
      email: "foo@bar.com",
      firstname: "andy",
      lastname: "Baum",
    };
    const user = await toTest.requiredTest(userArg);
    expect(user.firstname).toBe(userArg.firstname);
    expect(user.lastname).toBe(userArg.lastname);
    expect(user.email).toBe(userArg.email);
    expect(queryEvents.length).toBe(4);
    expect(queryEvents[0].query).toBe("BEGIN");
    expect(queryEvents[1].query).toContain("INSERT");
    expect(queryEvents[2].query).toContain("SELECT");
    expect(queryEvents[3].query).toBe("COMMIT");
  });

  it.only(`should rollback the transaction if something failed in the nested method for propagation type REQUIRED`, async () => {
    const queryEvents: Prisma.QueryEvent[] = [];
    prismaClient.$on("query", (event) => queryEvents.push(event));
    const expectedError = new Error("some Error");
    try {
      await toTest.requiredNestedRollbackTest("bar", expectedError);
    } catch (err) {
      const user = await prismaClient.appUser.findFirst();
      expect(user).toBeUndefined();
    }
  });

  it.skip("should return the expected result", async () => {
    const firstName = faker.name.firstName();
    const lastName = faker.name.lastName();
    const email = `${firstName}.${lastName}@${faker.internet.domainName()}`;

    // const tx = await prismaClient.$begin();

    // const user = await tx.appUser.create({
    //   data: {
    //     firstname: firstName,
    //     lastname: lastName,
    //     email: email,
    //   },
    // });

    const firstName2 = faker.name.firstName();
    const lastName2 = faker.name.lastName();
    const email2 = `${firstName}.${lastName}@${faker.internet.domainName()}`;

    // const user2 = await tx.appUser.create({
    //   data: {
    //     firstname: firstName2,
    //     lastname: lastName2,
    //     email: email2,
    //   },
    // });

    // await tx.$commit();
    // await prismaClient.$queryRaw`INSERT INTO app_user(id,firstname,lastname,email) VALUES('foo','peter','klaus','frida@boo.com') RETURNING id`;
    // console.log(user);
    // const userCount = await prismaClient.user.count();
    // toTest.nestedRequiredAnnotationTest();
    expect(1).toBe(1);
  });
});
