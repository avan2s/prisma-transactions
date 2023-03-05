import { AppUser } from "@prisma/client";
import {
  DatabaseController,
  IExtendedPrismaClient,
} from "./database.controller";

const prisma: IExtendedPrismaClient = DatabaseController.createExtendedClient(
  "postgresql://postgres:postgres@localhost:6005/postgres"
);

async function getUser(userId: bigint) {
  return prisma.appUser.findFirstOrThrow({
    where: { id: userId },
    select: {
      posts: {
        select: {
          postArtifact: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });
}

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
    const postArtifact = await prisma.postArtifact.create({
      data: {
        name: "Art1",
      },
    });
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
                postArtifactId: postArtifact.id,
              },
              {
                comment: "comm2",
                postArtifactId: postArtifact.id,
              },
            ],
          },
        },
      },
    });

    const userInDb = await prisma.appUser.findFirstOrThrow({
      where: { id: user.id },
      select: {
        posts: {
          select: {
            postArtifact: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
    userInDb.posts.map((u) => u.postArtifact);

    expect(userInDb.posts.length).toBe(2);
  });
});
