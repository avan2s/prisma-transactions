import {
  DatabaseController,
  IExtendedPrismaClient,
} from "../src/services/database-controller";
import { UserService } from "../src/services/user-service";

const prisma: IExtendedPrismaClient = DatabaseController.createExtendedClient(
  "postgresql://postgres:postgres@localhost:6005/postgres"
);

describe("testSuite 1", () => {
  const userService = new UserService(prisma);
  beforeEach(async () => {
    // prepare some stuff if required
  });

  afterEach(async () => {
    // delete created records if required
    // ...
    await prisma.$disconnect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("test extended prisma client", async () => {
    // no errors here
    const sharedWithUser = (
      await prisma.appUser.findUniqueOrThrow({
        where: { ID: 1 },
        select: {
          SharedEntities: {
            select: {
              Artifact: {
                include: {
                  AssignedSite: true,
                  Epoch: true,
                  Category: true,
                  QrCode: true,
                },
              },
            },
            where: {
              NOT: {
                ArtifactId: null,
              },
            },
          },
        },
      })
    ).SharedEntities.map((x) => x.Artifact);

    const userWithSharedEntities = await userService.findUser(1);
    userWithSharedEntities.SharedEntities.map((x) => x.Artifact);

    const userWithSharedEntities2 = await userService.findUserSharedEntities(1);
    userWithSharedEntities2.map((x) => x.Artifact);

    // this works because the return type is not defined and typescript finds it out
    const sharedEntity =
      await userService.findUserSharedEntityWithoutDefinedReturnType(1);
    console.log(sharedEntity.Artifact);

    // here i receive the error, because it return Promise<Artifact> , which only holds the basic attributes, not references
    // this is reproducing the issue that you mentioned
    // const sharedEntity2 =
    //   await userService.findUserSharedEntityWithDefinedReturnType(1);
    // console.log(sharedEntity2.Artifact);

    // with own defined interface it is working
    const sharedEntity3 =
      await userService.findUserSharedEntityWithOwnReturnType(1);
    console.log(sharedEntity3.Artifact);
  });
});
