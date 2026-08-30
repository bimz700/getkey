:root {
  --bg-color: #080a0f;
  --card-bg: rgba(15, 20, 31, 0.85);
  --border-color: rgba(255, 42, 95, 0.25);
  --neon-red: #ff2a5f;
  --neon-red-glow: rgba(255, 42, 95, 0.4);
  --text-main: #f1f5f9;
  --text-muted: #94a3b8;
  --font-heading: 'Orbitron', sans-serif;
  --font-body: 'Rajdhani', sans-serif;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background-color: var(--bg-color);
  color: var(--text-main);
  font-family: var(--font-body);
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  overflow-x: hidden;
  padding: 16px;
}

.glow-bg {
  position: absolute;
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, var(--neon-red-glow) 0%, rgba(0,0,0,0) 70%);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 0;
  pointer-events: none;
  opacity: 0.6;
}

.container {
  width: 100%;
  max-width: 420px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.header {
  text-align: center;
}

.brand-title {
  font-family: var(--font-heading);
  font-size: 2.5rem;
  font-weight: 900;
  letter-spacing: 3px;
  color: var(--text-main);
  text-shadow: 0 0 12px var(--neon-red-glow);
}

.brand-subtitle {
  font-family: var(--font-heading);
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--neon-red);
  letter-spacing: 4px;
  margin-top: 4px;
}

.card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 28px 20px;
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  gap: 20px;
  transition: border-color 0.3s ease;
}

.key-box {
  background: rgba(8, 10, 15, 0.9);
  border: 1px dashed rgba(255, 42, 95, 0.4);
  border-radius: 12px;
  padding: 18px 12px;
  text-align: center;
}

.key-text {
  font-family: var(--font-heading);
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: 2px;
  color: #ffffff;
  word-break: break-all;
}

.status-box {
  text-align: center;
  min-height: 48px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 6px;
}

#statusMessage {
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--text-muted);
}

.status-success {
  color: #10b981 !important;
}

.status-warning {
  color: #f59e0b !important;
}

.status-cooldown {
  color: var(--neon-red) !important;
}

.countdown {
  font-family: var(--font-heading);
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--neon-red);
  letter-spacing: 2px;
}

.hidden {
  display: none !important;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.btn {
  width: 100%;
  padding: 14px;
  border-radius: 10px;
  font-family: var(--font-heading);
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 1.5px;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
  display: flex;
  justify-content: center;
  align-items: center;
}

.btn-primary {
  background: var(--neon-red);
  color: #ffffff;
  box-shadow: 0 4px 15px var(--neon-red-glow);
}

.btn-primary:hover:not(:disabled) {
  background: #ff003c;
  transform: translateY(-1px);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-main);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.3);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #ffffff;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.footer {
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-muted);
}