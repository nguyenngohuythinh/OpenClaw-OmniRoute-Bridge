export interface OpenClawStatus {
  installed: boolean;
  commandExists: boolean;
  running: boolean | null;
  reachable: boolean;
  pid: number | null;
  version: string | null;
  configPath: string | null;
  configExists: boolean;
  currentModel: string | null;
  gatewayPort: number | null;
  code: string;
}
export type RuntimeAction = 'start' | 'stop' | 'restart';
