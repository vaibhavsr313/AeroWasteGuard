import cv2
import socket
import threading
from ultralytics import YOLO
from flask import Flask, Response, jsonify
from flask_cors import CORS

# ─── Flask app ───────────────────────────────────────────────
app = Flask(__name__)
CORS(app)  # allow browser dashboard to call this

# ─── Shared state (updated by detection threads) ──────────────
state = {
    "fire_detected": False,
    "smoke_detected": False,
    "fire_labels":   [],
    "gas_detected":  False,
    "gas_level":     "None",
    "gas_raw":       "Connecting...",
    "latest_frame":  None,
    "frame_lock":    threading.Lock()
}

# ─── YOLO model ───────────────────────────────────────────────
model = YOLO(r"C:\BE\Project\Models\fire\runs\detect\train2\weights\best.pt")

CONFIDENCE_THRESHOLD = 0.5

# ─── RTSP stream from Pi ──────────────────────────────────────
STREAM_URL = "rtsp://192.168.174.20:8554/cam"

# ─── Gas sensor thread ────────────────────────────────────────
def receive_gas():
    while True:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.connect(('192.168.174.20', 9999))
            print("[GAS] Connected to Pi sensor")
            buffer = ""
            while True:
                data = s.recv(1024).decode()
                if not data:
                    break
                buffer += data
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if line:
                        state["gas_raw"]      = line
                        state["gas_detected"] = "GAS DETECTED" in line
                        # Derive level from raw string
                        if "GAS DETECTED" in line:
                            state["gas_level"] = "High"
                        else:
                            state["gas_level"] = "None"
                        print(f"[GAS] {line}")
        except Exception as e:
            print(f"[GAS] Disconnected: {e} — retrying in 3s")
            state["gas_raw"]      = "Sensor offline"
            state["gas_detected"] = False
            state["gas_level"]    = "None"
        import time; time.sleep(3)

# ─── Fire detection + frame capture thread ────────────────────
def run_detection():
    cap = cv2.VideoCapture(STREAM_URL, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    if not cap.isOpened():
        print("[DETECTION] Cannot open RTSP stream")
        return

    print("[DETECTION] Stream opened")

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[DETECTION] Stream lost, retrying...")
            cap.release()
            import time; time.sleep(2)
            cap = cv2.VideoCapture(STREAM_URL, cv2.CAP_FFMPEG)
            continue

        cap.grab()  # drop one frame to stay live

        frame_resized = cv2.resize(frame, (640, 480))
        results = model(frame_resized, verbose=False)

        # NEW
        fire_detected  = False
        smoke_detected = False
        fire_labels    = []

        for result in results:
            for box in result.boxes:
                conf = float(box.conf[0])
                if conf >= CONFIDENCE_THRESHOLD:
                    cls   = int(box.cls[0])
                    label = model.names[cls].lower()
                    fire_labels.append(f"{label} {conf:.2f}")
                    print(f"[DETECTION] {label} | Conf: {conf:.2f}")
                    if "fire" in label:
                        fire_detected = True
                    elif "smoke" in label:
                        smoke_detected = True
                    # anything else (e.g. "other") is ignored

        state["fire_detected"]  = fire_detected
        state["smoke_detected"] = smoke_detected
        state["fire_labels"]    = fire_labels

        # Annotate frame
        annotated = results[0].plot(conf=CONFIDENCE_THRESHOLD)

        # Gas overlay on frame
        overlay_color = (0, 0, 255) if state["gas_detected"] else (0, 200, 0)
        cv2.rectangle(annotated, (0, 0), (420, 45), (0, 0, 0), -1)
        cv2.putText(annotated, f"GAS: {state['gas_raw']}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, overlay_color, 2)

        # Encode frame as JPEG for MJPEG stream
        _, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 70])

        with state["frame_lock"]:
            state["latest_frame"] = buffer.tobytes()

# ─── Flask routes ─────────────────────────────────────────────

def generate_mjpeg():
    """Yields MJPEG frames for the /video_feed route."""
    while True:
        with state["frame_lock"]:
            frame = state["latest_frame"]
        if frame is None:
            import time; time.sleep(0.05)
            continue
        yield (
            b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n'
        )

@app.route('/video_feed')
def video_feed():
    return Response(
        generate_mjpeg(),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )

# NEW
@app.route('/api/fire')
def api_fire():
    return jsonify({
        "fire":  state["fire_detected"],
        "smoke": state["smoke_detected"],
    })

@app.route('/api/gas')
def api_gas():
    return jsonify({
        "detected": state["gas_detected"],
        "level":    state["gas_level"],
        "raw":      state["gas_raw"]
    })

@app.route('/api/status')
def api_status():
    return jsonify({"online": True})

# ─── Start everything ─────────────────────────────────────────
if __name__ == '__main__':
    threading.Thread(target=receive_gas, daemon=True).start()
    threading.Thread(target=run_detection, daemon=True).start()

    print("=" * 50)
    print("Detection server running on http://localhost:5000")
    print("  Stream:  http://localhost:5000/video_feed")
    print("  Fire:    http://localhost:5000/api/fire")
    print("  Gas:     http://localhost:5000/api/gas")
    print("=" * 50)

    app.run(host='0.0.0.0', port=5000, threaded=True)