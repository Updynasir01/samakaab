import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./models/User.js";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/samakaab";

async function run() {
  await mongoose.connect(uri);
  const count = await User.countDocuments();
  if (count > 0) {
    console.log("Users already exist. Skip seed.");
    await mongoose.disconnect();
    return;
  }
  const passwordHash = await bcrypt.hash("admin123", 10);
  await User.create({
    username: "admin",
    passwordHash,
    role: "admin",
  });
  console.log("Created admin / admin123");
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
