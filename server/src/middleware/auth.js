import jwt from "jsonwebtoken";
import User from "../models/User.js";

const DEFAULT_SECRET = "dev-secret-change-me";
const isProd = process.env.NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET || (isProd ? "" : DEFAULT_SECRET);

if (isProd && (!JWT_SECRET || JWT_SECRET === DEFAULT_SECRET || JWT_SECRET.length < 32)) {
  console.error("FATAL: Set JWT_SECRET to a random string of at least 32 characters in production.");
  process.exit(1);
}

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d", algorithm: "HS256" });
}

export async function authRequired(req, res, next) {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    const user = await User.findById(decoded.sub).select("username role").lean();
    if (!user) {
      return res.status(401).json({ message: "User no longer exists" });
    }
    req.user = {
      sub: String(user._id),
      username: user.username,
      role: user.role,
    };
    next();
  } catch (err) {
    if (err?.name === "JsonWebTokenError" || err?.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    next(err);
  }
}

export function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

export function actorUsername(req) {
  const u = req.user?.username;
  return u ? String(u).trim() : "";
}
