/**
 * Re-exports the Prisma namespace from the CommonJS @prisma/client package.
 *
 * @prisma/client v6 is a CJS-only module. When the server runs as ESM (package.json
 * "type":"module"), Node.js cannot resolve named exports from CJS modules at import-time.
 * This shim uses a default import (which always works for CJS) and re-exports the
 * runtime values (error classes, enums, helpers) that cannot be `import type`-d.
 */
import PrismaDefault from "@prisma/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { Prisma } = PrismaDefault as any;

export const PrismaClientKnownRequestError: typeof import("@prisma/client").Prisma.PrismaClientKnownRequestError =
  Prisma.PrismaClientKnownRequestError;

export const PrismaClientUnknownRequestError: typeof import("@prisma/client").Prisma.PrismaClientUnknownRequestError =
  Prisma.PrismaClientUnknownRequestError;

export const PrismaClientRustPanicError: typeof import("@prisma/client").Prisma.PrismaClientRustPanicError =
  Prisma.PrismaClientRustPanicError;

export const PrismaClientInitializationError: typeof import("@prisma/client").Prisma.PrismaClientInitializationError =
  Prisma.PrismaClientInitializationError;

export const PrismaClientValidationError: typeof import("@prisma/client").Prisma.PrismaClientValidationError =
  Prisma.PrismaClientValidationError;

/** Runtime enum — use instead of `Prisma.TransactionIsolationLevel` */
export const TransactionIsolationLevel: typeof import("@prisma/client").Prisma.TransactionIsolationLevel =
  Prisma.TransactionIsolationLevel;

/** SQL list helper — use instead of `Prisma.join(...)` */
export const join: typeof import("@prisma/client").Prisma.join = Prisma.join;
