# Firestore Security Specification — JordS1.1

## 1. Master Source of Truth & Data Invariants

### Collection A: `/userWorkspaces/{userId}`
- **PII Isolation**: No PII (`email`, `phone`, `address`, `displayName`) is stored in `/userWorkspaces/{userId}`.
- **Invariants**:
  1. Every `/userWorkspaces/{userId}` document belongs exclusively to the authenticated user whose `request.auth.uid == userId` and `data.ownerId == request.auth.uid`.
  2. Write access requires `request.auth != null` and `request.auth.token.email_verified == true`.
  3. Path variable `userId` must match `^[a-zA-Z0-9_\-]+$` with length `1..128`.
  4. Document keys must strictly equal `['ownerId', 'favoriteIds', 'customColumns', 'createdAt', 'updatedAt']` (no shadow/ghost fields).
  5. `favoriteIds` is a list of at most 200 game ID strings (`1..120` chars, `^[a-zA-Z0-9_\-]+$`).
  6. `customColumns` is a list of at most 30 column names (`1..32` chars, `^[a-zA-Z0-9 _\-]+$`).
  7. `ownerId` and `createdAt` are immutable after creation; `createdAt` (on create) and `updatedAt` (on create & update) must equal `request.time`.
  8. Collection `list` queries are strictly denied (`allow list: if false;`).

### Collection B: `/suggestions/{suggestionId}`
- **Purpose**: Write-only public suggestion drop-box sending player notes from JordS1.1 embeds/servers directly to Jordan's AI Studio inbox (`jojojohnson0425@gmail.com`).
- **PII Isolation**: `senderName` is a short alphanumeric nickname (`1..40` chars, `^[a-zA-Z0-9 _\-.]+$`, blocking `@` emails). Only verified admin (`jojojohnson0425@gmail.com` with `email_verified == true` or `/admins/{uid}`) can `get`, `list`, or `delete`.
- **Invariants**:
  1. Path variable `suggestionId` must match `^[a-zA-Z0-9_\-]+$` with length `1..128`.
  2. Document keys must strictly equal `['senderName', 'note', 'serverSource', 'targetId', 'createdAt']`.
  3. `note` is a string bounded to `2..500` characters; `serverSource` must be one of `['AI Studio', 'Version 1', 'Version 2', 'Version 3', 'Version 4', 'Server 1', 'Server 2', 'Server 3', 'Server 4', 'Google Sites']`; `targetId` must equal `'jords-ai-studio'`.
  4. `createdAt` must equal `request.time`.
  5. Updates are completely forbidden (`allow update: if false;`).
  6. `get`, `list`, and `delete` require `isAdmin()`, and `list` enforces `resource.data.targetId == 'jords-ai-studio'`.

### Collection C: `/admins/{adminId}`
- **Invariants**: System-managed collection; all client reads and writes are denied (`allow read, write: if false;`).

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Unauthenticated Workspace Write**: `auth = null`, creating `/userWorkspaces/user_1` -> `PERMISSION_DENIED`.
2. **Unverified Admin Email Spoof**: `auth = { uid: 'spoof_1', email: 'jojojohnson0425@gmail.com', email_verified: false }`, reading/listing `/suggestions` -> `PERMISSION_DENIED`.
3. **Cross-User Identity Spoof (Path Mismatch)**: `auth = { uid: 'attacker_1', email_verified: true }`, writing `/userWorkspaces/victim_1` with `ownerId: 'attacker_1'` -> `PERMISSION_DENIED`.
4. **Owner Field Spoof**: `auth = { uid: 'user_1', email_verified: true }`, creating `/userWorkspaces/user_1` with `ownerId: 'victim_1'` -> `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection on Suggestion**: Creating `/suggestions/sug_1` with extra key `{ isVerified: true }` -> `PERMISSION_DENIED`.
6. **ID Poisoning (2KB Junk Path ID)**: Creating `/suggestions/<200-char-id>` -> `PERMISSION_DENIED`.
7. **Unbounded Array Resource Exhaustion**: Updating `favoriteIds` with 250 items (`> 200`) -> `PERMISSION_DENIED`.
8. **Value Type / Length Overflow on Suggestion Note**: Creating `/suggestions/sug_1` with a 1000-char `note` (`> 500`) -> `PERMISSION_DENIED`.
9. **PII / Email Injection in Suggestion `senderName`**: Creating `/suggestions/sug_1` with `senderName: 'kid@school.edu'` -> `PERMISSION_DENIED`.
10. **Suggestion Mutation Attempt (`update`)**: Attempting to update an existing `/suggestions/sug_1` document -> `PERMISSION_DENIED`.
11. **Forged Client Timestamp**: Creating `/suggestions/sug_1` with `createdAt != request.time` -> `PERMISSION_DENIED`.
12. **Unauthorized Suggestion Scraping (`list` / `get` by Non-Admin)**: Signed-in verified non-admin `other@gmail.com` listing or getting `/suggestions` -> `PERMISSION_DENIED`.
