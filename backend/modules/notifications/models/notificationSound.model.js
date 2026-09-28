const mongoose = require("mongoose");

const notificationSoundSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    filePath: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
      enum: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg"],
    },
    fileSize: {
      type: Number,
      required: true,
    },
    fileHash: {
      type: String,
      required: true,
      trim: true,
    },
    eventTypes: [
      {
        type: String,
        trim: true,
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

notificationSoundSchema.index({ eventTypes: 1 });
notificationSoundSchema.index({ createdBy: 1 });
notificationSoundSchema.index({ isDefault: 1 });

const NotificationSound = mongoose.model(
  "NotificationSound",
  notificationSoundSchema
);

module.exports = NotificationSound;
