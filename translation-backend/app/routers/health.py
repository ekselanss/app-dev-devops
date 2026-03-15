import subprocess
import time
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

router = APIRouter()

try:
    import torch
    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False

_start_time = time.time()


class HealthResponse(BaseModel):
    status: str
    whisper_loaded: bool
    whisper_model_free: str
    whisper_model_pro: str
    device: str
    gpu_available: bool
    active_sessions: int
    free_sessions: int
    pro_sessions: int
    tier_endpoints: dict


def _get_gpu_info() -> dict:
    """nvidia-smi ile GPU bilgisi al."""
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw",
             "--format=csv,noheader,nounits"],
            text=True, timeout=5
        ).strip()
        parts = [x.strip() for x in out.split(",")]
        return {
            "gpu_util": int(parts[0]),
            "memory_used_mb": int(parts[1]),
            "memory_total_mb": int(parts[2]),
            "temperature_c": int(parts[3]),
            "power_w": float(parts[4]),
        }
    except Exception:
        return {"gpu_util": 0, "memory_used_mb": 0, "memory_total_mb": 0, "temperature_c": 0, "power_w": 0}


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request):
    """Sunucu durumunu kontrol et"""
    whisper = getattr(request.app.state, "whisper", None)
    whisper_pro = getattr(request.app.state, "whisper_pro", None)
    from app.routers.websocket import session_manager

    return HealthResponse(
        status="ok",
        whisper_loaded=whisper is not None and whisper.model is not None,
        whisper_model_free=getattr(whisper, "model_name", "unknown") if whisper else "unknown",
        whisper_model_pro=getattr(whisper_pro, "model_name", "unknown") if whisper_pro else "unknown",
        device=getattr(whisper, "device", "cpu") if whisper else "unknown",
        gpu_available=_TORCH_AVAILABLE and torch.cuda.is_available(),
        active_sessions=len(session_manager.active_sessions),
        free_sessions=session_manager.count_by_tier("free"),
        pro_sessions=session_manager.count_by_tier("pro"),
        tier_endpoints={
            "free": "/ws/translate/{session_id} veya /ws/fast/{session_id} (max 50)",
            "pro": "/ws/pro/{session_id} (max 15)",
        },
    )


@router.get("/stats")
async def stats(request: Request):
    """Admin monitoring endpoint — JSON."""
    whisper = getattr(request.app.state, "whisper", None)
    whisper_pro = getattr(request.app.state, "whisper_pro", None)
    from app.routers.websocket import session_manager, MAX_FREE_SESSIONS, MAX_PRO_SESSIONS

    gpu = _get_gpu_info()
    uptime = int(time.time() - _start_time)
    hours, remainder = divmod(uptime, 3600)
    minutes, seconds = divmod(remainder, 60)

    free_count = session_manager.count_by_tier("free")
    pro_count = session_manager.count_by_tier("pro")

    return {
        "uptime": f"{hours}h {minutes}m {seconds}s",
        "uptime_seconds": uptime,
        "gpu": gpu,
        "sessions": {
            "free": {"active": free_count, "max": MAX_FREE_SESSIONS},
            "pro": {"active": pro_count, "max": MAX_PRO_SESSIONS},
            "total": free_count + pro_count,
        },
        "models": {
            "free": getattr(whisper, "model_name", "?") if whisper else "?",
            "pro": getattr(whisper_pro, "model_name", "?") if whisper_pro else "?",
        },
        "device": getattr(whisper, "device", "cpu") if whisper else "?",
    }


@router.get("/admin", response_class=HTMLResponse)
async def admin_panel(request: Request):
    """Admin monitoring dashboard — auto-refresh her 3 saniye."""
    from app.routers.websocket import MAX_FREE_SESSIONS, MAX_PRO_SESSIONS
    return f"""<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VideoCheviri Admin</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ background: #0a0a0a; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; }}
  .header {{ text-align: center; margin-bottom: 30px; }}
  .header h1 {{ font-size: 24px; color: #4CAF50; }}
  .header .uptime {{ color: #888; font-size: 14px; margin-top: 4px; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; max-width: 1200px; margin: 0 auto; }}
  .card {{ background: #1a1a2e; border-radius: 16px; padding: 24px; border: 1px solid #333; }}
  .card h2 {{ font-size: 16px; color: #888; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1px; }}
  .metric {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }}
  .metric-label {{ color: #aaa; font-size: 14px; }}
  .metric-value {{ font-size: 24px; font-weight: 700; }}
  .green {{ color: #4CAF50; }}
  .yellow {{ color: #FF9800; }}
  .red {{ color: #F44336; }}
  .gold {{ color: #FFD700; }}
  .bar-container {{ background: #0a0a0a; border-radius: 8px; height: 24px; overflow: hidden; margin-top: 6px; margin-bottom: 12px; }}
  .bar {{ height: 100%; border-radius: 8px; transition: width 0.5s ease; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; }}
  .bar-green {{ background: linear-gradient(90deg, #2e7d32, #4CAF50); }}
  .bar-yellow {{ background: linear-gradient(90deg, #e65100, #FF9800); }}
  .bar-red {{ background: linear-gradient(90deg, #c62828, #F44336); }}
  .bar-gold {{ background: linear-gradient(90deg, #b8860b, #FFD700); color: #000; }}
  .status-dot {{ display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; animation: pulse 2s infinite; }}
  .status-dot.online {{ background: #4CAF50; }}
  @keyframes pulse {{ 0%, 100% {{ opacity: 1; }} 50% {{ opacity: 0.5; }} }}
  .model-badge {{ background: #0a0a0a; border-radius: 8px; padding: 8px 12px; display: inline-block; margin: 4px; border: 1px solid #333; }}
  .model-badge.pro {{ border-color: #FFD700; }}
  .footer {{ text-align: center; color: #555; font-size: 12px; margin-top: 30px; }}
</style>
</head>
<body>
<div class="header">
  <h1>VideoCheviri Admin Panel</h1>
  <div class="uptime"><span class="status-dot online"></span>Sunucu Aktif | Uptime: <span id="uptime">-</span></div>
</div>

<div class="grid">
  <!-- GPU Card -->
  <div class="card">
    <h2>GPU Durumu</h2>
    <div class="metric">
      <span class="metric-label">GPU Kullanimi</span>
      <span class="metric-value" id="gpu-util">-%</span>
    </div>
    <div class="bar-container"><div class="bar bar-green" id="gpu-bar" style="width:0%"></div></div>
    <div class="metric">
      <span class="metric-label">VRAM</span>
      <span class="metric-value" id="gpu-mem">- MB</span>
    </div>
    <div class="bar-container"><div class="bar bar-yellow" id="mem-bar" style="width:0%"></div></div>
    <div class="metric">
      <span class="metric-label">Sicaklik</span>
      <span class="metric-value" id="gpu-temp">-C</span>
    </div>
    <div class="metric">
      <span class="metric-label">Guc</span>
      <span class="metric-value" id="gpu-power">-W</span>
    </div>
  </div>

  <!-- Sessions Card -->
  <div class="card">
    <h2>Aktif Oturumlar</h2>
    <div class="metric">
      <span class="metric-label">Free Kullanicilar</span>
      <span class="metric-value green" id="free-count">0</span>
    </div>
    <div class="bar-container"><div class="bar bar-green" id="free-bar" style="width:0%">0 / {MAX_FREE_SESSIONS}</div></div>
    <div class="metric">
      <span class="metric-label">Pro Kullanicilar</span>
      <span class="metric-value gold" id="pro-count">0</span>
    </div>
    <div class="bar-container"><div class="bar bar-gold" id="pro-bar" style="width:0%">0 / {MAX_PRO_SESSIONS}</div></div>
    <div class="metric">
      <span class="metric-label">Toplam</span>
      <span class="metric-value" id="total-count">0</span>
    </div>
  </div>

  <!-- Models Card -->
  <div class="card">
    <h2>Whisper Modelleri</h2>
    <div style="margin-bottom:12px">
      <span class="metric-label">Free Model</span><br>
      <span class="model-badge" id="free-model">-</span>
    </div>
    <div style="margin-bottom:12px">
      <span class="metric-label">Pro Model</span><br>
      <span class="model-badge pro" id="pro-model">-</span>
    </div>
    <div class="metric">
      <span class="metric-label">Device</span>
      <span class="metric-value green" id="device">-</span>
    </div>
  </div>
</div>

<div class="footer">Auto-refresh: 3 saniye | VideoCheviri v1.1.0</div>

<script>
async function update() {{
  try {{
    const res = await fetch('/api/stats');
    const d = await res.json();

    // Uptime
    document.getElementById('uptime').textContent = d.uptime;

    // GPU
    const gu = d.gpu.gpu_util;
    document.getElementById('gpu-util').textContent = gu + '%';
    document.getElementById('gpu-util').className = 'metric-value ' + (gu > 80 ? 'red' : gu > 50 ? 'yellow' : 'green');
    const guBar = document.getElementById('gpu-bar');
    guBar.style.width = gu + '%';
    guBar.className = 'bar ' + (gu > 80 ? 'bar-red' : gu > 50 ? 'bar-yellow' : 'bar-green');
    guBar.textContent = gu + '%';

    const memPct = Math.round(d.gpu.memory_used_mb / d.gpu.memory_total_mb * 100);
    document.getElementById('gpu-mem').textContent = d.gpu.memory_used_mb + ' / ' + d.gpu.memory_total_mb + ' MB';
    const memBar = document.getElementById('mem-bar');
    memBar.style.width = memPct + '%';
    memBar.textContent = memPct + '%';

    document.getElementById('gpu-temp').textContent = d.gpu.temperature_c + 'C';
    document.getElementById('gpu-temp').className = 'metric-value ' + (d.gpu.temperature_c > 75 ? 'red' : d.gpu.temperature_c > 60 ? 'yellow' : 'green');
    document.getElementById('gpu-power').textContent = d.gpu.power_w.toFixed(0) + 'W';

    // Sessions
    const fc = d.sessions.free.active;
    const fm = d.sessions.free.max;
    const pc = d.sessions.pro.active;
    const pm = d.sessions.pro.max;

    document.getElementById('free-count').textContent = fc;
    const freeBar = document.getElementById('free-bar');
    freeBar.style.width = (fc/fm*100) + '%';
    freeBar.textContent = fc + ' / ' + fm;

    document.getElementById('pro-count').textContent = pc;
    const proBar = document.getElementById('pro-bar');
    proBar.style.width = (pc/pm*100) + '%';
    proBar.textContent = pc + ' / ' + pm;

    document.getElementById('total-count').textContent = d.sessions.total;

    // Models
    document.getElementById('free-model').textContent = d.models.free;
    document.getElementById('pro-model').textContent = d.models.pro;
    document.getElementById('device').textContent = d.device.toUpperCase();

  }} catch(e) {{
    console.error('Update error:', e);
  }}
}}

update();
setInterval(update, 3000);
</script>
</body>
</html>"""


@router.get("/")
async def root():
    return {"message": "Gerçek Zamanlı Video Çeviri API - /ws/translate/{session_id} adresine WebSocket bağlan"}
