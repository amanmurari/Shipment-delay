# ShipGuard AI

ShipGuard is a full-stack application featuring a React/Vite frontend and a Python backend, with MySQL for the database.

## Prerequisites

- [Docker](https://www.docker.com/get-started)
- [Docker Compose](https://docs.docker.com/compose/install/)

## Setting Up the Project

The easiest way to run the entire project is using Docker Compose. It will automatically build and start the frontend, backend, and MySQL database.

1. **Clone the repository** (if you haven't already) and navigate to the project root:
   ```bash
   cd shipment
   ```

2. **Start the application** using Docker Compose:
   ```bash
   docker-compose up --build
   ```

3. **Access the Application**:
   - **Frontend:** [http://localhost:5173](http://localhost:5173)
   - **Backend API:** [http://localhost:8000](http://localhost:8000)
   - **MySQL Database:** `localhost:3306` (User: `shipguard`, Password: `shipguard123`, DB: `shipguard_db`)

## Manual Setup (Without Docker)

If you prefer to run the services locally without Docker:

### Backend (Python)
```bash
cd backend
python -m venv venv

pip install -r requirements.txt

uvicorn app.main:app --reload 
```

### Frontend (React/Vite)
```bash
cd frontend
npm install
npm run dev
```

## Stopping the Project

To stop the Docker containers, press `Ctrl+C` in the terminal where it's running, or run:
```bash
docker-compose down
```
