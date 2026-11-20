
from pathlib import Path
import sqlite3
from datetime import datetime

import streamlit as st
from PIL import Image, ImageDraw
from ultralytics import YOLO

# ---------- Page settings ----------
st.set_page_config(
    page_title="SmokeGuard AI",
    page_icon="🔥",
    layout="wide"
)

# ---------- Paths ----------
PROJECT_DIR = Path(__file__).resolve().parents[1]
MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "best.pt"
DB_PATH = Path(__file__).resolve().parent / "incidents.db"

# ---------- Database ----------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT,
            label TEXT,
            confidence REAL,
            risk TEXT,
            location TEXT
        )
    """)
    return conn


def save_incident(label, confidence, risk, location):
    conn = get_db()
    conn.execute(
        """INSERT INTO incidents
        (created_at, label, confidence, risk, location)
        VALUES (?, ?, ?, ?, ?)""",
        (
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            label,
            confidence,
            risk,
            location
        )
    )
    conn.commit()
    conn.close()


# ---------- Load YOLO model ----------
@st.cache_resource
def load_model():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")
    return YOLO(str(MODEL_PATH))


# ---------- Risk assessment ----------
def calculate_risk(detections):
    fire = [d["confidence"] for d in detections if d["label"] == "fire"]
    smoke = [d["confidence"] for d in detections if d["label"] == "smoke"]

    if fire and max(fire) >= 0.6:
        return "High"
    if fire or (smoke and max(smoke) >= 0.6):
        return "Medium"
    if smoke:
        return "Low"
    return "None"


# ---------- Header ----------
st.title("🔥 SmokeGuard AI")
st.subheader("AI-Powered Fire and Smoke Detection")
st.write(
    "Upload an image to detect fire and smoke using a trained YOLO model."
)

# ---------- Dashboard statistics ----------
conn = get_db()
rows = conn.execute(
    "SELECT label, risk FROM incidents"
).fetchall()
conn.close()

total = len(rows)
fires = sum(1 for row in rows if row[0] == "fire")
smokes = sum(1 for row in rows if row[0] == "smoke")
high_risk = sum(1 for row in rows if row[1] == "High")

c1, c2, c3, c4 = st.columns(4)
c1.metric("Total Incidents", total)
c2.metric("Fire Incidents", fires)
c3.metric("Smoke Incidents", smokes)
c4.metric("High Risk", high_risk)

st.divider()

# ---------- Image upload ----------
st.header("📷 Analyze an Image")

uploaded_file = st.file_uploader(
    "Choose an image",
    type=["jpg", "jpeg", "png", "webp"]
)

location = st.text_input("Location (optional)", "User image")

if uploaded_file is not None:
    original_image = Image.open(uploaded_file).convert("RGB")

    st.image(
        original_image,
        caption="Uploaded Image",
        use_container_width=True
    )

    if st.button("Analyze Image", type="primary"):
        try:
            with st.spinner("Loading AI model and analyzing image..."):
                model = load_model()
                result = model.predict(
                    original_image,
                    conf=0.35,
                    verbose=False
                )[0]

            detections = []
            annotated_image = original_image.copy()
            draw = ImageDraw.Draw(annotated_image)

            for box in result.boxes:
                label = result.names[int(box.cls[0])]
                confidence = float(box.conf[0])

                x1, y1, x2, y2 = box.xyxy[0].tolist()

                detections.append({
                    "label": label,
                    "confidence": confidence
                })

                draw.rectangle(
                    (x1, y1, x2, y2),
                    outline="red",
                    width=4
                )
                draw.text(
                    (x1, max(0, y1 - 20)),
                    f"{label}: {confidence:.1%}",
                    fill="red"
                )

            risk = calculate_risk(detections)

            st.session_state["analysis"] = {
                "detections": detections,
                "risk": risk,
                "image": annotated_image
            }

            if detections:
                top = max(detections, key=lambda d: d["confidence"])
                save_incident(
                    top["label"],
                    top["confidence"],
                    risk,
                    location
                )

        except Exception as error:
            st.error(f"Analysis failed: {error}")

# ---------- Analysis results ----------
if "analysis" in st.session_state:
    analysis = st.session_state["analysis"]

    st.divider()
    st.header("📊 Analysis Results")

    st.image(
        analysis["image"],
        caption="Detection Results",
        use_container_width=True
    )

    risk = analysis["risk"]

    if risk == "High":
        st.error("HIGH RISK: Fire or smoke requires immediate attention.")
    elif risk == "Medium":
        st.warning("MEDIUM RISK: Potential fire or smoke detected.")
    elif risk == "Low":
        st.info("LOW RISK: Smoke detected.")
    else:
        st.success("No fire or smoke detected.")

    if analysis["detections"]:
        st.subheader("Detected Objects")

        st.dataframe(
            [
                {
                    "Class": d["label"],
                    "Confidence": f"{d['confidence']:.1%}"
                }
                for d in analysis["detections"]
            ],
            use_container_width=True
        )
    else:
        st.write("No objects detected.")

# ---------- Incident history ----------
st.divider()
st.header("📋 Incident History")

conn = get_db()
history = conn.execute("""
    SELECT created_at, label, confidence, risk, location
    FROM incidents
    ORDER BY id DESC
    LIMIT 50
""").fetchall()
conn.close()

if history:
    st.dataframe(
        [
            {
                "Date": row[0],
                "Detection": row[1],
                "Confidence": f"{row[2]:.1%}",
                "Risk": row[3],
                "Location": row[4]
            }
            for row in history
        ],
        use_container_width=True
    )
else:
    st.info("No incidents recorded yet.")

st.caption("SmokeGuard AI | Fire and Smoke Detection System")
