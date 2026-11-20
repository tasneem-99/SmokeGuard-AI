# SmokeGuard AI – Cloud Deployment Documentation

## 1. Project Overview

SmokeGuard AI is an AI-powered Fire and Smoke Detection System. It uses a trained YOLO model to analyze uploaded images and identify fire and smoke.

The application provides:
- Fire and Smoke Detection.
- Image Upload and Analysis.
- Dashboard Statistics.
- Incident History.
- High-Risk Incident Monitoring.

## 2. Cloud Deployment

**Cloud Provider:** Streamlit Community Cloud

**GitHub Repository:**  
https://github.com/tasneem-99/SmokeGuard-AI

**Branch:** `main`

**Main Application File:**  
`backend/streamlit_app/app.py`

**Python Version:** `3.11`

**Live Application URL:**  
https://smokeguard-ai-5yzydkbxr5dd3x8wben2yc.streamlit.app/

## 3. Deployment Steps

1. The project source code was uploaded to GitHub.
2. The GitHub repository was connected to Streamlit Community Cloud.
3. The `main` branch was selected.
4. The application entry point was configured as `backend/streamlit_app/app.py`.
5. Python 3.11 was selected as the runtime version.
6. Required Python packages and system dependencies were configured.
7. The application was deployed to Streamlit Community Cloud.
8. The deployed application was opened and tested using its public URL.

## 4. Dependencies and Configuration

The deployment uses the following configuration files:

- `backend/streamlit_app/requirements.txt`: Python dependencies.
- `packages.txt`: Required system packages.
- `backend/streamlit_app/app.py`: Main Streamlit application.

The application uses the trained YOLO model to detect fire and smoke in uploaded images.

## 5. Testing and Verification

The deployed application was tested successfully.

| Test | Result |
|---|---|
| Public application access | Passed |
| Fire image detection | Passed |
| Smoke image detection | Passed |
| Dashboard statistics | Passed |
| Incident History | Passed |
| Incident data after reopening the application | Passed |

## 6. Screenshots

Application screenshots are available in the GitHub repository under:

`documentation/deployment screenshots/`

The screenshots demonstrate:
- Application Home Page.
- Fire Detection.
- Smoke Detection.
- Dashboard interface.

## 7. Deployment Link

The publicly accessible application:

https://smokeguard-ai-5yzydkbxr5dd3x8wben2yc.streamlit.app/

## 8. Member 5 Responsibilities

Member 5 was responsible for:
- Cloud deployment.
- Deployment configuration.
- Application testing and verification.
- Checking public accessibility.
- Preparing deployment documentation and evidence.

## 9. Conclusion

SmokeGuard AI was successfully deployed using Streamlit Community Cloud. The public application was tested, and its main AI detection and dashboard features were verified.