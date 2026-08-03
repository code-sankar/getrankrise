// backend/src/controllers/notification.controller.js
//
// Notifications are scoped by USER, not by clinic — they hang off users.id
// (see models/Notification.js), which is why the router mounts `protect`
// without `loadClinic`.
//
// Every query below filters on req.user.id. That filter is the whole
// authorisation story for this resource: ids are UUIDs, but hard-to-guess is
// not an access control model. A missing row and another user's row must be
// indistinguishable from outside, which is why the mutations return 404
// rather than 403 when nothing matched.
//
// The list endpoint returns a BARE ARRAY in `data` — notifications.hook.js
// hands it straight to setNotifications(), whose reducer maps over it.

import { Notification } from "../models/index.js";
import { successResponse, notFoundResponse } from "../utils/apiResponse.js";

// Hard ceiling on a single page. The bell renders a dropdown, not an archive;
// anything past this is noise nobody scrolls to.
const MAX_LIMIT = 100;

// ── GET /api/v1/notifications ────────────────────────────────────────────────
export const listNotifications = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, MAX_LIMIT);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  // Unread first, then newest — the bell's visual order, so the client never
  // has to re-sort.
  const rows = await Notification.findAll({
    where: { userId: req.user.id },
    order: [
      ["read", "ASC"],
      ["createdAt", "DESC"],
    ],
    limit,
    offset,
  });

  return successResponse(res, { message: "Notifications fetched", data: rows });
};

// ── PATCH /api/v1/notifications/read-all ─────────────────────────────────────
// Registered BEFORE /:id/read in the router so "read-all" is never captured as
// an :id. Idempotent: re-marking an already-read set returns 200 with updated: 0.
export const markAllRead = async (req, res) => {
  const [updated] = await Notification.update(
    { read: true },
    { where: { userId: req.user.id, read: false } }
  );

  return successResponse(res, {
    message: "All notifications marked read",
    data: { updated },
  });
};

// ── PATCH /api/v1/notifications/:id/read ─────────────────────────────────────
export const markRead = async (req, res) => {
  const { id } = req.params;

  const [updated] = await Notification.update(
    { read: true },
    { where: { id, userId: req.user.id } }
  );

  if (!updated) return notFoundResponse(res, "Notification not found");

  return successResponse(res, {
    message: "Notification marked read",
    data: { id, read: true },
  });
};

// ── DELETE /api/v1/notifications/:id ─────────────────────────────────────────
// Dismiss is a hard delete. There is no soft-delete column on the model and no
// product surface that reads dismissed alerts back, so a tombstone would be
// storage with no reader.
export const dismissNotification = async (req, res) => {
  const { id } = req.params;

  const deleted = await Notification.destroy({
    where: { id, userId: req.user.id },
  });

  if (!deleted) return notFoundResponse(res, "Notification not found");

  return successResponse(res, {
    message: "Notification dismissed",
    data: { id },
  });
};
