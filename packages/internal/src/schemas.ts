import * as s from 'superstruct';

export const packageJsonSchema = s.type({
  name: s.string(),
  main: s.optional(s.string()),
  module: s.optional(s.string()),
  types: s.optional(s.string()),
  type: s.optional(s.string()),
  private: s.optional(s.boolean()),
  files: s.optional(s.array(s.string())),
  dependencies: s.optional(s.record(s.string(), s.string())),
  devDependencies: s.optional(s.record(s.string(), s.string())),
  peerDependencies: s.optional(s.record(s.string(), s.string())),
});

const pnpmDependency = s.type({
  from: s.string(),
  version: s.string(),
  resolved: s.optional(s.string()),
  path: s.string(),
});

export type PnpmWorkspace = s.Infer<typeof workspaceSchema>;

export const workspaceSchema = s.type({
  name: s.string(),
  version: s.string(),
  path: s.string(),
  private: s.boolean(),
  dependencies: s.optional(s.record(s.string(), pnpmDependency)),
  devDependencies: s.optional(s.record(s.string(), pnpmDependency)),
  unsavedDependencies: s.optional(s.record(s.string(), pnpmDependency)),
});

export const workspacesSchema = s.array(workspaceSchema);

export const tsconfigSchema = s.type({
  extends: s.optional(s.string()),
  include: s.optional(s.array(s.string())),
  exclude: s.optional(s.array(s.string())),
  compilerOptions: s.optional(
    s.type({
      paths: s.optional(s.record(s.string(), s.array(s.string()))),
      jsx: s.optional(s.string()),
      jsxFactory: s.optional(s.string()),
      jsxImportSource: s.optional(s.string()),
    })
  ),
  references: s.optional(
    s.array(
      s.object({
        path: s.string(),
      })
    )
  ),
});

export const pnpmPackSchema = s.type({
  name: s.string(),
  version: s.string(),
  filename: s.string(),
  files: s.array(s.type({ path: s.string() })),
});
