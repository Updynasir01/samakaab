import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { body, validationResult } from "express-validator";
import User from "../models/User.js";
import { authRequired, adminOnly, signToken } from "../middleware/auth.js";

const router = Router();

router.post(
  "/login",
  body("username").trim().notEmpty(),
  body("password").notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Invalid input", errors: errors.array() });
    }
    const { username, password } = req.body;
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "Invalid username or password" });
    }
    const token = signToken({
      sub: user._id.toString(),
      username: user.username,
      role: user.role,
    });
    res.json({
      token,
      user: { id: user._id, username: user.username, role: user.role },
    });
  }
);

router.get("/users", authRequired, adminOnly, async (_req, res) => {
  const users = await User.find().select("username role createdAt updatedAt").sort({ username: 1 }).lean();
  res.json(
    users.map((u) => ({
      id: u._id,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt,
    }))
  );
});

router.post(
  "/register",
  authRequired,
  adminOnly,
  body("username").trim().isLength({ min: 3 }),
  body("password").isLength({ min: 6 }),
  body("role").optional().isIn(["admin", "staff"]),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Invalid input", errors: errors.array() });
    }
    const { username, password, role = "staff" } = req.body;
    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists) {
      return res.status(409).json({ message: "Username already taken" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: username.toLowerCase(),
      passwordHash,
      role,
    });
    res.status(201).json({
      id: user._id,
      username: user.username,
      role: user.role,
    });
  }
);

router.delete("/users/:id", authRequired, adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  const targetId = String(req.params.id);
  if (targetId === String(req.user.sub)) {
    return res.status(400).json({ message: "You cannot delete your own account while logged in" });
  }
  const target = await User.findById(targetId);
  if (!target) return res.status(404).json({ message: "User not found" });

  if (target.role === "admin") {
    const adminCount = await User.countDocuments({ role: "admin" });
    if (adminCount <= 1) {
      return res.status(400).json({ message: "Cannot delete the last admin account" });
    }
  }

  await User.findByIdAndDelete(targetId);
  res.status(204).send();
});

router.get("/me", authRequired, async (req, res) => {
  const user = await User.findById(req.user.sub).select("username role");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ id: user._id, username: user.username, role: user.role });
});

/** Logged-in user changes their own password. */
router.patch(
  "/password",
  authRequired,
  body("currentPassword").notEmpty(),
  body("newPassword").isLength({ min: 6 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Invalid input", errors: errors.array() });
    }
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { currentPassword, newPassword } = req.body;
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return res.status(400).json({ message: "New password must be different from the current password" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Password updated" });
  }
);

/** Admin sets a new password for another user. */
router.patch(
  "/users/:id/password",
  authRequired,
  adminOnly,
  body("newPassword").isLength({ min: 6 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Invalid input", errors: errors.array() });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.passwordHash = await bcrypt.hash(req.body.newPassword, 10);
    await user.save();
    res.json({ message: "Password reset", username: user.username });
  }
);

export default router;
