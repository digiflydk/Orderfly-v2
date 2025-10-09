
export type DebugEnv = { nodeEnv: string; appVersion: string };

export function getEnvInfo(): DebugEnv {
  return {
    nodeEnv: process.env.NODE_ENV || "",
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION || ""
  };
}
