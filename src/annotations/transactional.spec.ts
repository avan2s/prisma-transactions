import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import txPrismaExtension from "../services/prisma-tx-client-extension";
import { Transactional } from "./transactional";

export class TestClass {
  @Transactional("REQUIRED")
  public requiredAnnotationTest(): void {
    // console.log('Doing something');
  }

  @Transactional("REQUIRED")
  public nestedRequiredAnnotationTest(): void {
    // console.log('do something 2');
    this.requiredAnnotationTest();
  }
}

describe("Example Test", () => {
  const toTest = new TestClass();
  const prismaClient = new PrismaClient({
    datasources: {
      db: { url: "postgresql://postgres:postgres@localhost:6005/postgres" },
    },
    log: ["query"],
  }).$extends(txPrismaExtension);

  beforeEach(async () => {
    await prismaClient.appUser.deleteMany();
    // await prismaClient.$connect();
  });

  afterEach(async () => {
    await prismaClient.appUser.deleteMany();
    await prismaClient.$disconnect();
  });

  it("test cun", () => {
    toTest.nestedRequiredAnnotationTest();
    expect(true).toBeTruthy();
  });

  it.skip("should return the expected result", async () => {
    const firstName = faker.name.firstName();
    const lastName = faker.name.lastName();
    const email = `${firstName}.${lastName}@${faker.internet.domainName()}`;

    const tx = await prismaClient.$begin();

    const user = await tx.appUser.create({
      data: {
        firstname: firstName,
        lastname: lastName,
        email: email,
      },
    });

    const firstName2 = faker.name.firstName();
    const lastName2 = faker.name.lastName();
    const email2 = `${firstName}.${lastName}@${faker.internet.domainName()}`;

    const user2 = await tx.appUser.create({
      data: {
        firstname: firstName2,
        lastname: lastName2,
        email: email2,
      },
    });

    await tx.$commit();
    // await prismaClient.$queryRaw`INSERT INTO app_user(id,firstname,lastname,email) VALUES('foo','peter','klaus','frida@boo.com') RETURNING id`;
    // console.log(user);
    // const userCount = await prismaClient.user.count();
    // toTest.nestedRequiredAnnotationTest();
    expect(1).toBe(1);
  });
});
