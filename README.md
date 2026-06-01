# Army Personnel Recognition and Entry/Exit Tracking

Production-oriented FastAPI, OpenCV, InsightFace, YOLOv8, FAISS, MySQL, and React system for army personnel registration, live face recognition, unknown person review, and entry/exit attendance tracking.

## What Is Included

- FastAPI backend with JWT auth, role checks, Pydantic validation, SQLAlchemy ORM, Alembic migrations, WebSocket live events, and camera workers.
- Recognition pipeline: camera frame, YOLOv8 face detection, face crop extraction, InsightFace embeddings, FAISS vector search, attendance logging, and unknown face queue.
- React/Vite/Material UI frontend with live feed, camera controls, personnel management, unknown queue registration, and attendance filters.
- Docker, docker-compose, startup scripts, `.env.example`, tests, and migration scripts.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill credentials from your existing MySQL database only:

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=your_user
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=face_recognition
JWT_SECRET_KEY=long_random_secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=strong_password
```

3. Install backend dependencies:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

4. Apply migrations:

```powershell
alembic -c database/alembic.ini upgrade head
```

5. Start backend and frontend:

```powershell
.\scripts\start_backend.ps1
cd frontend
npm install
npm run dev
```

Backend runs at `http://localhost:8000`; frontend runs at `http://localhost:5173`.

## Docker

```powershell
docker compose up --build
```

The compose file includes MySQL for local deployment. For your existing MySQL database, keep the `.env` host/user/password pointed to that server and remove or ignore the `mysql` service as needed.

## API Endpoints

- `POST /auth/login`
- `POST /register`
- `POST /camera/start`
- `POST /camera/stop`
- `GET /attendance`
- `GET /unknown`
- `POST /unknown/register`
- `GET /personnel`
- `PATCH /personnel/{personnel_id}`
- `DELETE /personnel/{personnel_id}`
- `POST /personnel/{personnel_id}/retrain`
- `POST /recognize`
- `WebSocket /live`

## Model Notes

Place a YOLOv8 face model such as `yolov8n-face.pt` in the project root or adjust `backend/detection/yolo_face.py`. If YOLOv8 or InsightFace are unavailable during development, the service logs a warning and uses safe fallback behavior so the API can still boot. For production accuracy, install the listed ML dependencies and deploy with the real detector and InsightFace model cache available.

## Entry/Exit Logic

The system stores active presence per personnel. A first verified sighting creates an `ENTRY` log. Repeated detections inside the duplicate window update last seen without spam. If a person is seen again after `EXIT_ABSENCE_SECONDS`, the service creates an `EXIT` event and flips the active state.

## Security

Admin credentials, JWT secret, database credentials, thresholds, camera sources, and storage paths are environment-driven. Do not commit `.env`.
