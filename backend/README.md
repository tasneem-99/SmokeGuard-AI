# SmokeGuard AI - Backend

## Run locally
    python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
    pip install -r requirements.txt
    python app.py
    # test
    curl http://localhost:8000/api/health
    curl -F image=@forest.jpg http://localhost:8000/api/predict

Put your trained YOLO weights at `models/best.pt`. Without it the API runs in
**mock mode** (health shows "mock", and every /predict response has `"mock": true`).

## Docker
    docker build -t smokeguard-api .
    docker run -p 8000:8000 smokeguard-api

## Deploy to Azure Container Apps (next step)
    az group create -n smokeguard-rg -l westeurope
    az acr create -n <uniqueacr> -g smokeguard-rg --sku Basic
    az acr build -t smokeguard-api:v1 -r <uniqueacr> .
    az containerapp up -n smokeguard-api -g smokeguard-rg --image <uniqueacr>.azurecr.io/smokeguard-api:v1 --ingress external --target-port 8000
