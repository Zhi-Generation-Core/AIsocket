export type Severity = 'mild' | 'moderate' | 'severe';
export type PainType = 'pressure' | 'friction' | 'numbness' | 'loose' | 'unstable';
export type ActivityScene = 'standing' | 'walking' | 'stairs' | 'sitting' | 'exercise' | 'other';

export interface CaseInfo {
  id: string;
  title: string;
  side: string | null;
  activityLevel: string | null;
  patientName: string | null;
}

export interface SocketVersion {
  id: string;
  version_number: number;
  label: string | null;
  status: string | null;
  created_at: string;
}

export interface SessionData {
  case: CaseInfo;
  recentVersions: SocketVersion[];
}

export interface BindResponse extends SessionData {
  bindingId: string;
  caseId: string;
}

export interface PainHotspot {
  region_id: string;
  severity: Severity;
  count: number;
}

export interface SummaryData {
  days: number;
  painHotspots: PainHotspot[];
  usage: {
    avg_wear_minutes: number;
    avg_comfort: number | string;
    log_days: number;
  };
  recentNotes: Array<{
    feedback_type: string;
    content: string;
    created_at: string;
  }>;
}

export interface TimelineData {
  painFeedback: Array<{
    id: string;
    region_id: string;
    severity: Severity;
    pain_type: string | null;
    activity_scene: string | null;
    notes: string | null;
    created_at: string;
  }>;
  usageLogs: Array<{
    id: string;
    log_date: string;
    wear_minutes: number;
    comfort_score: number | null;
    activity_scene: string | null;
    notes: string | null;
    created_at: string;
  }>;
  feedback: Array<{
    id: string;
    feedback_type: string;
    content: string;
    created_at: string;
  }>;
}

export type OfflineAction =
  | { type: 'pain-map'; body: Record<string, unknown> }
  | { type: 'feedback'; body: Record<string, unknown> };

export interface QueuedItem {
  id: string;
  action: OfflineAction;
  createdAt: string;
}
