import {
  DatabaseController,
  IExtendedPrismaClient,
} from "./database.controller";

const prisma: IExtendedPrismaClient = DatabaseController.createExtendedClient(
  "postgresql://postgres:postgres@localhost:6005/postgres"
);

describe("testSuite 1", () => {
  beforeEach(async () => {
    await prisma.appUser.deleteMany();
    DatabaseController.createBaseClient("foo");
    // await prismaClient.$connect();
  });

  afterEach(async () => {
    await prisma.post.deleteMany();
    await prisma.appUser.deleteMany();
    await prisma.$disconnect();
  });

  it("test client", async () => {
    const user = await prisma.appUser.create({
      data: {
        email: "a@gmail.com",
        firstname: "John",
        lastname: "Doe",
        posts: {
          createMany: {
            data: [
              {
                comment: "comm1",
              },
              {
                comment: "comm2",
              },
            ],
          },
        },
      },
    });

    const userInDb = await prisma.appUser.findFirstOrThrow({
      where: { id: user.id },
      include: {
        posts: true,
      },
    });

    expect(userInDb.posts.length).toBe(2);
  });
});
