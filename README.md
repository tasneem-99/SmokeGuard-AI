# SmokeGuard AI - Forest Fire & Smoke Detection on Azure

React dashboard + Flask/YOLOv8 API + Azure infrastructure as code + CI/CD.

```
backend/    Flask API (predict, incidents, stats, model-info), Dockerfile, tests
frontend/   React + Vite dashboard (real map, live stats, chart from stored incidents)
training/   Colab notebook: train YOLOv8 on D-Fire, export best.pt + metrics.json
infra/      main.bicep - ACR, Container Apps, Storage, Static Web App, Log Analytics
loadtest/   Locust scenario to prove autoscaling
docs/       ARCHITECTURE.md (diagram + design decisions)
.github/    deploy.yml - test, build, deploy
```

## 1. Run locally
```bash
# terminal 1
cd backend && python -m venv .venv && .venv\Scripts\activate   # Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt && python app.py               # http://localhost:8000/api/health
# terminal 2
cd frontend && npm install && npm run dev
```
Without `backend/models/best.pt` the API runs in **mock mode** (random results, clearly labelled).

## 2. Train the model (real AI)
Open `training/train_yolov8_dfire.ipynb` in Google Colab (GPU), follow the first cell.
Copy `best.pt` and `metrics.json` into `backend/models/`. The dashboard "Model mAP@50" card reads `metrics.json`.

## 3. Deploy to Azure
```bash
az login
az group create -n smokeguard-rg -l westeurope
az deployment group create -g smokeguard-rg -f infra/main.bicep   # note the outputs
cd backend && az acr build -r <acrName> -t smokeguard-api:v1 .
az containerapp ingress update -n smokeguard-api -g smokeguard-rg --target-port 8000
az containerapp update -n smokeguard-api -g smokeguard-rg --image <acrName>.azurecr.io/smokeguard-api:v1
```
Then build the frontend with `VITE_API_BASE_URL=<apiUrl>` and deploy `dist` to the Static Web App.
For CI/CD add repo secrets: `AZURE_CREDENTIALS`, `ACR_NAME`, `API_URL`, `SWA_TOKEN`.

## 4. Prove scalability
`pip install locust pillow` then `locust -f loadtest/locustfile.py --host <apiUrl>`.
Screenshot Locust (RPS / latency) and the Container App replica count in the portal for the report.

## Team split (from your plan)
Frontend -> `frontend/` | AI -> `training/` | Backend -> `backend/` | Cloud -> `infra/` + `.github/` | Integration -> tests + loadtest
## Cloud Deployment – Member 5

### Deployment Platform
The SmokeGuard AI application was deployed using **Streamlit Community Cloud**.

### Live Application
[Open SmokeGuard AI](https://smokeguard-ai-5yzydkbxr5dd3x8wben2yc.streamlit.app/)

### Source Code
[GitHub Repository – SmokeGuard AI](https://github.com/tasneem-99/SmokeGuard-AI)

### Deployment Configuration
- **Platform:** Streamlit Community Cloud
- **Repository:** `tasneem-99/SmokeGuard-AI`
- **Branch:** `main`
- **Main application file:** `backend/streamlit_app/app.py`
- **Python version:** 3.11
- **AI Model:** YOLOv8
- **Supported classes:** Smoke and Fire

### Testing and Verification
The deployed application was opened and tested successfully.

The following tests were performed:
1. Application accessibility through the public cloud URL.
2. Smoke image upload and detection.
3. Fire image upload and detection.
4. Verification of the displayed detection results.

### Deployment Evidence
Screenshots of the application and detection results are available in:

`documentation/deployment screenshots/`

### Member 5 Responsibilities
- Prepared cloud deployment configuration.
- Configured the Streamlit deployment.
- Verified the public application URL.
- Tested the deployed application.
- Collected deployment and testing evidence.

### Deployment Note
The deployed Streamlit application is a cloud-hosted demonstration of SmokeGuard AI. The main React frontend and Flask backend are separate components and are not represented by this Streamlit deployment.
