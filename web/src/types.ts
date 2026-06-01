// Mirrors schema/service-catalog.schema.json. Kept permissive on enums
// (string fallbacks) so the viewer never breaks on schema evolution — the
// catalog is the source of truth, this is a read-only lens over it.

export type Lifecycle = 'experimental' | 'non-prod' | 'prod' | 'sunset';
export type CriticalityTier = 0 | 1 | 2 | 3 | '?' | 'unknown';
export type DataClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
export type Interaction =
  | 'sync-http'
  | 'async-http'
  | 'async-event'
  | 'sftp'
  | 'batch'
  | 'fdw'
  | 'dms'
  | 's3'
  | 'infrastructure'
  | 'grpc'
  | 'soap';

export interface Dependency {
  serviceId: string;
  interaction: Interaction;
  critical: boolean;
  purpose: string;
  external: boolean;
  endpoint?: string;
  supportsFeatures?: string[];
}

export interface ExcludedDependency {
  serviceId: string;
  interaction: Interaction;
  purpose: string;
  external: boolean;
  endpoint?: string;
  exclusionReason: string;
}

export interface AwsService {
  type: string;
  purpose: string;
  engine?: string;
  version?: string;
  instanceType?: string;
  drStrategy?: string;
  rdsPrimaryInstanceCount?: number;
  minReplicas?: number;
  maxReplicas?: number;
  cpuRequest?: string;
  memoryRequest?: string;
  cpuLimit?: string;
  memoryLimit?: string;
}

export interface Datastore {
  name: string;
  type: string;
  restrictedData: boolean;
  critical: boolean;
  retention?: string;
  engine?: string;
  version?: string;
  drStrategy?: string;
}

export interface Feature {
  name: string;
  description?: string;
}

export interface Operational {
  pagerDutyEscalationPolicyLink?: string;
  runbookUrl?: string;
  splunkDashboardURL?: string;
  newRelicDashboardURL?: string;
}

export interface Service {
  serviceId: string;
  name: string;
  description?: string;
  lifecycle: Lifecycle;
  criticalityTier: CriticalityTier;
  repository: string;
  runtime?: string;
  softwareFramework?: string;
  team: string;
  teamEmail: string;
  product?: string;
  valueStream?: string;
  financeProduct?: string;
  train?: string;
  dataClassification: DataClassification;
  catalogGroup?: string;
  drStrategy?: string;
  processingModesSupported?: string[];
  lastUpdatedDate?: string;
  verifiedBy?: string;
  verificationDate?: string;
  operational?: Operational;
  awsServices?: AwsService[];
  datastores?: Datastore[];
  features?: Feature[];
  dependencies?: Dependency[];
  excludedDependencies?: ExcludedDependency[];
  tags?: Record<string, string>;
  _source?: string;
}

export interface Catalog {
  generatedFrom: string;
  count: number;
  services: Service[];
}

// A directed edge in the resolved dependency graph: `from` depends on `to`.
export interface Edge {
  from: string;
  to: string;
  dep: Dependency;
}

export type MapMode = 'dependencies' | 'dependants' | 'both';
export type Depth = 1 | 2 | 0; // 0 == all hops
