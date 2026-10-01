import { db } from "../firebase.js";
import { shortDevice } from "./util.js";

/*
 * Audit log (/auditLogs). Tidak pernah melempar error agar tidak
 * menggagalkan request utama. Tidak menyimpan device identifier mentah.
 */
export async function audit(type, data = {}) {
  try {
    const entry = { type: String(type), at: Date.now() };
    for (const [name, value] of Object.entries(data)) {
      if (value === undefined || value === null) continue;
      if (name === "device") entry.device = shortDevice(value);
      else if (typeof value === "object") entry[name] = value;
      else entry[name] = String(value).slice(0, 200);
    }
    await db.ref("auditLogs").push(entry);
  } catch (error) {
    console.error("AUDIT ERROR", error);
  }
}
