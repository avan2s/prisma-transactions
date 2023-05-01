import {
  AppUser,
  Artifact,
  Post,
  PostArtifact,
  PrismaClient,
  SharedEntity,
} from "@prisma/client";
import { IExtendedPrismaClient } from "./database.controller";

export interface ISharedEntity extends SharedEntity {
  Artifact?: Artifact | null;
}

export interface IAppUser extends AppUser {
  posts: IPost[] | null;
}

export interface IPost extends Post {
  postArtifact: IPostArtifact | null;
}

export interface IPostArtifact extends PostArtifact {
  post: IPost | null;
}

async function getFullUserEntityPromise() {
  return new PrismaClient().appUser.findFirstOrThrow({
    include: {
      posts: {
        include: {
          postArtifact: true,
        },
      },
    },
  });
}

export type UserWithReferencePromise = ReturnType<
  typeof getFullUserEntityPromise
>;

export type UserWithReferences = UserWithReferencePromise extends Promise<
  infer T
>
  ? T
  : never;

export class UserService {
  constructor(private prisma: IExtendedPrismaClient) {}

  public async findUser(userId: number) {
    return this.prisma.user.findUniqueOrThrow({
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
