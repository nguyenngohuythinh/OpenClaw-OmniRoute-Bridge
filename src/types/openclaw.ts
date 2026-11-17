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
  message: string;
  checkedAt: string;
  operation: RuntimeOperation | null;
}
export type RuntimeAction = 'start' | 'stop' | 'restart';

export interface RuntimeOperation {
  action: RuntimeAction | 'configure';
  startedAt: string;
  timeoutMs: number;
}
export interface RuntimePolicy {
  actionTimeoutMs: number;
  commandTimeoutMs: number;
  confirmationAttempts: number;
  confirmationDelayMs: number;
}
