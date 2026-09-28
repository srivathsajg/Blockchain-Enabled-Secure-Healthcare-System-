const express = require("express");
const soundUpload = require("../../middleware/soundUpload");
const {
  uploadNotificationSound,
  listNotificationSounds,
  updateNotificationSound,
  deleteNotificationSound,
} = require("./sound.controller");

const router = express.Router();

router.post(
  "/upload",
  soundUpload.single("soundFile"),
  uploadNotificationSound
);
router.get("/", listNotificationSounds);
router.patch("/:id", updateNotificationSound);
router.delete("/:id", deleteNotificationSound);

module.exports = router;
