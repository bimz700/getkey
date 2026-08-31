import { Redis } from "@upstash/redis";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const redis = Redis.fromEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function handler(req, res) {

    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
    );
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, X-Device-Identifier"
    );

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "GET" && req.method !== "POST") {
        return res.status(405).json({
            success: false,
            message: "METHOD NOT ALLOWED"
        });
    }

    try {

        // ==========================================
        // DEVICE IDENTIFIER
        // ==========================================

        const deviceHeader =
            req.headers["x-device-identifier"];

        const forwarded =
            req.headers["x-forwarded-for"];

        const realIp =
            forwarded
                ? forwarded.split(",")[0].trim()
                : req.headers["x-real-ip"] ||
                  req.socket?.remoteAddress ||
                  "unknown-ip";

        const identifier =
            deviceHeader && deviceHeader.trim()
                ? deviceHeader.trim()
                : realIp;

        const claimKey =
            `claim:${identifier}`;


        // ==========================================
        // CHECK STATUS
        // ==========================================

        if (
            req.query &&
            req.query.action === "check"
        ) {

            const ttl =
                await redis.ttl(claimKey);

            if (ttl > 0) {

                const savedKey =
                    await redis.get(claimKey);

                return res.status(200).json({
                    success: false,
                    cooldown: true,
                    remaining: ttl,
                    key: savedKey || null
                });
            }

            return res.status(200).json({
                success: true,
                cooldown: false,
                remaining: 0
            });
        }


        // ==========================================
        // CEK COOLDOWN
        // ==========================================

        const currentTtl =
            await redis.ttl(claimKey);

        if (currentTtl > 0) {

            const savedKey =
                await redis.get(claimKey);

            return res.status(200).json({
                success: false,
                cooldown: true,
                remaining: currentTtl,
                key: savedKey || null
            });
        }


        // ==========================================
        // LOAD KEYS.JSON
        // ==========================================

        const keysPath =
            path.join(
                process.cwd(),
                "keys.json"
            );

        if (!fs.existsSync(keysPath)) {

            console.error(
                "keys.json tidak ditemukan:",
                keysPath
            );

            return res.status(500).json({
                success: false,
                message: "KEY DATABASE NOT FOUND"
            });
        }

        const rawKeys =
            fs.readFileSync(
                keysPath,
                "utf8"
            );

        let availableKeys;

        try {

            availableKeys =
                JSON.parse(rawKeys);

        } catch (jsonError) {

            console.error(
                "keys.json invalid:",
                jsonError
            );

            return res.status(500).json({
                success: false,
                message: "INVALID KEY DATABASE"
            });
        }


        // ==========================================
        // VALIDASI KEYS
        // ==========================================

        if (
            !Array.isArray(availableKeys) ||
            availableKeys.length === 0
        ) {

            return res.status(200).json({
                success: false,
                message: "ALL KEYS ARE USED"
            });
        }


        // ==========================================
        // CARI KEY YANG BELUM TERPAKAI
        // ==========================================

        let selectedKey = null;

        for (
            const candidateKey
            of availableKeys
        ) {

            if (
                typeof candidateKey !== "string" ||
                !candidateKey.trim()
            ) {
                continue;
            }

            const isNewKey =
                await redis.sadd(
                    "used_keys_set",
                    candidateKey
                );

            if (isNewKey === 1) {

                selectedKey =
                    candidateKey;

                break;
            }
        }


        // ==========================================
        // SEMUA KEY SUDAH TERPAKAI
        // ==========================================

        if (!selectedKey) {

            return res.status(200).json({
                success: false,
                message: "ALL KEYS ARE USED"
            });
        }


        // ==========================================
        // CLAIM 24 JAM
        // ==========================================

        const acquired =
            await redis.set(
                claimKey,
                selectedKey,
                {
                    nx: true,
                    ex: 86400
                }
            );


        // ==========================================
        // CLAIM GAGAL / RACE CONDITION
        // ==========================================

        if (!acquired) {

            await redis.srem(
                "used_keys_set",
                selectedKey
            );

            const remainingTtl =
                await redis.ttl(claimKey);

            return res.status(200).json({
                success: false,
                cooldown: true,
                remaining:
                    remainingTtl > 0
                        ? remainingTtl
                        : 86400
            });
        }


        // ==========================================
        // SUCCESS
        // ==========================================

        return res.status(200).json({

            success: true,

            key: selectedKey,

            remaining: 86400

        });

    } catch (error) {

        console.error(
            "GETKEY FUNCTION ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "SERVER ERROR"
        });
    }
}
