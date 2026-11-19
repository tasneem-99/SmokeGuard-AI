import io, os, sys
os.environ["DB_PATH"] = ":memory:"; os.environ["MODEL_PATH"] = "does-not-exist.pt"
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import app as smokeguard
from PIL import Image

client = smokeguard.app.test_client()

def img():
    b = io.BytesIO(); Image.new("RGB", (64, 64), "gray").save(b, "PNG"); b.seek(0); return b

def test_health():
    assert client.get("/api/health").get_json()["status"] == "ok"

def test_predict_requires_image():
    assert client.post("/api/predict").status_code == 400

def test_predict_rejects_bad_ext():
    r = client.post("/api/predict", data={"image": (io.BytesIO(b"x"), "a.txt")})
    assert r.status_code == 400

def test_predict_ok_has_dashboard_fields():
    r = client.post("/api/predict", data={"image": (img(), "t.png")}, content_type="multipart/form-data")
    j = r.get_json(); assert r.status_code == 200
    assert "class" in j and "confidence" in j and j["mock"] is True
