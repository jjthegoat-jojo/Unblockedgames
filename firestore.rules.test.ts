/**
 * Firestore Security Rules Test Suite — Dirty Dozen Verification
 * Verifies that all 12 adversarial payloads in security_spec.md return PERMISSION_DENIED
 * while valid workspace and suggestion operations succeed.
 */

export interface SimulatedContext {
  auth: { uid: string; email?: string; email_verified: boolean } | null;
  requestTimeMs: number;
}

export interface GenericPayload {
  [key: string]: unknown;
}

const ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const COL_REGEX = /^[a-zA-Z0-9 _-]+$/;
const SENDER_REGEX = /^[a-zA-Z0-9 _\-.]+$/;
const WORKSPACE_KEYS = ['ownerId', 'favoriteIds', 'customColumns', 'createdAt', 'updatedAt'];
const SUGGESTION_KEYS = ['senderName', 'note', 'serverSource', 'targetId', 'createdAt'];
const SERVER_SOURCES = [
  'AI Studio',
  'Version 1',
  'Version 2',
  'Version 3',
  'Version 4',
  'Server 1',
  'Server 2',
  'Server 3',
  'Server 4',
  'Google Sites'
];
const ADMIN_EMAIL = 'jojojohnson0425@gmail.com';

function isValidId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && ID_REGEX.test(id);
}

function isAdmin(ctx: SimulatedContext): boolean {
  return Boolean(ctx.auth && ctx.auth.email_verified === true && ctx.auth.email === ADMIN_EMAIL);
}

function isValidStringList(arr: unknown, maxItems: number, maxLen: number, regex: RegExp): boolean {
  if (!Array.isArray(arr) || arr.length > maxItems) return false;
  if (arr.length === 0) return true;
  return typeof arr[0] === 'string' && arr[0].length >= 1 && arr[0].length <= maxLen && regex.test(arr[0]);
}

function isValidUserWorkspace(data: GenericPayload, uid: string): boolean {
  const keys = Object.keys(data);
  if (!WORKSPACE_KEYS.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => WORKSPACE_KEYS.includes(k))) return false;
  if (typeof data.ownerId !== 'string' || !isValidId(data.ownerId) || data.ownerId !== uid) return false;
  if (!isValidStringList(data.favoriteIds, 200, 120, ID_REGEX)) return false;
  if (!isValidStringList(data.customColumns, 30, 32, COL_REGEX)) return false;
  if (typeof data.createdAt !== 'number' || typeof data.updatedAt !== 'number') return false;
  return true;
}

function isValidSuggestionNote(data: GenericPayload): boolean {
  const keys = Object.keys(data);
  if (!SUGGESTION_KEYS.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => SUGGESTION_KEYS.includes(k))) return false;
  if (
    typeof data.senderName !== 'string' ||
    data.senderName.length < 1 ||
    data.senderName.length > 40 ||
    !SENDER_REGEX.test(data.senderName)
  ) {
    return false;
  }
  if (typeof data.note !== 'string' || data.note.length < 2 || data.note.length > 500) {
    return false;
  }
  if (typeof data.serverSource !== 'string' || !SERVER_SOURCES.includes(data.serverSource)) {
    return false;
  }
  if (data.targetId !== 'jords-ai-studio') return false;
  if (typeof data.createdAt !== 'number') return false;
  return true;
}

export function evaluateWorkspaceRule(
  op: 'get' | 'list' | 'create' | 'update',
  userIdParam: string,
  ctx: SimulatedContext,
  incoming?: GenericPayload,
  existing?: GenericPayload
): 'ALLOW' | 'PERMISSION_DENIED' {
  if (op === 'list') return 'PERMISSION_DENIED';
  if (!ctx.auth) return 'PERMISSION_DENIED';

  if (op === 'get') {
    return isValidId(userIdParam) && ctx.auth.uid === userIdParam ? 'ALLOW' : 'PERMISSION_DENIED';
  }

  if (op === 'create' && incoming) {
    const ok =
      ctx.auth.email_verified === true &&
      isValidId(userIdParam) &&
      isValidUserWorkspace(incoming, ctx.auth.uid) &&
      ctx.auth.uid === userIdParam &&
      incoming.createdAt === ctx.requestTimeMs &&
      incoming.updatedAt === ctx.requestTimeMs;
    return ok ? 'ALLOW' : 'PERMISSION_DENIED';
  }

  if (op === 'update' && incoming && existing) {
    const affected = Object.keys(incoming).filter(
      (k) => JSON.stringify(incoming[k]) !== JSON.stringify(existing[k])
    );
    const allowedUpdateKeys = ['favoriteIds', 'customColumns', 'updatedAt'];
    const ok =
      isValidUserWorkspace(incoming, ctx.auth.uid) &&
      ctx.auth.email_verified === true &&
      isValidId(userIdParam) &&
      ctx.auth.uid === userIdParam &&
      incoming.ownerId === existing.ownerId &&
      incoming.createdAt === existing.createdAt &&
      incoming.updatedAt === ctx.requestTimeMs &&
      affected.every((k) => allowedUpdateKeys.includes(k));
    return ok ? 'ALLOW' : 'PERMISSION_DENIED';
  }

  return 'PERMISSION_DENIED';
}

export function evaluateSuggestionRule(
  op: 'get' | 'list' | 'create' | 'update' | 'delete',
  suggestionIdParam: string,
  ctx: SimulatedContext,
  incoming?: GenericPayload,
  existing?: GenericPayload
): 'ALLOW' | 'PERMISSION_DENIED' {
  if (op === 'update') return 'PERMISSION_DENIED';
  if (op === 'get' || op === 'delete') {
    return isAdmin(ctx) && isValidId(suggestionIdParam) ? 'ALLOW' : 'PERMISSION_DENIED';
  }
  if (op === 'list') {
    return isAdmin(ctx) && existing?.targetId === 'jords-ai-studio' ? 'ALLOW' : 'PERMISSION_DENIED';
  }
  if (op === 'create' && incoming) {
    const ok =
      isValidId(suggestionIdParam) &&
      isValidSuggestionNote(incoming) &&
      incoming.createdAt === ctx.requestTimeMs;
    return ok ? 'ALLOW' : 'PERMISSION_DENIED';
  }
  return 'PERMISSION_DENIED';
}

const NOW = 1762000000000;
const baseWorkspace: GenericPayload = {
  ownerId: 'user_1',
  favoriteIds: ['retro-bowl'],
  customColumns: ['Top Picks'],
  createdAt: NOW,
  updatedAt: NOW
};

const baseSuggestion: GenericPayload = {
  senderName: 'Player 1',
  note: 'Please add more racing tracks!',
  serverSource: 'Server 1',
  targetId: 'jords-ai-studio',
  createdAt: NOW
};

const dirtyDozenResults = [
  // 1. Unauthenticated workspace write
  evaluateWorkspaceRule('create', 'user_1', { auth: null, requestTimeMs: NOW }, baseWorkspace),
  // 2. Unverified admin email spoof reading suggestions
  evaluateSuggestionRule('list', 'sug_1', { auth: { uid: 'spoof_1', email: ADMIN_EMAIL, email_verified: false }, requestTimeMs: NOW }, undefined, baseSuggestion),
  // 3. Cross-user workspace path mismatch
  evaluateWorkspaceRule('create', 'victim_1', { auth: { uid: 'attacker_1', email_verified: true }, requestTimeMs: NOW }, { ...baseWorkspace, ownerId: 'attacker_1' }),
  // 4. Workspace owner field spoof
  evaluateWorkspaceRule('create', 'user_1', { auth: { uid: 'user_1', email_verified: true }, requestTimeMs: NOW }, { ...baseWorkspace, ownerId: 'victim_1' }),
  // 5. Shadow/ghost field injection on suggestion
  evaluateSuggestionRule('create', 'sug_1', { auth: null, requestTimeMs: NOW }, { ...baseSuggestion, isVerified: true }),
  // 6. ID poisoning (200-char ID)
  evaluateSuggestionRule('create', 'x'.repeat(200), { auth: null, requestTimeMs: NOW }, baseSuggestion),
  // 7. Unbounded array resource exhaustion
  evaluateWorkspaceRule('update', 'user_1', { auth: { uid: 'user_1', email_verified: true }, requestTimeMs: NOW + 10 }, { ...baseWorkspace, favoriteIds: Array(205).fill('retro-bowl'), updatedAt: NOW + 10 }, baseWorkspace),
  // 8. Note length overflow (> 500 chars)
  evaluateSuggestionRule('create', 'sug_1', { auth: null, requestTimeMs: NOW }, { ...baseSuggestion, note: 'a'.repeat(1000) }),
  // 9. Email PII in senderName
  evaluateSuggestionRule('create', 'sug_1', { auth: null, requestTimeMs: NOW }, { ...baseSuggestion, senderName: 'kid@school.edu' }),
  // 10. Suggestion update attempt
  evaluateSuggestionRule('update', 'sug_1', { auth: { uid: 'admin_1', email: ADMIN_EMAIL, email_verified: true }, requestTimeMs: NOW + 10 }, baseSuggestion, baseSuggestion),
  // 11. Forged client timestamp
  evaluateSuggestionRule('create', 'sug_1', { auth: null, requestTimeMs: NOW }, { ...baseSuggestion, createdAt: NOW - 5000 }),
  // 12. Unauthorized non-admin suggestion read/list
  evaluateSuggestionRule('list', 'sug_1', { auth: { uid: 'user_2', email: 'other@gmail.com', email_verified: true }, requestTimeMs: NOW }, undefined, baseSuggestion)
];

dirtyDozenResults.forEach((res, idx) => {
  if (res !== 'PERMISSION_DENIED') {
    throw new Error(`Dirty Dozen payload #${idx + 1} was not rejected!`);
  }
});

// Positive sanity assertions
if (evaluateSuggestionRule('create', 'sug_ok_1', { auth: null, requestTimeMs: NOW }, baseSuggestion) !== 'ALLOW') {
  throw new Error('Valid suggestion creation should be allowed');
}
if (
  evaluateSuggestionRule(
    'list',
    'sug_ok_1',
    { auth: { uid: 'jordan_uid', email: ADMIN_EMAIL, email_verified: true }, requestTimeMs: NOW },
    undefined,
    baseSuggestion
  ) !== 'ALLOW'
) {
  throw new Error('Verified admin list on suggestions should be allowed');
}
