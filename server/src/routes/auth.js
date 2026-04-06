import { Router } from "express";
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

router.get("/me", authRequired, async (req, res) => {
  const user = await User.findById(req.user.sub).select("username role");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ id: user._id, username: user.username, role: user.role });
});

export default router;
