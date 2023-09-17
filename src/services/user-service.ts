import { Artifact, SharedEntity } from "@prisma/client";
import { IExtendedPrismaClient } from "./database-controller";

export interface ISharedEntity extends SharedEntity {
  Artifact?: Artifact | null;
}

export class UserService {
  constructor(private prisma: IExtendedPrismaClient) {}

  public async findUser(userId: number) {
    return this.prisma.appUser.findUniqueOrThrow({
      where: { ID: userId },
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
    });
  }

  public async findUserSharedEntities(userId: number) {
    return this.prisma.sharedEntity.findMany({
      where: {
        UserId: userId,
        NOT: {
          ArtifactId: null,
        },
      },
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
    });
  }

  public async findUserSharedEntities2(userId: number) {
    return this.prisma.sharedEntity.findMany({
      where: {
        UserId: userId,
        NOT: {
          ArtifactId: null,
        },
      },
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
    });
  }

  public async findUserSharedEntityWithoutDefinedReturnType(userId: number) {
    return this.prisma.sharedEntity.findFirstOrThrow({
      where: { UserId: userId },
      include: {
        Artifact: true,
      },
    });
  }

  public async findUserSharedEntityWithDefinedReturnType(
    userId: number
  ): Promise<SharedEntity> {
    return this.prisma.sharedEntity.findFirstOrThrow({
      where: { UserId: userId },
      include: {
        Artifact: true,
      },
    });
  }

  public async findUserSharedEntityWithOwnReturnType(
    userId: number
  ): Promise<ISharedEntity> {
    return this.prisma.sharedEntity.findFirstOrThrow({
      where: { UserId: userId },
      include: {
        Artifact: true,
      },
    });
  }
}
