const mongoose = require('mongoose');
const User = require('./backend/modules/users/models/user.model');

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/medicare');
  const user = await User.findOne({ name: { $regex: /yashwanth/i } });
  if (user) {
    console.log("Yashwanth found!");
    console.log("profileImage:", user.profileImage);
  } else {
    console.log("Yashwanth NOT found.");
  }
  process.exit(0);
}

check();
