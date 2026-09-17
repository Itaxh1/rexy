export interface Achievement {
  id: 'fire' | 'steady' | 'comeback' | 'bigday' | 'owl' | 'early' | 'club' | 'clean' | 'quick' | 'tag';
  name: string; rule: string; value?: number; target?: number; display?: string;
  status: 'earned' | 'progress' | 'untracked';
}
export interface ProfileData {
  since: string | null; asOf: string; activeDays: number; prompts: number; toolCalls: number;
  subagents: number | null; subagentSessions: number | null; projectsTotal: number; projectsActive: number;
  timezone?: string; coverage?: string;
  streak: { weeklyCurrent: number; weeklyBest: number; dailyCurrent: number; dailyBest: number;
    dailyBestRange: readonly [string, string] | null; freezes: number | null };
  weeks: [string, number][];
  records: { label: string; value: string; date: string }[];
  achievements: Achievement[]; hours: { label: string; range: string; pct: number }[];
  commands: { name: string; runs: number }[];
}
export interface OpenQuestion { id: string; subject: string; options: { date: string; quote: string }[] }
export interface ProjectDocs {
  model: string; generatedAt: string; sessionsCovered: number; projectMd: string; skillMd: string;
  questions: OpenQuestion[]; inputRevision?: string; evidenceCount?: number;
}
export interface Project {
  id?: string; name: string; sessions: number; days: number; prompts: number;
  firstActive: string; lastActive: string; agents: string; docs?: ProjectDocs;
  state?: 'none' | 'queued' | 'running' | 'ready' | 'failed';
  hasDocs?: boolean; stale?: boolean; error?: string | null;
}
export type ProfileResponse = { profile: ProfileData | null; generatedAt: string | null;
  purge: string; revision: string; updating: boolean; error: string | null };
export type ProjectsResponse = Omit<ProfileResponse, 'profile'> & { projects: Project[]; total: number; generationAvailable: boolean };
export type DocsResponse = { docs: ProjectDocs | null; state: Project['state']; error: string | null; stale: boolean; purge: string };
