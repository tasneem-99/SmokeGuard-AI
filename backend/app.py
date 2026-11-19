
"""SmokeGuard AI - Flask API (Azure-ready)
Endpoints:
  GET  /api/health
  POST /api/predict     (multipart: image, optional lat, lon, location)
  GET  /api/incidents
  GET  /api/stats
"""
import io, json, os, random, sqlite3, uuid
from datetime import datetime, timezone

from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image, ImageOps

# ---------- Config (from environment) ----------
MODEL_PATH = os.getenv("MODEL_PATH", "models/best.pt")
CONF_THRESHOLD = float(os.getenv("CONF_THRESHOLD", "0.35"))
DB_PATH = os.getenv("DB_PATH", "smokeguard.db")
AZURE_CONN = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
BLOB_CONTAINER = os.getenv("BLOB_CONTAINER", "uploads")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
MAX_MB = int(os.getenv("MAX_UPLOAD_MB", "8"))
ALLOWED_EXT = {"jpg", "jpeg", "png", "webp"}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_MB * 1024 * 1024
CORS(app, origins=ALLOWED_ORIGINS)

# ---------- Model (YOLO if weights exist, else clearly-flagged mock) ----------
model = None
try:
    if os.path.exists(MODEL_PATH):
        from ultralytics import YOLO
        model = YOLO(MODEL_PATH)
        print(f"[model] loaded {MODEL_PATH}")
    else:
        print(f"[model] {MODEL_PATH} not found -> MOCK mode")
except Exception as e:  # keep API alive even if model fails
    print("[model] failed to load:", e)

def run_inference(img: Image.Image):
    """Returns list of detections: {label, confidence, bbox:[x1,y1,x2,y2] normalized}."""
    if model is None:
        if random.random() < 0.5:
            return []
        return [{"label": random.choice(["fire", "smoke"]),
                 "confidence": round(random.uniform(0.5, 0.95), 2),
                 "bbox": [0.3, 0.3, 0.7, 0.7]}]
    res = model.predict(img, conf=CONF_THRESHOLD, verbose=False)[0]
    w, h = img.size
    out = []
    for b in res.boxes:
        x1, y1, x2, y2 = b.xyxy[0].tolist()
        out.append({"label": res.names[int(b.cls)],
                    "confidence": round(float(b.conf), 3),
                    "bbox": [x1 / w, y1 / h, x2 / w, y2 / h]})
    return out

def risk_level(dets):
    fire = [d["confidence"] for d in dets if d["label"] == "fire"]
    smoke = [d["confidence"] for d in dets if d["label"] == "smoke"]
    if fire and max(fire) >= 0.6: return "High"
    if fire or (smoke and max(smoke) >= 0.6): return "Medium"
    if smoke: return "Low"
    return "None"

# ---------- Storage (Azure Blob, or local folder fallback) ----------
def save_image(raw: bytes, ext: str) -> str:
    name = f"{datetime.now(timezone.utc):%Y%m%d}/{uuid.uuid4().hex}.{ext}"
    if AZURE_CONN:
        from azure.storage.blob import BlobServiceClient
        svc = BlobServiceClient.from_connection_string(AZURE_CONN)
        svc.get_blob_client(BLOB_CONTAINER, name).upload_blob(raw, overwrite=True)
        return f"blob://{BLOB_CONTAINER}/{name}"
    path = os.path.join("uploads", name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f: f.write(raw)
    return path

# ---------- Database ----------
# Azure Table Storage when AZURE_STORAGE_CONNECTION_STRING is set (shared across all
# replicas, survives restarts). Otherwise SQLite for local development.
COLS = ["id", "created_at", "label", "confidence", "risk", "location", "lat", "lon", "image"]
_table = None

def table():
    global _table
    if _table is None:
        from azure.data.tables import TableServiceClient
        svc = TableServiceClient.from_connection_string(AZURE_CONN)
        svc.create_table_if_not_exists("incidents")
        _table = svc.get_table_client("incidents")
    return _table

def db():
    c = sqlite3.connect(DB_PATH); c.row_factory = sqlite3.Row; return c

if not AZURE_CONN:
    with db() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS incidents(
            id TEXT PRIMARY KEY, created_at TEXT, label TEXT, confidence REAL,
            risk TEXT, location TEXT, lat REAL, lon REAL, image TEXT)""")

def insert_incident(rec):
    if AZURE_CONN:
        ms = int(datetime.fromisoformat(rec["created_at"]).timestamp() * 1000)
        ent = {"PartitionKey": "incident", "RowKey": f"{9999999999999 - ms:013d}_{rec['id']}"}
        ent.update({k: v for k, v in rec.items() if v is not None})
        table().create_entity(ent)
        return
    with db() as c:
        c.execute("INSERT INTO incidents VALUES(?,?,?,?,?,?,?,?,?)", [rec.get(k) for k in COLS])

def fetch_incidents(limit):
    if AZURE_CONN:  # RowKey is reverse-time, so newest come first
        out = []
        for e in table().query_entities("PartitionKey eq 'incident'", results_per_page=limit):
            out.append({k: e.get(k) for k in COLS})
            if len(out) >= limit: break
        return out
    with db() as c:
        rows = c.execute("SELECT * FROM incidents ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]

# ---------- Routes ----------
@app.get("/api/health")
def health():
    return jsonify(status="ok", model="yolo" if model else "mock",
                   storage="azure-blob" if AZURE_CONN else "local",
                   database="azure-table" if AZURE_CONN else "sqlite")

@app.post("/api/predict")
def predict():
    f = request.files.get("image")
    if not f: return jsonify(error="image field is required"), 400
    ext = (f.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXT: return jsonify(error="use jpg, png or webp"), 400
    raw = f.read()
    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    except Exception:
        return jsonify(error="invalid image"), 400

    dets = run_inference(img)
    risk = risk_level(dets)
    top = max(dets, key=lambda d: d["confidence"]) if dets else None
    result = {
        "id": uuid.uuid4().hex, "detections": dets, "risk": risk,
        # fields expected by the React dashboard
        "class": top["label"] if top else "no_fire",
        "confidence": top["confidence"] if top else 0.0,
        "detected": bool(dets), "mock": model is None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if top:  # store only real detections as incidents
        loc = request.form.get("location", "User image")
        lat = request.form.get("lat", type=float); lon = request.form.get("lon", type=float)
        image_ref = save_image(raw, ext)
        insert_incident({"id": result["id"], "created_at": result["created_at"],
            "label": top["label"], "confidence": top["confidence"], "risk": risk,
            "location": loc, "lat": lat, "lon": lon, "image": image_ref})
    return jsonify(result)

@app.get("/api/model-info")
def model_info():
    """Evaluation metrics written by the training notebook (models/metrics.json)."""
    p = os.path.join(os.path.dirname(MODEL_PATH) or ".", "metrics.json")
    if os.path.exists(p):
        with open(p) as f: return jsonify(json.load(f))
    return jsonify({})

@app.get("/api/incidents")
def incidents():
    limit = min(request.args.get("limit", 50, type=int), 200)
    return jsonify(fetch_incidents(limit))

@app.get("/api/stats")
def stats():
    rows = fetch_incidents(1000)
    fires = sum(1 for r in rows if r["label"] == "fire")
    return jsonify(total=len(rows), fires=fires, smoke=len(rows) - fires,
                   high_risk=sum(1 for r in rows if r["risk"] == "High"))

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 8000)), debug=True)
