"""Load test:  pip install locust pillow
   locust -f loadtest/locustfile.py --host https://<your-api>.azurecontainerapps.io
   Open http://localhost:8089, try 50 -> 200 users and watch replicas scale in Azure."""
import io
from locust import HttpUser, task, between
from PIL import Image

def sample():
    b = io.BytesIO(); Image.new("RGB", (640, 480), (90, 120, 80)).save(b, "JPEG"); return b.getvalue()

IMG = sample()

class User(HttpUser):
    wait_time = between(0.5, 2)
    @task(1)
    def health(self): self.client.get("/api/health")
    @task(1)
    def stats(self): self.client.get("/api/stats")
    @task(4)
    def predict(self):
        self.client.post("/api/predict", files={"image": ("t.jpg", IMG, "image/jpeg")})
