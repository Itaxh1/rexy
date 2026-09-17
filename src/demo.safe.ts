/** Public demo data is synthetic. Never bundle locally measured transcript fixtures. */
import type { ProfileData, Project } from './insightTypes';
export type { Project, ProjectDocs, OpenQuestion, Achievement } from './insightTypes';
export const SKILL_LIMIT = 500;
export const projectsTotal = 2;
export const projects: Project[] = [
  { name:'Example dashboard',sessions:3,days:3,prompts:12,firstActive:'2026-09-14',lastActive:'2026-09-16',agents:'Claude Code + Codex',
    docs:{model:'synthetic demo',generatedAt:'2026-09-16',sessionsCovered:3,questions:[],
      projectMd:'# Example dashboard\n\nSynthetic demonstration, not a real user project.\n\n## Context\nA small activity dashboard. Verify changes in a browser before reporting completion.\n',
      skillMd:'---\nname: rexy-example-dashboard\ndescription: Example dashboard context. Use for this synthetic demo project.\n---\n\nReview current code before editing. Verify the requested behavior in a browser and report what was tested.\n'} },
  {name:'Example CLI',sessions:2,days:2,prompts:8,firstActive:'2026-09-15',lastActive:'2026-09-16',agents:'Codex'},
];
export const profile: ProfileData = {
  since:'2026-09-14',asOf:'2026-09-17',activeDays:3,prompts:20,toolCalls:75,
  subagents:null,subagentSessions:null,projectsTotal:2,projectsActive:0,
  coverage:'Synthetic demo, not account data.',timezone:'UTC',
  streak:{weeklyCurrent:1,weeklyBest:1,dailyCurrent:3,dailyBest:3,dailyBestRange:['2026-09-14','2026-09-16'],freezes:null},
  weeks:Array.from({length:26},(_,i)=>[new Date(Date.UTC(2026,8,14)-(25-i)*7*86400000).toISOString().slice(0,10),i===25?3:0]),
  records:[{label:'Busiest day',value:'30 tool calls',date:'2026-09-16'}],
  achievements:[{id:'fire',name:'On Fire',rule:'14-day daily streak',value:3,target:14,status:'progress'},
    {id:'tag',name:'Tag Team',rule:'Claude Code and Codex on the same day',value:1,target:1,status:'earned'},
    {id:'clean',name:'Clean Run',rule:'50 verified actions without failures',status:'untracked'}],
  hours:[{label:'Day',range:'9 AM–6 PM',pct:100}],commands:[{name:'Read',runs:45},{name:'Bash',runs:30}],
};
