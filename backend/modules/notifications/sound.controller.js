const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const NotificationSound = require("./models/notificationSound.model");
const User = require("../users/models/user.model");
const { logAction } = require("../audit/service");

const ALL_NOTIFICATION_EVENTS = [
  "appointment-updated",
  "appointment-approved",
  "new-pharmacy-order",
  "pharmacy-order-updated",
  "delivery-assigned",
  "delivery-status-updated",
  "inventory-updated",
  "blockchain-record-verified",
  "slot-booked",
  "new-appointment-received",
  "appointment-reassigned",
  "new-appointment-assigned",
  "new-lab-order-received",
  "lab-report-uploaded",
  "emergency-created",
  "emergency-status-updated",
  "emergency-updated",
  "ambulance-assigned",
  "doctor-status-updated",
  "doctor-emergency-delay",
  "doctor-emergency-resolved",
  "ward-delivery-update",
  "user-registered",
  "hospital-emergency-alert",
  "new-delivery-assigned",
];

const BUILTIN_FALLBACK = {
  url: null,
  mimeType: null,
  isDefault: true,
  useBuiltIn: true,
};

let eventMapCache = new Map();
const EVENT_MAP_CACHE_TTL = 60 * 1000;

const getScopeKey = (hospitalName) => `scope:${hospitalName || "__global"}`;

const clearEventMapCache = () => {
  eventMapCache = new Map();
};

const getSuperAdminIds = async () => {
  const superAdmins = await User.find(
    {
      role: "admin",
      $or: [
        { hospitalName: null },
        { hospitalName: "" },
        { hospitalName: { $exists: false } },
      ],
    },
    "_id"
  ).lean();
  return superAdmins.map((u) => u._id.toString());
};

const getAdminSoundScopeQuery = async (admin) => {
  const superAdminIds = await getSuperAdminIds();
  if (!admin.hospitalName) {
    return {};
  }
  const hospitalAdminIds = await User.find(
    { role: "admin", hospitalName: admin.hospitalName },
    "_id"
  ).lean().then((arr) => arr.map((u) => u._id.toString()));
  return {
    $or: [
      { createdBy: { $in: [...hospitalAdminIds, admin._id.toString()] } },
      { createdBy: { $in: superAdminIds } },
    ],
  };
};

const computeFileHash = async (filePath) => {
  const buffer = await fs.promises.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
};

const parseEventTypes = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((v) => v && String(v).trim());
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
};

const soundToResponse = (sound) => {
  const obj = sound.toObject ? sound.toObject() : { ...sound };
  const filename = path.basename(obj.filePath || "");
  obj.url = `/uploads/notifications/${filename}`;
  return obj;
};

const uploadNotificationSound = async (req, res, next) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Sound file is required" });
    }

    if (req.file.size === 0) {
      try {
        await fs.promises.unlink(req.file.path);
      } catch (_) {
        /* ignore */
      }
      return res
        .status(400)
        .json({ success: false, message: "Audio file cannot be empty" });
    }

    const name = (req.body.name || "").toString().trim();
    const description = (req.body.description || "").toString().trim();
    const eventTypes = parseEventTypes(req.body.eventTypes);

    if (!name) {
      try {
        await fs.promises.unlink(req.file.path);
      } catch (_) {
        /* ignore */
      }
      return res
        .status(400)
        .json({ success: false, message: "Sound name is required" });
    }

    if (eventTypes.length === 0) {
      try {
        await fs.promises.unlink(req.file.path);
      } catch (_) {
        /* ignore */
      }
      return res.status(400).json({
        success: false,
        message: "At least one notification event type must be selected",
      });
    }

    const existingName = await NotificationSound.findOne({
      name,
      createdBy: req.user.id,
    });
    if (existingName) {
      try {
        await fs.promises.unlink(req.file.path);
      } catch (_) {
        /* ignore */
      }
      return res.status(400).json({
        success: false,
        message: "You already have a sound with this name",
      });
    }

    const fileHash = await computeFileHash(req.file.path);

    const sound = await NotificationSound.create({
      name,
      description,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      fileHash,
      eventTypes,
      createdBy: req.user.id,
      isDefault: false,
    });

    clearEventMapCache();

    await logAction({
      userId: req.user.id,
      role: req.user.role,
      action: "ADMIN_NOTIFICATION_SOUND_UPLOADED",
      module: "NOTIFICATIONS",
      targetId: sound._id.toString(),
      ipAddress: req.ip,
      details: { name, eventTypes, mimeType: req.file.mimetype, size: req.file.size },
    });

    return res.status(201).json({
      success: true,
      data: soundToResponse(sound),
    });
  } catch (error) {
    if (req.file && req.file.path) {
      try {
        await fs.promises.unlink(req.file.path);
      } catch (_) {
        /* ignore */
      }
    }
    next(error);
  }
};

const listNotificationSounds = async (req, res, next) => {
  try {
    const admin = await User.findById(req.user.id)
      .select("hospitalName role")
      .lean();
    const query = await getAdminSoundScopeQuery(admin);
    const sounds = await NotificationSound.find(query)
      .populate("createdBy", "name hospitalName email")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({
      success: true,
      data: sounds.map((s) => soundToResponse(s)),
    });
  } catch (error) {
    next(error);
  }
};

const updateNotificationSound = async (req, res, next) => {
  try {
    const { id } = req.params;
    const admin = await User.findById(req.user.id).select("hospitalName role");
    const sound = await NotificationSound.findById(id);
    if (!sound) {
      return res
        .status(404)
        .json({ success: false, message: "Notification sound not found" });
    }

    const superAdminIds = await getSuperAdminIds();
    const isOwner = sound.createdBy.toString() === req.user.id.toString();
    const isSuperAdmin =
      !admin.hospitalName && superAdminIds.includes(req.user.id.toString());

    if (!isOwner && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: "You can only edit sounds created by you or global admins",
      });
    }

    const { name, description, eventTypes, isDefault } = req.body;

    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName) {
        return res
          .status(400)
          .json({ success: false, message: "Sound name cannot be empty" });
      }
      const duplicate = await NotificationSound.findOne({
        name: trimmedName,
        createdBy: sound.createdBy,
        _id: { $ne: sound._id },
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: "A sound with this name already exists for this creator",
        });
      }
      sound.name = trimmedName;
    }

    if (description !== undefined) {
      sound.description = String(description).trim();
    }

    if (eventTypes !== undefined) {
      const parsed = parseEventTypes(eventTypes);
      sound.eventTypes = parsed;
    }

    if (isDefault !== undefined) {
      if (isDefault) {
        const defaultScope = isSuperAdmin
          ? {
              createdBy: { $in: superAdminIds },
            }
          : {
              createdBy: sound.createdBy,
            };
        await NotificationSound.updateMany(
          { ...defaultScope, _id: { $ne: sound._id }, isDefault: true },
          { $set: { isDefault: false } }
        );
        sound.isDefault = true;
      } else {
        sound.isDefault = false;
      }
    }

    sound.updatedAt = new Date();
    await sound.save();
    clearEventMapCache();

    await logAction({
      userId: req.user.id,
      role: req.user.role,
      action: "ADMIN_NOTIFICATION_SOUND_UPDATED",
      module: "NOTIFICATIONS",
      targetId: sound._id.toString(),
      ipAddress: req.ip,
      details: {
        name: sound.name,
        eventTypes: sound.eventTypes,
        isDefault: sound.isDefault,
      },
    });

    return res.json({
      success: true,
      data: soundToResponse(sound),
    });
  } catch (error) {
    next(error);
  }
};

const deleteNotificationSound = async (req, res, next) => {
  try {
    const { id } = req.params;
    const admin = await User.findById(req.user.id).select("hospitalName role");
    const sound = await NotificationSound.findById(id);
    if (!sound) {
      return res
        .status(404)
        .json({ success: false, message: "Notification sound not found" });
    }

    const superAdminIds = await getSuperAdminIds();
    const isOwner = sound.createdBy.toString() === req.user.id.toString();
    const isSuperAdmin =
      !admin.hospitalName && superAdminIds.includes(req.user.id.toString());

    if (!isOwner && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: "You can only delete sounds created by you or global admins",
      });
    }

    const filePath = sound.filePath;
    await NotificationSound.findByIdAndDelete(id);
    clearEventMapCache();

    if (filePath) {
      try {
        await fs.promises.unlink(filePath);
      } catch (err) {
        console.warn(
          "Could not delete sound file from disk:",
          filePath,
          err.message
        );
      }
    }

    await logAction({
      userId: req.user.id,
      role: req.user.role,
      action: "ADMIN_NOTIFICATION_SOUND_DELETED",
      module: "NOTIFICATIONS",
      targetId: id,
      ipAddress: req.ip,
      details: { name: sound.name, eventTypes: sound.eventTypes },
    });

    return res.json({
      success: true,
      message: "Notification sound deleted successfully",
      data: { _id: id },
    });
  } catch (error) {
    next(error);
  }
};

const resolveScopedDefaultSound = async (sounds, hospitalName) => {
  const superAdminIds = await getSuperAdminIds();
  if (hospitalName) {
    const hospitalAdminIds = await User.find(
      { role: "admin", hospitalName },
      "_id"
    ).lean().then((arr) => arr.map((u) => u._id.toString()));
    const scopedDefault = sounds.find(
      (s) => s.isDefault && hospitalAdminIds.includes(s.createdBy.toString())
    );
    if (scopedDefault) return scopedDefault;
  }
  const globalDefault = sounds.find(
    (s) => s.isDefault && superAdminIds.includes(s.createdBy.toString())
  );
  return globalDefault || null;
};

const buildEventMapForUser = async (user) => {
  const hospitalName = user?.hospitalName || "";
  const scopeKey = getScopeKey(hospitalName);
  const cached = eventMapCache.get(scopeKey);
  const now = Date.now();
  if (cached && now - cached.ts < EVENT_MAP_CACHE_TTL) {
    return cached.map;
  }

  const superAdminIds = await getSuperAdminIds();
  const hospitalAdminIds = hospitalName
    ? await User.find({ role: "admin", hospitalName }, "_id")
        .lean()
        .then((arr) => arr.map((u) => u._id.toString()))
    : [];
  const adminIds = [...new Set([...superAdminIds, ...hospitalAdminIds])];

  const sounds = await NotificationSound.find({
    createdBy: { $in: adminIds },
  }).lean();

  const eventMap = {};
  for (const eventType of ALL_NOTIFICATION_EVENTS) {
    let matched = null;
    if (hospitalName) {
      matched = sounds.find(
        (s) =>
          s.eventTypes.includes(eventType) &&
          hospitalAdminIds.includes(s.createdBy.toString())
      );
    }
    if (!matched) {
      matched = sounds.find(
        (s) =>
          s.eventTypes.includes(eventType) &&
          superAdminIds.includes(s.createdBy.toString())
      );
    }
    if (matched) {
      const filename = path.basename(matched.filePath || "");
      eventMap[eventType] = {
        url: `/uploads/notifications/${filename}`,
        mimeType: matched.mimeType,
        isDefault: false,
        useBuiltIn: false,
      };
    } else {
      const defaultSound = await resolveScopedDefaultSound(
        sounds,
        hospitalName
      );
      if (defaultSound) {
        const filename = path.basename(defaultSound.filePath || "");
        eventMap[eventType] = {
          url: `/uploads/notifications/${filename}`,
          mimeType: defaultSound.mimeType,
          isDefault: true,
          useBuiltIn: false,
        };
      } else {
        eventMap[eventType] = { ...BUILTIN_FALLBACK };
      }
    }
  }

  eventMapCache.set(scopeKey, { ts: now, map: eventMap });
  return eventMap;
};

const getSoundEventMap = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .select("hospitalName role")
      .lean();
    const map = await buildEventMapForUser(user);
    return res.json({
      success: true,
      data: map,
      events: ALL_NOTIFICATION_EVENTS,
    });
  } catch (error) {
    next(error);
  }
};

const resolveSoundForEvent = async (req, res, next) => {
  try {
    const { eventType } = req.params;
    const user = await User.findById(req.user.id)
      .select("hospitalName role")
      .lean();
    const map = await buildEventMapForUser(user);
    const entry = map[eventType] || { ...BUILTIN_FALLBACK };
    return res.json({
      success: true,
      data: entry,
      eventType,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadNotificationSound,
  listNotificationSounds,
  updateNotificationSound,
  deleteNotificationSound,
  getSoundEventMap,
  resolveSoundForEvent,
  ALL_NOTIFICATION_EVENTS,
};
