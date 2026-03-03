export function assertEnv(name: string, value: string) {
  if (!value) {
    throw new Error(`Missing required env variable: ${name}`);
  }
}