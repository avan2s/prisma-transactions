/* eslint-disable @typescript-eslint/no-explicit-any */
export type GetFirstCallbackParameter<T> = T extends (
  ...args: [(param1: infer R) => any]
) => any
  ? R
  : never;
